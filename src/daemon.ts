// pi-host daemon: the persistent durable-agent host, phase 0 = the Matrix
// steer surface on top of the durable harness.
//
// ONE process owns the durable storage and the Matrix connection — the
// harness contract is "one process owns a storage at a time" — so this daemon
// is both. It:
//   - long-polls /sync once for ALL joined rooms (no SDK, raw CS API, the same
//     architecture as Hermes's Python matrix adapter),
//   - routes by room (src/rooms.ts): a room bound to a project steers that
//     project's own persistent conversation, the configured room steers
//     pi-spike, and every other joined room steers nothing (the bot idles in
//     household rooms as a plain user) — except `/project`, which is typed in the
//     room it is meant to bind,
//   - maps messages into durable submissions (core/steer.ts: plain text =
//     follow-up, /steer joins the live run, /note appends silently),
//   - scaffolds and binds projects (src/projects.ts): `/project new` makes a
//     directory (mkdir + git init + starter AGENTS.md), `/project bind` adopts an
//     existing one, `/project list` shows the registry. A project's instructions
//     are its own AGENTS.md, re-read on EVERY request, never a copy in the registry,
//   - emotes 👀 on every accepted message as soon as it is read, so the room sees
//     receipt while the model is still working,
//   - threads every reply onto the message being answered (m.in_reply_to), in the
//     room that message came from,
//   - /stop aborts the conversation the room steers; /status reports its queue,
//   - /usage, /balance, /models and /embed answer from the Ollama APIs (account
//     spend, credit, the public model catalogue, and local embeddings) — one
//     upstream call per command, threaded replies, failures reported not fatal,
//   - pumps each WATCHED conversation's assistant messages into the room bound to
//     it: one pump per conversation, one cursor per conversation,
//   - keeps a durable per-conversation cursor doc so a crash between "answer
//     committed" and "reply sent" replays the reply (at least once) on boot,
//     and never replays anything the cursor already covered.
//
// Run from the repo root (keys via env, never argv or a file here):
//   OLLAMA_API_KEY=... MATRIX_ACCESS_TOKEN=... MATRIX_ROOM='!...:jacks.im' \
//     npm run daemon
//
// Env contract (Hermes-adapter-compatible names where they overlap):
//   MATRIX_HOMESERVER        default http://conduit:6167 (container-internal DNS)
//   MATRIX_ACCESS_TOKEN      required — bot account token (admin-provisioned)
//   MATRIX_ROOM              required — room id or #alias to steer through
//   MATRIX_ALLOWED_USERS     required for anything to happen: comma list of
//                            @user:server allowed to steer. Unset = deaf
//                            (fail-safe; every non-allowed sender logged once).
//   PROJECTS_DIR             default <PI_HOST_SANDBOX>/../projects — where
//                            `/project new` puts a project whose message carried
//                            no path (a relative path resolves against it too)
//   OLLAMA_API_KEY           required
//   OLLAMA_MODEL             default deepseek-v4.1-flash
//   OLLAMA_BASE_URL          default https://ollama.com/v1
//   OLLAMA_CONTEXT_WINDOW    default 131072  (deepseek-v4.1-flash:cloud's real
//                            window; the provider registry under-reports it, so
//                            compaction and maxTokens are set from here)
//   OLLAMA_EMBED_BASE_URL    default http://127.0.0.1:11434 — the LOCAL server:
//                            ollama.com serves no embedding models at all
//   OLLAMA_EMBED_MODEL       optional; otherwise the first installed *embed*
//                            model on OLLAMA_EMBED_BASE_URL
//                            card is 128K context / 16.4K out; the earlier
//                            32768 default made compaction fire after nearly
//                            every tool round, and a summarization call that
//                            returns no text then fails the whole run,
//                            model_error. Match the real window: far fewer
//                            summarization calls. OLLAMA_MAX_TOKENS default 16384)
//   PI_HOST_DB               default ./storage/session.sqlite (renamed from
//                            the spike's STEER_DB; durable ledger of the host)
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { defineDoc, Harness, InboxDoc, type ConversationId, type Submission } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { dirname, resolve } from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";
import { createAgentEnv } from "./env.ts";
import {
	ACK_REACTION,
	classifySyncBatch,
	createReplyPump,
	roomShort,
	submitMatrixCommand,
	type EventId,
	type MatrixCommand,
} from "./core/steer.ts";
import { createRoomRouter } from "./rooms.ts";
import {
	createProjects,
	EMPTY_PROJECTS,
	ProjectsDoc,
	type ProjectOutcome,
	type ProjectsApi,
} from "./projects.ts";
import { createMatrixClient } from "./surfaces/matrix-client.ts";
import { createOllamaApi, NoEmbeddingModelError } from "./ollama_api.ts";
import { envGit, createSubagents } from "./subagents.ts";
import { formatBalance, formatEmbed, formatModels, formatUsage, USAGE_RANGES } from "./core/ollama-format.ts";
import { createSteerRegistry } from "./extensions.ts";
import { ollamaCloudProvider } from "./provider.ts";

