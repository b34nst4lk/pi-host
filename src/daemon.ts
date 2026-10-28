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
//   OLLAMA_CONTEXT_WINDOW    default 32768   (OLLAMA_MAX_TOKENS default 4096)
//   PI_HOST_DB               default ./storage/session.sqlite (renamed from
//                            the spike's STEER_DB; durable ledger of the host)
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { defineDoc, Harness, InboxDoc, type Submission } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import {
	createReplyPump,
	forRoom,
	pickNewEvents,
	parseMatrixCommand,
	submitMatrixCommand,
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
	contextWindow: Number(process.env.OLLAMA_CONTEXT_WINDOW ?? 32768),
	maxTokens: Number(process.env.OLLAMA_MAX_TOKENS ?? 4096),
	db: process.env.PI_HOST_DB ?? "./storage/session.sqlite",
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
for (const requiredDir of [dirname(env.db)]) mkdirSync(requiredDir, { recursive: true });

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

const db = await openNodeSqliteStorage(env.db);
const harness = await Harness.open(
	db,
	{ models, registry, settings: { followUpMode: "all", steeringMode: "all" } },
	context,
);
const root = await harness.root(context, { agent: { model: { provider: "ollama-cloud", modelId: env.ollamaModel } } });
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
		const command = parseMatrixCommand(freshEvent.text);
		if (command === null) continue;
		if (command.action === "stop") {
			await root.abort(context); // withdraws queued inputs and marks live tasks; background work is left alone
			try {
				await client.sendText(env.room, `stopped (queued withdrawn; pending before stop: ${pending.size})`);
			} catch (error) {
				log(`sendText after /stop failed: ${error instanceof Error ? error.message : error}`);
			}
			continue;
		}
		if (command.action === "status") {
			const inbox = await harness.snapshot(InboxDoc, root.id, context);
			try {
				await client.sendText(env.room, `status: ${pending.size} settled-or-running, inbox ${inbox?.items.length ?? 0} queued`);
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
	sendText: (text) => client.sendText(env.room, text),
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
let cursor = "";
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
			cursor = batch.nextBatch;
			iterations += 1;
			for (const event of batch.textEvents) await handleEvent(event);
		} catch (error) {
			if (controller.signal.aborted) break;
			log(`sync error: ${error instanceof Error ? error.message : error}; retrying in 5s`);
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}
} finally {
	await harness.close(context);
	log("harness closed; bye");
}
export {};