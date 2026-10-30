// The ledger, read-only. One SQLite file that another process is writing to;
// this module opens it `readOnly` + `query_only`, sets a busy timeout, and treats
// every surprise (missing table, half-written row, unparsable JSON) as a `null`
// in the response instead of an exception.
//
// Two things about this schema are worth knowing before reading the code:
//
//  * `documents` holds *metadata*; the content lives in `document_revisions` as a
//    `base` snapshot followed by `delta` revisions, each delta a list of
//    `[op, path, value]` edits (`s` set, `t` truncate, `a` append). The live value
//    of the sync cursor or the subagent fleet is therefore base + replay, which is
//    what `readDocument` does.
//  * kinds are stored JSON-quoted (`"app.sync-state"`), so every lookup matches
//    both spellings (`kindVariants`).
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
	type AgentReport,
	type Counts,
	freshness,
	isoFrom,
	kindVariants,
	num,
	parseRecord,
	secondsBetween,
	type DaemonVitals,
	type FleetReport,
	type LedgerVitals,
	type QueueError,
	type QueueReport,
	type SubmissionCounts,
	type SyncVitals,
	type Vitals,
} from "./contract.ts";

export type LedgerOptions = {
	readonly dbPath: string;
	readonly logPath: string;
	readonly now?: () => number;
};

export type Ledger = {
	health(): { ledger_ok: boolean; error: string | null };
	state(): { vitals: Vitals; queue: QueueReport; fleet: FleetReport };
};

const TASK_STATUSES = ["pending", "running", "waiting", "completing", "terminal"] as const;
const SUBMISSION_STATUSES = ["queued", "placed", "done", "unanswered"] as const;
const LIVE_TASK_STATUSES = ["pending", "running", "waiting", "completing"];
const LIVE_SUBMISSION_STATUSES = ["queued", "placed"];