const context = BACKGROUND_CONTEXT;
const log = (...parts: unknown[]) => console.log("[pi-host]", ...parts);

// --- transport journal ---
// The wall's health card reads `storage/daemon.log`, and `scripts/restart-daemon.sh`
// redirects this process's stdout into it. Transport events are written explicitly
// anyway: stdout is lost when the daemon is started by hand, and a timestamped line
// is the only forensic trail once a process dies. Both are kept; the journal line
// carries its own prefix so a doubled line in the file is not a mystery.
const journalPath = process.env.PI_HOST_LOG ?? "./storage/daemon.log";
function journal(line: string): void {
	try {
		appendFileSync(journalPath, `${new Date().toISOString()} pi-host transport ${line}\n`);
	} catch {
		// A journal that cannot be written must never take the daemon down.
	}
}
/** One line of an error, for the journal. */
const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// --- env + preflight (fail fast with one line per missing piece) ---
const env = {
	homeserver: process.env.MATRIX_HOMESERVER ?? "http://conduit:6167",
	accessToken: process.env.MATRIX_ACCESS_TOKEN ?? "",
	room: process.env.MATRIX_ROOM ?? "",
	allowedUsers: (process.env.MATRIX_ALLOWED_USERS ?? "")
		.split(",")
		.map((user) => user.trim())
		.filter(Boolean),
	ollamaApiKey: process.env.OLLAMA_API_KEY ?? "",
	ollamaModel: process.env.OLLAMA_MODEL ?? "deepseek-v4.1-flash",
	// The subagent model is separate from the main one and must also be registered
	// on the provider (see `extraModels`), or spawns fail `no_model`.
	subagentModel: process.env.SUBAGENT_MODEL ?? "glm-5.3-flash",
	ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "https://ollama.com/v1",
	ollamaEmbedBaseUrl: process.env.OLLAMA_EMBED_BASE_URL ?? "http://127.0.0.1:11434",
	ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? "",
	contextWindow: Number(process.env.OLLAMA_CONTEXT_WINDOW ?? 131072),
	maxTokens: Number(process.env.OLLAMA_MAX_TOKENS ?? 16384),
	db: process.env.PI_HOST_DB ?? "./storage/session.sqlite",
	sandbox: process.env.PI_HOST_SANDBOX ?? "./workspace",
	// Where `/project new` puts a project that names no path. Sibling of the
	// sandbox, so a project is never inside the umbrella it spawns from.
	projectsDir: process.env.PROJECTS_DIR ?? resolve(process.env.PI_HOST_SANDBOX ?? "./workspace", "..", "projects"),
};
const missing: string[] = [];
if (!env.accessToken) missing.push("MATRIX_ACCESS_TOKEN");
if (!env.room) missing.push("MATRIX_ROOM");
if (env.allowedUsers.length === 0) missing.push("MATRIX_ALLOWED_USERS (refusing to let anyone/everyone steer)");
if (!env.ollamaApiKey) missing.push("OLLAMA_API_KEY");
if (missing.length > 0) {
	console.error(`PREFLIGHT FAIL — missing env: ${missing.join(", ")}`);
	process.exit(2);
}
for (const requiredDir of [dirname(env.db), env.sandbox, env.projectsDir]) mkdirSync(requiredDir, { recursive: true });

