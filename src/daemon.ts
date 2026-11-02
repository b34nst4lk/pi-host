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
import type { Context } from "@earendil-works/chord";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	defineDoc,
	Harness,
	InboxDoc,
	type ConversationId,
	type EnvTarget,
	type Submission,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createAgentEnv, gitPushFor } from "./env.ts";
import { ACK_REACTION, roomShort, submitMatrixCommand, type EventId } from "./core/steer.ts";
import { createRoomRouter, roomForConversation } from "./rooms.ts";
import { createProjects, type ProjectOutcome, type ProjectsApi } from "./projects.ts";
import { EMPTY_PROJECTS, ProjectDoc, ProjectsDoc, type ProjectsState } from "./project-registry.ts";
import { createMatrixClient } from "./surfaces/matrix-client.ts";
import { createOllamaApi } from "./ollama_api.ts";
import { envGit } from "./git.ts";
import { createSubagents } from "./subagents.ts";
import { createSteerRegistry } from "./extensions.ts";
import { ollamaCloudProvider } from "./provider.ts";
import { env, journal, log, preflight, reason } from "./daemon-env.ts";
import { answerOllamaCommand } from "./ollama-commands.ts";
import { createPumps } from "./pumps.ts";
import { runSyncLoop, SyncStateDoc } from "./sync-loop.ts";

const context = BACKGROUND_CONTEXT;
preflight(env);

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

/**
 * Where a subagent's report is posted: the room bound to the conversation that
 * SPAWNED it (a project's agent spawns from its own conversation), the main room
 * otherwise. A subagent of the main agent reports into the main room.
 *
 * The registry is read at SEND time — a spawn is a long-lived task and a bind or
 * rebind can happen while it runs — so the reader is injected once the harness
 * is open, below.
 */
let projectRegistry: (() => Promise<ProjectsState>) | undefined;
async function reportRoom(conversation: ConversationId): Promise<string> {
	if (projectRegistry === undefined) return env.room;
	try {
		return roomForConversation(await projectRegistry(), conversation) ?? env.room;
	} catch (error) {
		// A registry read that fails must not lose the report: the main room still hears it.
		journal(`subagent report room lookup failed: ${reason(error)}`);
		return env.room;
	}
}

/** The subagent runtime: named persistent children in their own worktrees. */
const subagents = createSubagents({
	provider: "ollama-cloud",
	model: env.subagentModel,
	maxTurns: env.subagentMaxTurns,
	git: (args, cwd, execEnv, contextArg) => envGit(args, cwd, execEnv, contextArg),
	roomPost: async (text: string, conversation: ConversationId) => {
		try {
			const room = await reportRoom(conversation);
			return await client.sendText(room, text, replyTargetFor(room));
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
 * The project system: rooms bound to persistent child conversations. A project
 * agent is a normal steer agent in its own directory, so it keeps the subagent
 * tool (`hideExtensions: []`): it fans work out into worktrees of ITS repository,
 * and those leaves report into the project's room (see `reportRoom`).
 */
const projects = createProjects({
	provider: "ollama-cloud",
	model: env.ollamaModel,
	projectsDir: env.projectsDir,
	git: (args, cwd, execEnv, contextArg) => envGit(args, cwd, execEnv, contextArg),
	hideExtensions: [],
	canPush: env.ghConfigDir.length > 0,
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

const db = await openNodeSqliteStorage(env.db);
/**
 * The tools' environment. Read per use, and the ONE place the push permission is
 * applied: a conversation whose `app.project` marker says `push: true` gets the
 * host's `gh` config dir, everything else (the main agent, subagents, projects
 * that never opted in) finds no credential at all.
 */
const agentEnv = async (target: EnvTarget, envContext: Context) => {
	if (env.ghConfigDir.length === 0) return createAgentEnv(target, env.sandbox);
	const marker = await target.read.snapshot(ProjectDoc, target.conversationId, envContext);
	return createAgentEnv(target, env.sandbox, { gitPush: gitPushFor(marker, env.ghConfigDir) });
};
const harness = await Harness.open(
	db,
	{ models, registry, env: agentEnv, settings: { followUpMode: "all", steeringMode: "all" } },
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

/** Send one control reply, threaded onto the message it answers. A failed send is never fatal. */
async function reply(room: string, text: string, replyTo: EventId): Promise<void> {
	try {
		await client.sendText(room, text, replyTo);
	} catch (error) {
		log(`control reply failed: ${error instanceof Error ? error.message : error}`);
	}
}

// --- reply pumps: one per WATCHED conversation, one durable cursor each ---
/** The live handle of one conversation: the root is already open. */
async function conversationHandle(id: ConversationId) {
	return id === root.id ? root : harness.conversation(id, context);
}

const pumps = createPumps({
	client,
	context,
	rootId: root.id,
	handle: conversationHandle,
	loadCursor: async (conversation) => (await harness.snapshot(SteerCursor, conversation, context))?.ids ?? undefined,
	saveCursor: async (conversation, ids) => {
		const handle = await conversationHandle(conversation);
		if (handle === undefined) return;
		await handle.commit(async (tx) => {
			(await tx.doc(SteerCursor, conversation)).ids = ids;
		}, context);
	},
	replyTarget: replyTargetFor,
	log,
	journal,
});

/** A bound conversation starts pumping right here, and again at every boot. */
const ensurePump = pumps.ensure;

// --- projects: the registry, the commands, and the route table ---
const projectApi: ProjectsApi = {
	main: root.id,
	commit: (body) => root.commit(body, context),
	projects: async () => (await harness.snapshot(ProjectsDoc, root.id, context)) ?? EMPTY_PROJECTS,
};
// From here on a subagent report finds its room: the registry decides, per spawner.
projectRegistry = () => projectApi.projects();

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
	joinRoom: (roomIdOrAlias: string) => client.joinRoom(roomIdOrAlias),
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
		void answerOllamaCommand(command, { api: ollamaApi, reply: (text) => reply(room, text, replyTo), log });
	},
	project: {
		create: async (name, path, room) => afterBind(await projects.create(name, path, room, projectApi)),
		bind: async (name, path, room) => afterBind(await projects.bind(name, path, room, projectApi)),
		push: (name, enabled) => projects.push(name, enabled, projectApi),
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
await runSyncLoop({
	context,
	root: {
		id: root.id,
		snapshot: () => harness.snapshot(SyncStateDoc, root.id, context),
		commit: async (batch, seen) => {
			await root.commit(async (tx) => {
				const doc = await tx.doc(SyncStateDoc, root.id);
				doc.batch = batch;
				doc.seen = seen;
			}, context);
		},
		close: () => harness.close(context),
	},
	sync: (since, timeoutMs, signal) => client.sync(since, timeoutMs, signal),
	joinRoom: (roomIdOrAlias: string) => client.joinRoom(roomIdOrAlias),
	handleEvent: (event) => router.handleEvent(event),
	seenEvents,
	room: env.room,
	homeserver: env.homeserver,
	log,
	journal,
	reason,
});
export {};