export function createLedger(options: LedgerOptions): Ledger {
	const now = options.now ?? Date.now;

	function open(): DatabaseSync {
		const db = new DatabaseSync(options.dbPath, { readOnly: true });
		db.exec("PRAGMA query_only = 1");
		db.exec("PRAGMA busy_timeout = 2000");
		return db;
	}

	/** Run `body` against a read-only connection; any failure becomes `error`. */
	function withDb<T>(body: (db: DatabaseSync) => T): { value: T | null; error: string | null } {
		let db: DatabaseSync | null = null;
		try {
			db = open();
			return { value: body(db), error: null };
		} catch (error) {
			return { value: null, error: oneLine(error) };
		} finally {
			try {
				db?.close();
			} catch {
				// closing a read-only handle cannot usefully fail
			}
		}
	}

	function health(): { ledger_ok: boolean; error: string | null } {
		const probe = withDb((db) => db.prepare("select 1 as ok").get());
		return { ledger_ok: probe.error === null, error: probe.error };
	}

	function ledgerVitals(): LedgerVitals {
		const probe = withDb((db) => ({
			entries: count(db, "select count(*) as n from entries"),
			tasks_live: count(
				db,
				`select count(*) as n from tasks where status in (${placeholders(LIVE_TASK_STATUSES)})`,
				LIVE_TASK_STATUSES,
			),
			submissions_live: count(
				db,
				`select count(*) as n from submissions where status in (${placeholders(LIVE_SUBMISSION_STATUSES)})`,
				LIVE_SUBMISSION_STATUSES,
			),
		}));
		return {
			ok: probe.error === null,
			error: probe.error,
			path: options.dbPath,
			bytes: fileSize(options.dbPath),
			wal_bytes: fileSize(`${options.dbPath}-wal`),
			entries: probe.value?.entries ?? null,
			tasks_live: probe.value?.tasks_live ?? null,
			submissions_live: probe.value?.submissions_live ?? null,
		};
	}

	function syncVitals(): SyncVitals {
		const probe = withDb((db) => readDocument(db, "app.sync-state"));
		const writeMs = lastWriteMs(options.dbPath);
		if (probe.error !== null) {
			return {
				ok: false,
				error: probe.error,
				batch: null,
				seq: null,
				updated_at: isoFrom(writeMs),
				age_s: null,
				state: "unknown",
			};
		}
		const document = probe.value;
		const record = parseRecord(document?.state);
		const batch = record ? (typeof record.batch === "string" ? record.batch : null) : null;
		// The ledger stores no per-revision timestamps, so "when did the cursor last
		// move" is the ledger file's own mtime — the one clock both processes share.
		const ageS = writeMs === null ? null : secondsBetween(writeMs, now());
		return {
			ok: document !== null,
			error: document === null ? "no app.sync-state document" : null,
			batch,
			seq: document?.seq ?? null,
			updated_at: isoFrom(writeMs),
			age_s: ageS,
			state: freshness(ageS),
		};
	}

	function daemonVitals(): DaemonVitals {
		try {
			const stat = fs.statSync(options.logPath);
			const tail = readTail(options.logPath, 64 * 1024);
			const scan = scanLog(tail, now());
			return {
				ok: true,
				error: null,
				log_path: options.logPath,
				log_bytes: stat.size,
				log_updated_at: stat.mtime.toISOString(),
				// The log's age is the daemon's best available uptime signal: the file is
				// appended to every restart, so a stale mtime means a quiet daemon.
				uptime_s: secondsBetween(stat.mtimeMs, now()),
				errors_24h: scan.errors_24h,
				last_error_at: scan.last_error_at,
				last_error: scan.last_error,
			};
		} catch (error) {
			return {
				ok: false,
				error: oneLine(error),
				log_path: options.logPath,
				log_bytes: null,
				log_updated_at: null,
				uptime_s: null,
				errors_24h: null,
				last_error_at: null,
				last_error: null,
			};
		}
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

	function fleetReport(): FleetReport {
		const probe = withDb((db) => readDocument(db, "app.subagents"));
		if (probe.error !== null) {
			return { ok: false, error: probe.error, agents: [] };
		}
		const record = parseRecord(probe.value?.state);
		const agents = record ? parseRecord(record.agents) : null;
		if (!agents) return { ok: true, error: null, agents: [] };
		// Two write paths record a report: the `reported` array on the agent, and the
		// `reporters` map (name → newest report entry) the daemon maintains.
		const reporters = record ? parseRecord(record.reporters) : null;
		const out: AgentReport[] = [];
		for (const [name, raw] of Object.entries(agents)) {
			const entry = parseRecord(raw);
			const reported = Array.isArray(entry?.reported) ? entry.reported.filter(isNumber) : [];
			const newest = reported.length > 0 ? Math.max(...reported) : null;
			const fromReporters = num(reporters?.[name]);
			const lastReportEntry =
				newest === null ? fromReporters : fromReporters === null ? newest : Math.max(newest, fromReporters);
			out.push({
				name,
				branch: `worktree-${name}`,
				worktree: entry ? str(entry.worktree) : null,
				conversation_id: entry ? num(entry.conversationId) : null,
				reports: reported.length > 0 ? reported.length : lastReportEntry === null ? 0 : 1,
				last_report_entry: lastReportEntry,
				state: lastReportEntry === null ? "waiting" : "reported",
			});
		}
		return { ok: true, error: null, agents: out.sort((a, b) => a.name.localeCompare(b.name)) };
	}

	return {
		health,
		state: () => ({
			vitals: {
				ledger: ledgerVitals(),
				sync: syncVitals(),
				daemon: daemonVitals(),
				container: containerVitals(),
			},
			queue: queueReport(),
			fleet: fleetReport(),
		}),
	};
}

// --- documents: base snapshot + replayed deltas ----------------------------

type DocumentValue = { seq: number; state: unknown };

/** The live value of a document: newest `base` revision, then its deltas. */
function readDocument(db: DatabaseSync, kind: string): DocumentValue | null {
	const [plain, quoted] = kindVariants(kind);
	const doc = db
		.prepare(
			"select id from documents where kind in (?, ?) and retired_at is null order by id desc limit 1",
		)
		.get(plain, quoted) as { id?: unknown } | undefined;
	const id = num(doc?.id);
	if (id === null) return null;

	let state: unknown = null;
	let seq = 0;
	const revisions = db
		.prepare(
			"select seq, kind, content from document_revisions where document_id = ? order by seq asc",
		)
		.all(id) as { seq: unknown; kind: unknown; content: unknown }[];
	for (const revision of revisions) {
		const revisionSeq = num(revision.seq);
		if (revisionSeq !== null && revisionSeq > seq) seq = revisionSeq;
		const parsed = parseJson(revision.content);
		if (parsed === INVALID) continue;
		if (revision.kind === "base") {
			state = parsed;
			continue;
		}
		state = applyDelta(state, parsed);
	}
	return { seq, state };
}

const INVALID = Symbol("invalid json");

function parseJson(value: unknown): unknown {
	if (typeof value !== "string") return value ?? null;
	try {
		return JSON.parse(value);
	} catch {
		return INVALID;
	}
}

/** One revision's edits: `[["s",["batch"],"1"],["t",["batch"],5],["a",["batch"],"0"]]`. */
function applyDelta(state: unknown, delta: unknown): unknown {
	if (!Array.isArray(delta)) return state;
	let next = state;
	for (const edit of delta) {
		if (!Array.isArray(edit) || edit.length < 2) continue;
		const [op, path] = edit as [unknown, unknown];
		if (!Array.isArray(path) || path.length === 0) continue;
		const value = edit.length > 2 ? edit[2] : undefined;
		switch (op) {
			case "s":
				next = setPath(next, path.map(String), value);
				break;
			case "t":
				next = mutatePath(next, path.map(String), (current) =>
					typeof current === "string" ? current.slice(0, Number(value) || 0) : current,
				);
				break;
			case "a": {
				next = mutatePath(next, path.map(String), (current) => {
					if (Array.isArray(current)) return [...current, value];
					if (typeof current === "string") return current + String(value ?? "");
					return [value];
				});
				break;
			}
			default:
				// Unknown op: ignore it rather than lose the whole document.
				break;
		}
	}
	return next;
}

function setPath(state: unknown, path: string[], value: unknown): unknown {
	if (path.length === 0) return value;
	const [head, ...rest] = path as [string, ...string[]];
	const base: Record<string, unknown> = isRecord(state) ? { ...state } : {};
	base[head] = setPath(base[head], rest, value);
	return base;
}

function mutatePath(state: unknown, path: string[], mutate: (current: unknown) => unknown): unknown {
	if (path.length === 0) return mutate(state);
	const [head, ...rest] = path as [string, ...string[]];
	if (!isRecord(state)) return state;
	return { ...state, [head]: mutatePath(state[head], rest, mutate) };
}

// --- log tail -------------------------------------------------------------

function scanLog(tail: string, nowMs: number): {
	errors_24h: number;
	last_error: string | null;
	last_error_at: string | null;
} {
	const lines = tail.split("\n").filter((line) => line.trim() !== "");
	const considered = lines.slice(-200);
	let errors = 0;
	let lastError: string | null = null;
	let lastErrorAt: number | null = null;
	const dayAgo = nowMs - 24 * 60 * 60 * 1000;
	for (const line of considered) {
		if (!/error|failed|fatal/i.test(line)) continue;
		const at = timestampOf(line);
		// Lines without a timestamp are still worth counting: they are in the tail.
		if (at !== null && at < dayAgo) continue;
		errors += 1;
		if (lastErrorAt === null || (at !== null && at >= lastErrorAt)) {
			lastError = line.trim().slice(0, 300);
			lastErrorAt = at ?? lastErrorAt;
		}
	}
	return {
		errors_24h: errors,
		last_error: lastError,
		last_error_at: isoFrom(lastErrorAt),
	};
}

const TIMESTAMP = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/;

function timestampOf(line: string): number | null {
	const match = TIMESTAMP.exec(line);
	if (!match) return null;
	const parsed = Date.parse(match[1] as string);
	return Number.isNaN(parsed) ? null : parsed;
}

function readTail(file: string, bytes: number): string {
	const stat = fs.statSync(file);
	const start = Math.max(0, stat.size - bytes);
	const length = stat.size - start;
	if (length <= 0) return "";
	const buffer = Buffer.alloc(length);
	const handle = fs.openSync(file, "r");
	try {
		fs.readSync(handle, buffer, 0, length, start);
	} finally {
		fs.closeSync(handle);
	}
	return buffer.toString("utf8");
}

// --- container uptime -----------------------------------------------------

function containerVitals() {
	try {
		const stat = fs.readFileSync("/proc/1/stat", "utf8");
		// Field 22 (1-indexed) is starttime in clock ticks; /proc/uptime gives the boot
		// age in seconds, so the difference is how long PID 1 has been running.
		const close = stat.lastIndexOf(")");
		const fields = stat.slice(close + 2).split(" ");
		const startTicks = Number(fields[19]);
		const uptimeS = Number(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]);
		if (!Number.isFinite(startTicks) || !Number.isFinite(uptimeS)) {
			throw new Error("/proc shape unexpected");
		}
		const hertz = 100;
		return {
			ok: true,
			error: null,
			uptime_s: Math.max(0, Math.round(uptimeS - startTicks / hertz)),
			source: "/proc/1",
		};
	} catch (error) {
		return { ok: false, error: oneLine(error), uptime_s: null, source: "/proc/1" };
	}
}