// --- durable side ---
const models = createModels();
// Explicit field mapping: env uses ollama*-prefixed names, OllamaCloudOptions
// uses model/apiKey/baseUrl. Passing `env` whole once produced a provider whose
// model id was undefined — every generation then failed `no_model` (found via
// live ticker: models=[null]). tsc now rejects the whole-env call.
models.setProvider(
	ollamaCloudProvider({
		apiKey: env.ollamaApiKey,
		model: env.ollamaModel,
		// The subagent model must be in the registry too, or every spawn fails
		// `no_model` even though the account serves the model.
		extraModels: [env.subagentModel],
		baseUrl: env.ollamaBaseUrl,
		contextWindow: env.contextWindow,
		maxTokens: env.maxTokens,
	}),
);
// --- Matrix surface (needed by the subagent host before the registry) ---
const client = createMatrixClient({ homeserver: env.homeserver, accessToken: env.accessToken });
/**
 * The newest accepted inbound message PER ROOM: a reply threads onto the message
 * it answers, and each room has its own. Read at send time, so a message that
 * lands while the model is thinking still steers the thread. Multi-room since
 * round 5 — a project's answers must quote the project's room, never the main one.
 */
const lastInbound = new Map<string, EventId>();
/** The event a reply in `room` should quote, or `null` before any. */
const replyTargetFor = (room: string): EventId | null => lastInbound.get(room) ?? null;

/** The subagent runtime: named persistent children in their own worktrees. */
const subagents = createSubagents({
	provider: "ollama-cloud",
	model: env.subagentModel,
	maxTurns: Number(process.env.SUBAGENT_MAX_TURNS ?? 40),
	git: (args, cwd, execEnv, contextArg) => envGit(args, cwd, execEnv, contextArg),
	roomPost: async (text: string) => {
		try {
			// Reports thread in the MAIN room: a subagent is the main agent's child.
			return await client.sendText(env.room, text, replyTargetFor(env.room));
		} catch (error) {
			// subagents.ts reports the failure to the reporter task too; the journal is
			// what survives when nobody is watching the room.
			journal(`subagent room-post failed: ${reason(error)}`);
			throw error;
		}
	},
	log: (message: string) => log(`[subagent] ${message}`),
});
/**
 * The project system: rooms bound to persistent child conversations. Created
 * before the registry because a project agent must not select the subagent tool
 * (`hideExtensions`) — a project is a space, not a spawner.
 */
const projects = createProjects({
	provider: "ollama-cloud",
	model: env.ollamaModel,
	projectsDir: env.projectsDir,
	git: (args, cwd, execEnv, contextArg) => envGit(args, cwd, execEnv, contextArg),
	hideExtensions: [subagents.tools],
	env: (cwd) => createAgentEnv({ cwd }, env.sandbox),
	log: (message: string) => log(`[project] ${message}`),
});
const registry = createSteerRegistry(subagents, projects.extension);

/** Durable replay cursor for the reply pump: entry ids already sent to the room. Kept capped. */
const SteerCursor = defineDoc<{ ids: Array<string | number> }>({
	kind: "app.steer-cursor",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ ids: [] }),
});
const CURSOR_CAP = 200;

/**
 * Durable sync state: the `/sync` since cursor plus the ids of ingested events
 * (capped). First boot (batch null) skips the room backlog; restarts resume
 * from the stored batch; a homeserver replay of already-ingested events never
 * resubmits (classifySyncBatch in core/steer.ts holds the semantics).
 */
const SyncStateDoc = defineDoc<{ batch: string | null; seen: string[] }>({
	kind: "app.sync-state",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ batch: null, seen: [] }),
});

