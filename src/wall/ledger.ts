// The ledger, read-only: one SQLite file that another process is writing to,
// opened `readOnly` + `query_only` with a busy timeout, where every surprise
// (missing table, half-written row, unparsable JSON) becomes a `null` in the
// response instead of an exception.
//
// This module is the assembly, not the work: the connection lives in `db.ts`, the
// document replay in `document-replay.ts`, the vitals in `vitals.ts`, the fleet in
// `fleet.ts`, and the picker/logs/search surfaces in `conversations.ts`. What is
// left here is the ledger's own shape — health, the four status counts — and the
// one object the server talks to.
//
// Two things about this schema are worth knowing before reading any of it:
//
//  * `documents` holds *metadata*; the content lives in `document_revisions` as a
//    `base` snapshot followed by `delta` revisions. The live value of the sync
//    cursor or the subagent fleet is base + replay (`document-replay.ts`).
//  * kinds are stored JSON-quoted (`"app.sync-state"`), so every lookup matches
//    both spellings (`kindVariants`).
import type { Counts, QueueError, QueueReport, StateReport, SubmissionCounts } from "./contract.ts";
import { num, parseRecord, str } from "./contract.ts";
import { createConversations } from "./conversations.ts";
import { count, createWithDb, placeholders, unquote } from "./db.ts";
import { createFleet } from "./fleet.ts";
import { createVitals } from "./vitals.ts";

export type LedgerOptions = {
	readonly dbPath: string;
	readonly logPath: string;
	readonly now?: () => number;
};

export type Ledger = {
	health(): { ledger_ok: boolean; error: string | null };
	state(): Pick<StateReport, "vitals" | "queue" | "fleet" | "agents">;
	/** One page of the logs browser; `error` set means the page could not be read. */
	logs: ReturnType<typeof createConversations>["logs"];
	/** The conversation picker: main first, then children in id order. */
	conversations: ReturnType<typeof createConversations>["all"];
	/** Does this conversation exist? `null` = the ledger could not be read at all. */
	conversationExists: ReturnType<typeof createConversations>["exists"];
	/** One cross-conversation search page, newest first. */
	search: ReturnType<typeof createConversations>["search"];
};

const TASK_STATUSES = ["pending", "running", "waiting", "completing", "terminal"] as const;
const SUBMISSION_STATUSES = ["queued", "placed", "done", "unanswered"] as const;

export function createLedger(options: LedgerOptions): Ledger {
	const now = options.now ?? Date.now;
	const withDb = createWithDb(options.dbPath);
	const vitals = createVitals({ withDb, dbPath: options.dbPath, logPath: options.logPath, now });
	const fleet = createFleet({ withDb });
	const conversations = createConversations({ withDb, fleet });

	function health(): { ledger_ok: boolean; error: string | null } {
		const probe = withDb((db) => db.prepare("select 1 as ok").get());
		return { ledger_ok: probe.error === null, error: probe.error };
	}

	function queueReport(): QueueReport {
		const probe = withDb((db) => {
			const tasks = {} as Record<(typeof TASK_STATUSES)[number], number | null>;
			for (const status of TASK_STATUSES) {
				tasks[status] = count(db, "select count(*) as n from tasks where status = ?", [status]);
			}
			const submissions = {} as Record<(typeof SUBMISSION_STATUSES)[number], number | null>;
			for (const status of SUBMISSION_STATUSES) {
				submissions[status] = count(
					db,
					"select count(*) as n from submissions where status = ?",
					[status],
				);
			}
			const errors: QueueError[] = [];
			const rows = db
				.prepare(
					"select id, conversation_id, request_id, record from submissions where status = ? order by id desc limit 10",
				)
				.all("unanswered") as Record<string, unknown>[];
			for (const row of rows) {
				const record = parseRecord(row.record);
				errors.push({
					at: null,
					status: "unanswered",
					// The `request_id` column is stored JSON-quoted; the record copy is not.
					request_id: (record ? str(record.requestId) : null) ?? unquote(str(row.request_id)),
					conversation_id: num(row.conversation_id) ?? (record ? num(record.conversationId) : null),
				});
			}
			return { tasks, submissions, errors };
		});
		const value = probe.value;
		return {
			ok: probe.error === null,
			error: probe.error,
			inbox_depth: value?.submissions.queued ?? null,
			tasks: (value?.tasks ?? emptyTasks()) as Counts,
			submissions: (value?.submissions ?? emptySubmissions()) as SubmissionCounts,
			background_live: null,
			errors: value?.errors ?? [],
		};
	}

	return {
		health,
		logs: conversations.logs,
		conversations: conversations.all,
		conversationExists: conversations.exists,
		search: conversations.search,
		state: () => ({
			vitals: vitals.all(),
			queue: queueReport(),
			fleet: fleet.fleet(),
			agents: fleet.agents(),
		}),
	};
}

function emptyTasks(): Counts {
	return { pending: null, running: null, waiting: null, completing: null, terminal: null };
}

function emptySubmissions(): SubmissionCounts {
	return { queued: null, placed: null, done: null, unanswered: null };
}
