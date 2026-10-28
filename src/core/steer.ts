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

/** A text event as seen from a Matrix sync: id, sender, and the plain body. */
export type TextEvent = { readonly id: string; readonly sender: string; readonly text: string };

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

/** The parts of a transcript entry the reply pump reads. Durable entry records carry `id`, `kind`, and optional `model`. */
export type PumpEntry = { readonly id: string; readonly kind: string; readonly model?: readonly unknown[] | undefined };

/**
 * Extract the unseen assistant entries as {id, text} pairs, oldest first, and
 * grow the seen set. Non-assistant entries are skipped but their ids still
 * count as seen: the pump must never process an entry twice, and skipped kinds
 * must not be re-examined forever. Callers advance a DURABLE cursor only for
 * entries they actually delivered; ids present in `seen` but not delivered
 * are retried on the next tick/boot.
 */
export function extractAssistantTexts(
	seen: ReadonlySet<string>,
	entries: readonly PumpEntry[],
): { items: Array<{ id: string; text: string }>; seen: Set<string> } {
	const next = new Set(seen);
	const items: Array<{ id: string; text: string }> = [];
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
	/** Deliver one assistant text to the chat surface (the room). */
	sendText(text: string): Promise<unknown>;
	/** Load the durable set of entry ids already delivered. */
	loadCursor(): Promise<ReadonlySet<string>>;
	/** Persist the advanced cursor (called only when something was delivered). */
	saveCursor(ids: ReadonlySet<string>): Promise<void>;
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
		const delivered = new Set<string>();
		for (const item of items) {
			try {
				await deps.sendText(item.text);
				delivered.add(item.id);
			} catch (error) {
				log(`reply not delivered (entry ${item.id} stays outside the cursor; retried on next tick/boot): ${error instanceof Error ? error.message : error}`);
			}
		}
		if (delivered.size === 0) return;
		const advancing = new Set<string>();
		for (const id of seen) if (delivered.has(id)) advancing.add(id);
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