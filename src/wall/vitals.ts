// Vitals: is the machine alive? Four independent answers, none of which may
// throw — the ledger file, the sync cursor, the daemon's log tail, and the age of
// PID 1.
//
// The forensics (`scanLog`, `readTail`, `containerVitals`) are pure string and
// `/proc` reads: no ledger, no server, callable from a test with a temp file. The
// report builders around them fill the contract's nullable leaves, so a missing
// log or a non-Linux box degrades to `ok:false` instead of a failed request.
import fs from "node:fs";
import type { ContainerVitals, DaemonVitals, LedgerVitals, SyncVitals, Vitals } from "./contract.ts";
import { freshness, isoFrom, oneLine, parseRecord, secondsBetween } from "./contract.ts";
import { count, fileSize, lastWriteMs, placeholders, type WithDb } from "./db.ts";
import { readDocument } from "./document-replay.ts";

const LIVE_TASK_STATUSES = ["pending", "running", "waiting", "completing"];
const LIVE_SUBMISSION_STATUSES = ["queued", "placed"];

export type VitalsDeps = {
	readonly withDb: WithDb;
	readonly dbPath: string;
	readonly logPath: string;
	readonly now: () => number;
};

/** The four vitals, each read on demand: nothing here is cached between polls. */
export function createVitals(deps: VitalsDeps): { all(): Vitals; ledger(): LedgerVitals } {
	function ledger(): LedgerVitals {
		const probe = deps.withDb((db) => ({
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
			path: deps.dbPath,
			bytes: fileSize(deps.dbPath),
			wal_bytes: fileSize(`${deps.dbPath}-wal`),
			entries: probe.value?.entries ?? null,
			tasks_live: probe.value?.tasks_live ?? null,
			submissions_live: probe.value?.submissions_live ?? null,
		};
	}

	function sync(): SyncVitals {
		const probe = deps.withDb((db) => readDocument(db, "app.sync-state"));
		const writeMs = lastWriteMs(deps.dbPath);
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
		const ageS = writeMs === null ? null : secondsBetween(writeMs, deps.now());
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

	function daemon(): DaemonVitals {
		try {
			const stat = fs.statSync(deps.logPath);
			const tail = readTail(deps.logPath, 64 * 1024);
			const scan = scanLog(tail, deps.now());
			return {
				ok: true,
				error: null,
				log_path: deps.logPath,
				log_bytes: stat.size,
				log_updated_at: stat.mtime.toISOString(),
				// The log's age is the daemon's best available uptime signal: the file is
				// appended to every restart, so a stale mtime means a quiet daemon.
				uptime_s: secondsBetween(stat.mtimeMs, deps.now()),
				errors_24h: scan.errors_24h,
				last_error_at: scan.last_error_at,
				last_error: scan.last_error,
			};
		} catch (error) {
			return {
				ok: false,
				error: oneLine(error),
				log_path: deps.logPath,
				log_bytes: null,
				log_updated_at: null,
				uptime_s: null,
				errors_24h: null,
				last_error_at: null,
				last_error: null,
			};
		}
	}

	return {
		all: () => ({
			ledger: ledger(),
			sync: sync(),
			daemon: daemon(),
			container: containerVitals(),
		}),
		ledger,
	};
}

/** Count errors in the last day of a log tail, plus the newest one's line. */
export function scanLog(
	tail: string,
	nowMs: number,
): {
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

/** The last `bytes` of a file, as text: the daemon log is read this way, never whole. */
export function readTail(file: string, bytes: number): string {
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

/** How long PID 1 has been running, from `/proc/1/stat` cross-checked with `/proc/uptime`. */
export function containerVitals(): ContainerVitals {
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
