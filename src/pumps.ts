// The reply pumps: one watcher per WATCHED conversation, each with its own durable
// cursor, each carrying that conversation's answers into that conversation's room.
//
// `createReplyPump` advances its cursor only for entries it actually delivered; a
// failed send leaves its entry outside the cursor and is retried by the next watch
// tick or at the next boot (at-least-once; the cursor doc is the whole state).
// Watching is per conversation, so the set is built at boot and grown by every
// successful bind — a project's answers have one room, and one pump.
import type { Context } from "@earendil-works/chord";
import type { ConversationId } from "@earendil-works/pi-durable";
import { createReplyPump, roomShort, type EventId, type PumpEntry } from "./core/steer.ts";
import type { MatrixClient } from "./surfaces/matrix-client.ts";

/** The durable cursor: entry ids already sent. Kept capped, newest last. */
export type CursorIds = Array<string | number>;

/** Only the newest ids are kept: the cursor is a floor, not an archive. */
export const CURSOR_CAP = 200;

/** What a conversation handle must offer: a watch we can start and stop. */
export type Watch = {
	start(handler: (value: { entries: readonly PumpEntry[] }) => Promise<void>): unknown;
	stop(): Promise<unknown>;
};

export type Watched = { watch(context: Context): Promise<Watch> };

export type PumpsDeps = {
	readonly client: Pick<MatrixClient, "sendText">;
	readonly context: Context;
	/** The root conversation: its handle is already open. */
	readonly rootId: ConversationId;
	/** Any conversation's handle; `undefined` when it is gone. */
	readonly handle: (id: ConversationId) => Promise<Watched | undefined>;
	/** The ids already delivered for one conversation. */
	readonly loadCursor: (conversation: ConversationId) => Promise<CursorIds | undefined>;
	/** Persist the advanced cursor (called only when something was delivered). */
	readonly saveCursor: (conversation: ConversationId, ids: CursorIds) => Promise<void>;
	/** The event a reply in `room` should quote. */
	readonly replyTarget: (room: string) => EventId | null;
	readonly log: (message: string) => void;
	readonly journal: (line: string) => void;
};

export type Pumps = {
	/** Start (once) the pump that carries `conversation`'s answers into `room`. */
	ensure(conversation: ConversationId, room: string): Promise<void>;
};

export function createPumps(deps: PumpsDeps): Pumps {
	const pumping = new Map<ConversationId, { stop(): Promise<unknown> }>();

	async function ensure(conversation: ConversationId, room: string): Promise<void> {
		if (pumping.has(conversation)) return;
		const handle = await deps.handle(conversation);
		if (handle === undefined) {
			deps.journal(`pump skipped: conversation ${conversation} has no handle`);
			return;
		}
		const pump = createReplyPump({
			sendText: (text, replyTo) => deps.client.sendText(room, text, replyTo),
			replyTarget: () => deps.replyTarget(room),
			loadCursor: async () => new Set((await deps.loadCursor(conversation)) ?? []),
			saveCursor: async (ids) => {
				await deps.saveCursor(conversation, [...ids].slice(-CURSOR_CAP));
			},
			log: (message) => {
				deps.log(message);
				// The reply pump only logs undelivered answers: a transport failure, kept.
				deps.journal(message);
			},
		});
		const watch = await handle.watch(deps.context);
		watch.start(async (value) => {
			await pump(value.entries);
		});
		pumping.set(conversation, watch);
		deps.log(`reply pump: conversation ${conversation} → room ${roomShort(room)}`);
		deps.journal(`reply pump on conversation ${conversation} → ${room}`);
	}

	return { ensure };
}
