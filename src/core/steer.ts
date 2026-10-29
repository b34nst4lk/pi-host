// Steer-surface core for the pi-host: maps Matrix text into durable
// submissions, dedupes sync events, and extracts assistant texts for the reply
// pump. Pure logic; src/daemon.ts wires it to a matrix client and a real
// harness. Inbox semantics follow the pi-durable examples (20-inbox.ts).
// Migrated verbatim (logic unchanged) from the spike's packages/durable/
// steer_core.ts; only the import specifiers differ.
import type { Context } from "@earendil-works/chord";
import type { Submission, SubmissionDraft } from "@earendil-works/pi-durable";

/** One recognized Matrix command. `content` carries text where an action needs it. */
export type MatrixCommand =
	| { readonly action: "input"; readonly content: string }
	| { readonly action: "steer"; readonly content: string }
	| { readonly action: "note"; readonly content: string }
	| { readonly action: "stop" }
	| { readonly action: "status" };

/**
 * Map one chat message to a command.
 *
 * Plain text is an input (queues as a follow-up when the conversation is busy).
 * `/steer <text>` joins the live run instead; `/stop` and `/status` are
 * controls; `/note <text>` appends without asking the model. Unrecognized
 * slash text is treated as literal input — a chat surface must never swallow
 * a message that merely looks like a path.
 */
export function parseMatrixCommand(text: string): MatrixCommand | null {
	const trimmed = text.trim();
	if (trimmed.length === 0) return null;
	const spaceAt = trimmed.indexOf(" ");
	const first = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
	const rest = spaceAt === -1 ? "" : trimmed.slice(spaceAt + 1).trim();
	if (first === "/stop") return { action: "stop" };
	if (first === "/status") return { action: "status" };
	if (first === "/steer") return rest.length > 0 ? { action: "steer", content: rest } : null;
	if (first === "/note") return rest.length > 0 ? { action: "note", content: rest } : null;
	return { action: "input", content: trimmed };
}

/**
 * The reaction the agent emotes on every accepted inbound message: a receipt
 * the room can see, sent before the (possibly slow) model work starts.
 */
export const ACK_REACTION = "👀";

/** A Matrix event id (`$...`). Branded as a plain string; kept named for readability. */
export type EventId = string;

/**
 * Reaction event content: an `m.annotation` relation onto `eventId`. Homeservers
 * key a reaction by (event, key, sender), so re-acking the same message is
 * idempotent — a redelivered sync batch cannot stack 👀s.
 */
export function reactionContent(eventId: EventId, key: string = ACK_REACTION) {
	return {
		"m.relates_to": { rel_type: "m.annotation", event_id: eventId, key },
	};
}

/**
 * Message event content, optionally threaded onto the message being answered.
 * `m.in_reply_to` is the modern relation (clients render the quote themselves);
 * clients that predate it still show a plain message, so nothing breaks.
 */
export function replyContent(body: string, replyTo: EventId | null) {
	if (replyTo === null) return { msgtype: "m.text", body };
	return { msgtype: "m.text", body, "m.relates_to": { "m.in_reply_to": { event_id: replyTo } } };
}

/** A text event as seen from a Matrix sync: id, sender, and the plain body. */
export type TextEvent = {
	readonly id: string;
	readonly sender: string;
	readonly text: string;
	readonly room: string;
};

/**
 * True when the event belongs to one of the accepted rooms. Room ids are
 * compared literally; callers pass every form they know (the configured room
 * and, when resolvable, its resolved id) so alias configuration works.
 *
 * pi-spike is a normal user in the wider setup: it may be invited into rooms
 * where other agents and people talk. Those events MUST NOT become steering
 * input — a daemon that listens to every room it idles in submits household
 * chatter to the durable agent.
 */
export function forRoom(event: TextEvent, acceptedRooms: ReadonlySet<string>): boolean {
	return acceptedRooms.has(event.room);
}

/**
 * Filter a batch of sync events down to ones not seen before, returning the
 * fresh events and a grown seen set. Handles the homeserver redelivering
 * events across sync batches (they must not submit twice).
 */
