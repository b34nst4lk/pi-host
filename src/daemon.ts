// pi-host daemon: the persistent durable-agent host, phase 0 = the Matrix
// steer surface on top of the durable harness.
//
// ONE process owns the durable storage and the Matrix connection — the
// harness contract is "one process owns a storage at a time" — so this daemon
// is both. It:
//   - long-polls /sync on one configured room (no SDK, raw CS API, the same
//     architecture as Hermes's Python matrix adapter),
//   - maps messages into durable submissions (core/steer.ts: plain text =
//     follow-up, /steer joins the live run, /note appends silently),
//   - emotes 👀 on every accepted message as soon as it is read, so the room sees
//     receipt while the model is still working,
//   - threads every reply onto the message being answered (m.in_reply_to),
//   - /stop aborts the conversation's ordinary work; /status reports queue state,
//   - pumps assistant messages from the watched transcript back into the room,
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
//   OLLAMA_API_KEY           required
//   OLLAMA_MODEL             default deepseek-v4.1-flash
//   OLLAMA_BASE_URL          default https://ollama.com/v1
//   OLLAMA_CONTEXT_WINDOW    default 131072  (deepseek-v4.1-flash:cloud's real
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
import { defineDoc, Harness, InboxDoc, type Submission } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { createAgentEnv } from "./env.ts";
import {
	ACK_REACTION,
	classifySyncBatch,
	createReplyPump,
	forRoom,
	pickNewEvents,
	parseMatrixCommand,
	submitMatrixCommand,
	type EventId,
	type TextEvent,
} from "./core/steer.ts";
import { createMatrixClient } from "./surfaces/matrix-client.ts";
import { createSteerRegistry } from "./extensions.ts";
import { ollamaCloudProvider } from "./provider.ts";

const context = BACKGROUND_CONTEXT;
const log = (...parts: unknown[]) => console.log("[pi-host]", ...parts);

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
	ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "https://ollama.com/v1",
	contextWindow: Number(process.env.OLLAMA_CONTEXT_WINDOW ?? 131072),
	maxTokens: Number(process.env.OLLAMA_MAX_TOKENS ?? 16384),
	db: process.env.PI_HOST_DB ?? "./storage/session.sqlite",
	sandbox: process.env.PI_HOST_SANDBOX ?? "./workspace",
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
for (const requiredDir of [dirname(env.db), env.sandbox]) mkdirSync(requiredDir, { recursive: true });

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
		baseUrl: env.ollamaBaseUrl,
		contextWindow: env.contextWindow,
		maxTokens: env.maxTokens,
	}),
);
const registry = createSteerRegistry();

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

// --- Matrix side ---
const client = createMatrixClient({ homeserver: env.homeserver, accessToken: env.accessToken });
let joined: string | undefined;
try {
	joined = await client.joinRoom(env.room);
} catch (error) {
	// a homeserver that is merely unreachable right now must not kill the daemon;
	// the sync loop below keeps retrying and membership is idempotent
	log(`join attempt failed (will rely on sync retries): ${error instanceof Error ? error.message : error}`);
}
if (joined === undefined) {
	log(`WARN join failed for ${env.room} (id or #alias; the room must exist and invite the bot); continuing in case already member`);
} else {
	log(`joined ${joined}`);
}

/** Allowed steerers; anything else is logged once per message and ignored. */
function allowed(sender: string): boolean {
	if (env.allowedUsers.includes(sender)) return true;
	log(`ignored: ${sender} is not in MATRIX_ALLOWED_USERS`);
	return false;
}

const seenEvents = new Set<string>();
/**
 * The newest accepted inbound message. Every reply threads onto it
 * (`m.relates_to.m.in_reply_to`), so the room shows what is being answered even
 * when the model takes a while. Read at send time: a late reply quotes the newest
 * message rather than a stale id.
 */