// --- small helpers --------------------------------------------------------

function count(db: DatabaseSync, sql: string, params: readonly string[] = []): number | null {
	try {
		const row = db.prepare(sql).get(...params) as { n?: unknown } | undefined;
		return num(row?.n);
	} catch {
		return null;
	}
}

function fileSize(file: string): number | null {
	try {
		return fs.statSync(file).size;
	} catch {
		return null;
	}
}

/** Newest mtime of the database and its WAL: the ledger's last write. */
function lastWriteMs(dbPath: string): number | null {
	const candidates = [dbPath, `${dbPath}-wal`]
		.map((file) => {
			try {
				return fs.statSync(file).mtimeMs;
			} catch {
				return null;
			}
		})
		.filter(isNumber);
	return candidates.length === 0 ? null : Math.max(...candidates);
}

function placeholders(values: readonly string[]): string {
	return values.map(() => "?").join(", ");
}

function emptyTasks(): Counts {
	return { pending: null, running: null, waiting: null, completing: null, terminal: null };
}

function emptySubmissions(): SubmissionCounts {
	return { queued: null, placed: null, done: null, unanswered: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function str(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

/** `"subagent:2393"` → `subagent:2393`; anything else is left alone. */
function unquote(value: string | null): string | null {
	if (value === null || value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
	try {
		const parsed: unknown = JSON.parse(value);
		return typeof parsed === "string" ? parsed : value;
	} catch {
		return value;
	}
}

/** Errors go on the wire as one line, never a stack. */
export function oneLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split("\n")[0]?.slice(0, 300) ?? "unknown error";
}