export function pickNewEvents(
	seen: ReadonlySet<string>,
	events: readonly TextEvent[],
): { fresh: TextEvent[]; seen: Set<string> } {
	const next = seen instanceof Set ? new Set(seen) : new Set(seen);
	const fresh: TextEvent[] = [];
	for (const event of events) {
		if (next.has(event.id)) continue;
		next.add(event.id);
		fresh.push(event);
	}
	return { fresh, seen: next };
}

/**
 * Durable sync state: the `/sync` `since` cursor, plus the ids of events this
 * daemon has already ingested (capped, newest kept). `batch: null` marks a
 * daemon that has never completed a sync.
 */
export type SyncState = { batch: string | null; seen: ReadonlyArray<string> };

/** How many ingested Matrix event ids the durable seen list keeps. */
export const SYNC_SEEN_CAP = 200;

export type SyncBatchClassification = {
	/** Events to submit: neither durably seen nor seen by this process. */
	readonly fresh: TextEvent[];
	/** The durable seen list to persist: previous ids plus every fresh id, newest kept, capped. */
	readonly durableSeen: string[];
	/** True when this batch established the cursor (no stored batch): the room backlog must NOT be submitted — only messages sent after the daemon is up steer it. */
	readonly skipBacklog: boolean;
};

/**
 * Classify one sync batch against durable sync state and this process's memory.
 * Guards against: first-boot backlog (skip), homeserver replays of already-
 * ingested events after a restart or token invalidation (durable seen), and
 * double-submission within one process (memory seen). Idempotent: callers
 * persist `durableSeen` together with the returned `nextBatch`.
 */
export function classifySyncBatch(
	durable: SyncState,
	memorySeen: ReadonlySet<string>,
	events: readonly TextEvent[],
): SyncBatchClassification {
	const durableSeenSet = new Set(durable.seen);
	const fresh = events.filter((event) => !durableSeenSet.has(event.id) && !memorySeen.has(event.id));
	const merged = [...durable.seen, ...fresh.map((event) => event.id)];
	const durableSeen = merged.slice(Math.max(0, merged.length - SYNC_SEEN_CAP));
	return { fresh, durableSeen, skipBacklog: durable.batch === null };
}

/** The parts of a transcript entry the reply pump reads. Durable entry records carry `id`, `kind`, and optional `model`. */
/** Durable entry ids are branded numbers or strings depending on storage; the pump treats them opaquely. */
export type PumpId = string | number;
export type PumpEntry = { readonly id: PumpId; readonly kind: string; readonly model?: readonly unknown[] | undefined };

/**
 * Extract the unseen assistant entries as {id, text} pairs, oldest first, and
 * grow the seen set. Non-assistant entries are skipped but their ids still
 * count as seen: the pump must never process an entry twice, and skipped kinds
 * must not be re-examined forever. Callers advance a DURABLE cursor only for
 * entries they actually delivered; ids present in `seen` but not delivered
 * are retried on the next tick/boot.
 */
export function extractAssistantTexts(
	seen: ReadonlySet<PumpId>,
	entries: readonly PumpEntry[],
): { items: Array<{ id: PumpId; text: string }>; seen: Set<PumpId> } {
	const next = new Set<PumpId>(seen);
	const items: Array<{ id: PumpId; text: string }> = [];
	for (const entry of entries) {
		const fresh = !next.has(entry.id);
		next.add(entry.id);
		if (!fresh || entry.kind !== "pi.assistant" || !Array.isArray(entry.model)) continue;
		const message = entry.model[0] as { content?: ReadonlyArray<{ type?: string; text?: string }> } | undefined;
		const parts = (message?.content ?? []).filter((block) => block?.type === "text" && typeof block.text === "string");
		const text = parts.map((block) => block.text).join("");
		if (text.length > 0) items.push({ id: entry.id, text });
	}
	return { items, seen: next };
}

