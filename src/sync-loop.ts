// The /sync long-poll loop, and the durable cursor that makes it resumable.
//
// One poll for ALL joined rooms (no SDK, raw CS API). `classifySyncBatch` holds
// the semantics: first boot skips the room backlog, a restart resumes from the
// stored batch, and a homeserver replay of already-ingested events never
// resubmits. The order inside one batch is deliberate — process first, persist
// after: a crash in between replays at most once and never skips.
import type { Context } from "@earendil-works/chord";
import { defineDoc, type ConversationId } from "@earendil-works/pi-durable";
import { classifySyncBatch, type TextEvent } from "./core/steer.ts";

/** Durable sync state: the `/sync` since cursor plus the ids of ingested events (capped). */
export const SyncStateDoc = defineDoc<{ batch: string | null; seen: string[] }>({
	kind: "app.sync-state",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ batch: null, seen: [] }),
});

export type SyncState = { batch: string | null; seen: string[] };

export type SyncLoopDeps = {
	readonly context: Context;
	/** The root conversation: the sync state lives there. */
	readonly root: {
		readonly id: ConversationId;
		snapshot(): Promise<SyncState | undefined>;
		commit(batch: string | null, seen: string[]): Promise<void>;
		close(): Promise<void>;
	};
	/** One long-poll: `batch.textEvents` in, the next `since` cursor out. */
	readonly sync: (
		since: string,
		timeoutMs: number,
		signal: AbortSignal,
	) => Promise<{ nextBatch: string; textEvents: readonly TextEvent[]; invites: readonly string[] }>;
	/** Handle one fresh event; the router decides whether the room steers anything. */
	readonly handleEvent: (event: TextEvent) => Promise<void>;
	/** Accept one pending invite (the sync loop calls it once per new invite). */
	readonly joinRoom: (roomIdOrAlias: string) => Promise<string | undefined>;
	/** Ids this process has seen, for the in-memory half of the dedupe. */
	readonly seenEvents: Set<string>;
	readonly room: string;
	readonly homeserver: string;
	readonly log: (message: string) => void;
	readonly journal: (line: string) => void;
	/** One line from an error, for the log. */
	readonly reason: (error: unknown) => string;
};

/** Run until SIGINT/SIGTERM; the harness is closed on the way out. */
export async function runSyncLoop(deps: SyncLoopDeps): Promise<void> {
	const invitesSeen = new Set<string>();
	let durableSync: SyncState = (await deps.root.snapshot()) ?? { batch: null, seen: [] };
	let cursor = durableSync.batch ?? "";
	let iterations = 0;
	const controller = new AbortController();
	process.on("SIGINT", () => controller.abort());
	process.on("SIGTERM", () => controller.abort());
	process.on("unhandledRejection", (error) => deps.log(`unhandledRejection (daemon stays up): ${error}`));

	deps.log(`syncing ${deps.room} (and every bound project room) on ${deps.homeserver}; ctrl-c to stop`);
	try {
		while (!controller.signal.aborted) {
			try {
				const batch = await deps.sync(cursor, iterations === 0 ? 0 : 30_000, controller.signal);
				iterations += 1;
				// Invites first, once per room id: a mid-run /project flow delivers the invite
				// while the daemon is alive; joining makes the room's /project commands visible
				// (it still steers nothing until a /project binds it — the router decides).
				for (const inviteId of batch.invites) {
					if (invitesSeen.has(inviteId)) continue;
					invitesSeen.add(inviteId);
					try {
						const joinedId = await deps.joinRoom(inviteId);
						deps.log(`joined new room ${joinedId ?? inviteId} (invite accepted; nothing steers until it is bound)`);
						deps.journal(`join ok ${joinedId ?? inviteId} (invite)`);
					} catch (error) {
						deps.log(`join of invited room failed: ${deps.reason(error)}`);
					}
				}
				const classification = classifySyncBatch(durableSync, deps.seenEvents, batch.textEvents);
				if (classification.skipBacklog) {
					if (batch.textEvents.length > 0) {
						deps.log(
							`first boot: skipping ${batch.textEvents.length} backlog events (only messages sent after the daemon starts steer it)`,
						);
					}
				} else {
					// One router, every room: it decides from the registry which room steers
					// what and drops the rest without a word.
					for (const event of classification.fresh) await deps.handleEvent(event);
				}
				// every batch event counts as seen by this process, skipped backlog included
				for (const event of batch.textEvents) deps.seenEvents.add(event.id);
				// process first, persist after: a crash in between replays at most once, never skips
				durableSync = { batch: batch.nextBatch, seen: classification.durableSeen };
				await deps.root.commit(batch.nextBatch, classification.durableSeen);
				cursor = batch.nextBatch;
			} catch (error) {
				if (controller.signal.aborted) break;
				const cause = (error as { cause?: unknown }).cause;
				const causeText = cause instanceof Error ? (cause as Error & { code?: string }).code ?? cause.message : undefined;
				deps.log(
					`sync error: ${error instanceof Error ? error.message : error} (${causeText ?? "no cause"}); retrying in 5s`,
				);
				// A watchdog abort is a sync error too, but a different animal: the edge
				// accepted the long-poll and then dropped it (the 2026-10-28 freeze). Name it.
				const aborted =
					error instanceof Error &&
					(error.name === "AbortError" || error.name === "TimeoutError" || /abort|timed? ?out/i.test(error.message));
				deps.journal(`${aborted ? "watchdog abort" : "sync error"}: ${deps.reason(error)} (cause: ${causeText ?? "no cause"})`);
				await new Promise((resolve) => setTimeout(resolve, 5000));
			}
		}
	} finally {
		await deps.root.close();
		deps.journal("harness down: closed");
		deps.log("harness closed; bye");
	}
}