const db = await openNodeSqliteStorage(env.db);
const harness = await Harness.open(
	db,
	{ models, registry, env: (target) => createAgentEnv(target, env.sandbox), settings: { followUpMode: "all", steeringMode: "all" } },
	context,
);
const root = await harness.root(context, {
	agent: { model: { provider: "ollama-cloud", modelId: env.ollamaModel }, cwd: env.sandbox },
});
harness.resume(); // interrupted inputs stay pending; queued work restarts
log(`harness up: db=${env.db} conversation=${root.id} model=${env.ollamaModel}`);
journal(`harness up db=${env.db} conversation=${root.id} model=${env.ollamaModel}`);

// --- Matrix side ---
let joined: string | undefined;
try {
	joined = await client.joinRoom(env.room);
} catch (error) {
	// a homeserver that is merely unreachable right now must not kill the daemon;
	// the sync loop below keeps retrying and membership is idempotent
	log(`join attempt failed (will rely on sync retries): ${error instanceof Error ? error.message : error}`);
	journal(`join failed: ${reason(error)} (sync keeps retrying)`);
}
if (joined === undefined) {
	log(`WARN join failed for ${env.room} (id or #alias; the room must exist and invite the bot); continuing in case already member`);
	journal(`join failed ${env.room}: not a member (continuing)`);
} else {
	log(`joined ${joined}`);
	journal(`join ok ${joined}`);
}

/**
 * The Ollama query clients the /usage, /balance, /models and /embed commands use.
 * Separate from the model provider on purpose: the provider talks an
 * OpenAI-compatible chat API, these are the native account and embed endpoints.
 */
const ollamaApi = createOllamaApi({
	apiKey: env.ollamaApiKey,
	baseUrl: env.ollamaBaseUrl,
	embedBaseUrl: env.ollamaEmbedBaseUrl,
	embedModel: env.ollamaEmbedModel,
});

/** Allowed steerers; anything else is logged once per message and ignored. */
function allowed(sender: string): boolean {
	if (env.allowedUsers.includes(sender)) return true;
	log(`ignored: ${sender} is not in MATRIX_ALLOWED_USERS`);
	return false;
}

const seenEvents = new Set<string>();
/** Submission ids still being awaited, PER CONVERSATION, for the /status line. */
const pending = new Map<ConversationId, Set<string | number>>();
/**
 * pi-spike is a normal user of the wider setup and can be invited anywhere;
 * only the configured room steers it. `joined` is the homeserver-resolved room id
 * (join returns it even for an #alias); env.room covers the literal form. Bound
 * project rooms are added to the route table by the registry, not this set.
 */
const mainRooms = new Set<string>([env.room]);
if (joined !== undefined) mainRooms.add(joined);

function pendingSet(conversation: ConversationId): Set<string | number> {
	let set = pending.get(conversation);
	if (set === undefined) {
		set = new Set<string | number>();
		pending.set(conversation, set);
	}
	return set;
}

function track(conversation: ConversationId, submission: Submission): void {
	const set = pendingSet(conversation);
	set.add(submission.id);
	void submission
		.wait(context)
		.catch((error: unknown) => log(`submission ${submission.id} wait ended: ${error instanceof Error ? error.message : error}`))
		.finally(() => set.delete(submission.id));
}

const pendingCount = (conversation: ConversationId): number => pending.get(conversation)?.size ?? 0;

/** Send one threaded control reply into `room`. A failed send is logged, never fatal. */
async function reply(room: string, text: string, replyTo: EventId): Promise<void> {
	try {
		await client.sendText(room, text, replyTo);
	} catch (error) {
		log(`control reply failed: ${error instanceof Error ? error.message : error}`);
	}
}

/**
 * Answer one Ollama query command. Exactly one upstream call per command —
 * /api/usage and /api/balance are limited to 10 req/min per user across keys, so
 * these are never polled or retried in a loop. Rendering is pure
 * (core/ollama-format.ts). A local server without an embedding model is a state
 * to report plainly, not an API failure, so it answers without the ❌.
 */