let lastInbound: EventId | null = null;
/** Submission ids still being awaited, for the /status line. */
const pending = new Set<string | number>();
/**
 * pi-spike is a normal user of the wider setup and can be invited anywhere;
 * only the configured room steers. `joined` is the homeserver-resolved room id
 * (join returns it even for an #alias); env.room covers the literal form.
 */
const steeringRooms = new Set<string>([env.room]);
if (joined !== undefined) steeringRooms.add(joined);

function track(submission: Submission): void {
	pending.add(submission.id);
	void submission
		.wait(context)
		.catch((error: unknown) => log(`submission ${submission.id} wait ended: ${error instanceof Error ? error.message : error}`))
		.finally(() => pending.delete(submission.id));
}

async function handleEvent(event: TextEvent): Promise<void> {
	if (!forRoom(event, steeringRooms)) return; // other rooms: silently ignore (bot idles there as a plain user)
	const { fresh } = pickNewEvents(seenEvents, [event]);
	for (const freshEvent of fresh) {
		if (!allowed(freshEvent.sender)) continue;
		lastInbound = freshEvent.id;
		// Receipt first: the 👀 lands while the model is still thinking. A failed
		// reaction must never cost us the message, so it is logged and dropped;
		// the reaction is idempotent per (event, key, sender) on the homeserver.
		try {
			await client.sendReaction(env.room, freshEvent.id, ACK_REACTION);
		} catch (error) {
			log(`ack reaction failed (message still steers): ${error instanceof Error ? error.message : error}`);
		}
		const command = parseMatrixCommand(freshEvent.text);
		if (command === null) continue;
		if (command.action === "stop") {
			await root.abort(context); // withdraws queued inputs and marks live tasks; background work is left alone
			try {
				await client.sendText(env.room, `stopped (queued withdrawn; pending before stop: ${pending.size})`, freshEvent.id);
			} catch (error) {
				log(`sendText after /stop failed: ${error instanceof Error ? error.message : error}`);
			}
			continue;
		}
		if (command.action === "status") {
			const inbox = await harness.snapshot(InboxDoc, root.id, context);
			try {
				await client.sendText(env.room, `status: ${pending.size} settled-or-running, inbox ${inbox?.items.length ?? 0} queued`, freshEvent.id);
			} catch (error) {
				log(`sendText after /status failed: ${error instanceof Error ? error.message : error}`);
			}
			continue;
		}
		const submission = await submitMatrixCommand(root, command, context);
		track(submission);
	}
}

// --- reply pump: transcript → room, state entirely in the durable cursor ---
// createReplyPump advances the cursor only for entries it actually delivered; a
// failed send leaves its entry outside the cursor and is retried by the next
// watch tick or at the next boot (at-least-once; the cursor doc is the whole state).
const pump = createReplyPump({
	sendText: (text, replyTo) => client.sendText(env.room, text, replyTo),
	replyTarget: () => lastInbound,
	loadCursor: async () => new Set((await harness.snapshot(SteerCursor, root.id, context))?.ids ?? []),
	saveCursor: async (ids) => {
		await root.commit(async (tx) => {
			(await tx.doc(SteerCursor, root.id)).ids = [...ids].slice(-CURSOR_CAP);
		}, context);
	},
	log: (message) => log(message),
});
const watch = await root.watch(context);
watch.start(async (value) => {
	await pump(value.entries);
});

// --- sync loop ---
let durableSync: { batch: string | null; seen: string[] } =
	(await harness.snapshot(SyncStateDoc, root.id, context)) ?? { batch: null, seen: [] };
let cursor = durableSync.batch ?? "";
let iterations = 0;
const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());
process.on("unhandledRejection", (reason) => log(`unhandledRejection (daemon stays up): ${reason}`));

log(`syncing ${env.room} on ${env.homeserver}; ctrl-c to stop`);
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
				for (const event of classification.fresh) await handleEvent(event);
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
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}
} finally {
	await harness.close(context);
	log("harness closed; bye");
}
export {};