/** Dependencies of the durable reply pump; all injected, so tests run against fakes. */
export type ReplyPumpDeps = {
	/** Deliver one assistant text to the chat surface (the room), threaded onto `replyTo` when given. */
	sendText(text: string, replyTo: EventId | null): Promise<unknown>;
	/**
	 * The inbound message the next reply should quote: the newest accepted
	 * message the agent is answering. Read per delivery, so a reply that lands
	 * after a newer message quotes the newer one instead of a stale id.
	 */
	replyTarget?: () => EventId | null;
	/** Load the durable set of entry ids already delivered. */
	loadCursor(): Promise<ReadonlySet<PumpId>>;
	/** Persist the advanced cursor (called only when something was delivered). */
	saveCursor(ids: ReadonlySet<PumpId>): Promise<void>;
	/** One-line logger for send failures; optional. */
	log?: (message: string) => void;
};

/**
 * The reply pump tick: send every assistant text not yet in the durable
 * cursor, then persist the cursor INCLUDING only the delivered entries.
 * A crashed send leaves its entry outside the cursor, so the next tick (or
 * the next boot, replaying from durable storage) delivers it — at least once,
 * never lost, and the cursor doc is the pump's whole state.
 */
export function createReplyPump(deps: ReplyPumpDeps): (entries: readonly PumpEntry[]) => Promise<void> {
	const log = deps.log ?? (() => {});
	return async (entries) => {
		const cursor = await deps.loadCursor();
		const { items, seen } = extractAssistantTexts(cursor, entries);
		if (items.length === 0) return;
		const delivered = new Set<PumpId>();
		for (const item of items) {
			try {
				await deps.sendText(item.text, deps.replyTarget?.() ?? null);
				delivered.add(item.id);
			} catch (error) {
				log(`reply not delivered (entry ${item.id} stays outside the cursor; retried on next tick/boot): ${error instanceof Error ? error.message : error}`);
			}
		}
		if (delivered.size === 0) return;
		// UNION with the loaded cursor, never replace: a replace drops previously
		// delivered ids and the next tick re-sends those answers (the 2026-10-28
		// room spam). Failed sends stay outside the union; they retry at-least-once.
		const advancing = new Set<PumpId>(cursor);
		for (const id of delivered) advancing.add(id);
		await deps.saveCursor(advancing);
	};
}

/**
 * The thing submissions are handed to: a pi-durable `Conversation` (kept
 * structural so the tests can run against the same shapes).
 */
export type SubmittingConversation = {
	submit(draft: SubmissionDraft, context: Context): Promise<Submission>;
};

/** Hand one parsed command to the durable inbox as the right submission kind. */
export async function submitMatrixCommand(
	root: SubmittingConversation,
	command: MatrixCommand,
	context: Context,
): Promise<Submission> {
	switch (command.action) {
		case "input":
			return root.submit({ type: "input", content: command.content }, context);
		case "steer":
			return root.submit({ type: "input", content: command.content, whenBusy: "steer" }, context);
		case "note":
			return root.submit({ type: "write", entry: { kind: "app.matrix-note", data: command.content } }, context);
		case "stop":
		case "status":
			throw new Error(`submitMatrixCommand cannot place ${command.action}; the daemon handles controls itself`);
	}
}

/** Outcome counts of a /stop sweep over tracked submissions. */
export type WithdrawResult = { aborted: number; alreadyPlaced: number; settled: number };

/**
 * Withdraw every tracked submission still pending: queued ones abort
 * immediately, already-placed ones report so, settled ones report so. The
 * daemon uses this for `/stop`; aborting the live run itself, if any remains,
 * is the daemon's `root.abort` responsibility.
 */
export async function withdrawSubmissions(
	submissions: readonly Submission[],
	context: Context,
): Promise<WithdrawResult> {
	const result: WithdrawResult = { aborted: 0, alreadyPlaced: 0, settled: 0 };
	for (const submission of submissions) {
		const outcome = await submission.abort(context);
		if (outcome === "aborted") result.aborted += 1;
		else if (outcome === "already_placed") result.alreadyPlaced += 1;
		else result.settled += 1;
	}
	return result;
}