async function answerOllamaCommand(command: MatrixCommand, replyTo: EventId, room: string): Promise<void> {
	if (command.action === "usage-invalid") {
		await reply(room, `unknown /usage argument "${command.text}" — /usage [${USAGE_RANGES.join("|")}] [models]`, replyTo);
		return;
	}
	try {
		switch (command.action) {
			case "usage":
				await reply(room, formatUsage(await ollamaApi.usage(command.range, command.groupByModel)).join("\n"), replyTo);
				return;
			case "balance":
				await reply(room, formatBalance(await ollamaApi.balance()), replyTo);
				return;
			case "models":
				await reply(room, formatModels(await ollamaApi.tags()).join("\n"), replyTo);
				return;
			case "embed":
				await reply(room, formatEmbed(await ollamaApi.embed(command.content), 1), replyTo);
				return;
			default:
				return;
		}
	} catch (error) {
		if (error instanceof NoEmbeddingModelError) {
			await reply(room, error.message, replyTo);
			return;
		}
		const message = error instanceof Error ? error.message : String(error);
		log(`${command.action} failed: ${message}`);
		await reply(room, `❌ ${message}`, replyTo);
	}
}

// --- reply pumps: one per WATCHED conversation, one durable cursor each ---
// createReplyPump advances its cursor only for entries it actually delivered; a
// failed send leaves its entry outside the cursor and is retried by the next
// watch tick or at the next boot (at-least-once; the cursor doc is the whole
// state). Watching is per conversation, so the set is built at boot and grown by
// every successful bind — a project's answers have one room, and one pump.
const pumping = new Map<ConversationId, { stop(): Promise<unknown> }>();

/** The live handle of one conversation: the root is already open. */
async function conversationHandle(id: ConversationId) {
	return id === root.id ? root : harness.conversation(id, context);
}

/** Start (once) the pump that carries `conversation`'s answers into `room`. */
async function ensurePump(conversation: ConversationId, room: string): Promise<void> {
	if (pumping.has(conversation)) return;
	const handle = await conversationHandle(conversation);
	if (handle === undefined) {
		journal(`pump skipped: conversation ${conversation} has no handle`);
		return;
	}
	const pump = createReplyPump({
		sendText: (text, replyTo) => client.sendText(room, text, replyTo),
		replyTarget: () => replyTargetFor(room),
		loadCursor: async () => new Set((await harness.snapshot(SteerCursor, conversation, context))?.ids ?? []),
		saveCursor: async (ids) => {
			await handle.commit(async (tx) => {
				(await tx.doc(SteerCursor, conversation)).ids = [...ids].slice(-CURSOR_CAP);
			}, context);
		},
		log: (message) => {
			log(message);
			// The reply pump only logs undelivered answers: a transport failure, kept.
			journal(message);
		},
	});
	const watch = await handle.watch(context);
	watch.start(async (value) => {
		await pump(value.entries);
	});
	pumping.set(conversation, watch);
	log(`reply pump: conversation ${conversation} → room ${roomShort(room)}`);
	journal(`reply pump on conversation ${conversation} → ${room}`);
}

// --- projects: the registry, the commands, and the route table ---
const projectApi: ProjectsApi = {
	main: root.id,
	commit: (body) => root.commit(body, context),
	projects: async () => (await harness.snapshot(ProjectsDoc, root.id, context)) ?? EMPTY_PROJECTS,
};

/** The reply line for one bind. A bound conversation starts pumping right here. */
async function afterBind(outcome: ProjectOutcome): Promise<string> {
	if (!outcome.ok) return `❌ ${outcome.error}`;
	await ensurePump(outcome.conversation, outcome.room);
	return (
		`${outcome.created ? "created and bound" : "bound"} room ${roomShort(outcome.room)} → project ${outcome.name}, ` +
		`conversation ${outcome.conversation}, cwd ${outcome.cwd}${outcome.note}. ` +
		"Say something in this room to steer it."
	);
}

const router = createRoomRouter({
	client,
	mainRooms,
	mainConversation: root.id,
	registry: () => projectApi.projects(),
	allowed,
	submit: async (conversation, command) => {
		const handle = await conversationHandle(conversation);
		if (handle === undefined) throw new Error(`conversation ${conversation} has no handle`);
		track(conversation, await submitMatrixCommand(handle, command, context));
	},
	abort: async (conversation) => {
		const handle = await conversationHandle(conversation);
		if (handle === undefined) return `conversation ${conversation} has no handle`;
		// Withdraws queued inputs and marks live tasks; background work (subagent
		// anchors, project anchors) is left alone by the harness contract.
		await handle.abort(context);
		return `stopped (queued withdrawn; pending before stop: ${pendingCount(conversation)})`;
	},
	status: async (conversation) => {
		const inbox = await harness.snapshot(InboxDoc, conversation, context);
		return `status: ${pendingCount(conversation)} settled-or-running, inbox ${inbox?.items.length ?? 0} queued`;
	},
	ollama: (command, replyTo, room) => {
		// Not awaited: an upstream timeout must not stall the sync loop. The helper
		// never throws, it replies (threaded) whatever happens.
		void answerOllamaCommand(command, replyTo, room);
	},
	project: {
		create: async (name, path, room) => afterBind(await projects.create(name, path, room, projectApi)),
		bind: async (name, path, room) => afterBind(await projects.bind(name, path, room, projectApi)),
		list: () => projects.list(projectApi),
	},
	seen: seenEvents,
	lastInbound,
	log: (line) => log(line),
});

// Boot: the main room's conversation always pumps; every already-bound project
// starts pumping again (its cursor doc makes the restart a replay, not a repeat).
await ensurePump(root.id, joined ?? env.room);
for (const [name, record] of Object.entries((await projectApi.projects()).projects)) {
	log(`project ${name}: room ${roomShort(record.room)} → conversation ${record.conversation} (cwd ${record.cwd})`);
	await ensurePump(record.conversation, record.room);
}

// --- sync loop ---
let durableSync: { batch: string | null; seen: string[] } =
	(await harness.snapshot(SyncStateDoc, root.id, context)) ?? { batch: null, seen: [] };
let cursor = durableSync.batch ?? "";
let iterations = 0;
const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());
process.on("unhandledRejection", (reason) => log(`unhandledRejection (daemon stays up): ${reason}`));

log(`syncing ${env.room} (and every bound project room) on ${env.homeserver}; ctrl-c to stop`);
try {
	while (!controller.signal.aborted) {
		try {
			const batch = await client.sync(cursor, iterations === 0 ? 0 : 30_000, controller.signal);
			iterations += 1;
			const classification = classifySyncBatch(durableSync, seenEvents, batch.textEvents);
			if (classification.skipBacklog) {
				if (batch.textEvents.length > 0) {
					log(`first boot: skipping ${batch.textEvents.length} backlog events (only messages sent after the daemon starts steer it)`);
				}
			} else {
				// One router, every room: it decides from the registry which room steers
				// what and drops the rest without a word.
				for (const event of classification.fresh) await router.handleEvent(event);
			}
			// every batch event counts as seen by this process, skipped backlog included
			for (const event of batch.textEvents) seenEvents.add(event.id);
			// process first, persist after: a crash in between replays at most once, never skips
			durableSync = { batch: batch.nextBatch, seen: classification.durableSeen };
			await root.commit(async (tx) => {
				const doc = await tx.doc(SyncStateDoc, root.id);
				doc.batch = batch.nextBatch;
				doc.seen = classification.durableSeen;
			}, context);
			cursor = batch.nextBatch;
		} catch (error) {
			if (controller.signal.aborted) break;
			const cause = (error as { cause?: unknown }).cause;
			const causeText = cause instanceof Error ? (cause as Error & { code?: string }).code ?? cause.message : undefined;
			log(`sync error: ${error instanceof Error ? error.message : error} (${causeText ?? "no cause"}); retrying in 5s`);
			// A watchdog abort is a sync error too, but a different animal: the edge
			// accepted the long-poll and then dropped it (the 2026-10-28 freeze). Name it.
			const aborted =
				error instanceof Error &&
				(error.name === "AbortError" || error.name === "TimeoutError" || /abort|timed? ?out/i.test(error.message));
			journal(`${aborted ? "watchdog abort" : "sync error"}: ${reason(error)} (cause: ${causeText ?? "no cause"})`);
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}
} finally {
	await harness.close(context);
	journal("harness down: closed");
	log("harness closed; bye");
}
export {};