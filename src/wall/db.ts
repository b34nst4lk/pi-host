// Talking to the ledger file. One read-only connection per probe, closed again
// immediately: the daemon owns this SQLite file and the wall is a guest, so a
// probe that fails (missing table, half-written row, locked file) becomes a
// one-line `error` rather than an exception on the wire.
//
// `PRAGMA query_only` is belt-and-braces on top of `readOnly` open: even a bug
// that tried to write here cannot.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ROOT_CONVERSATION } from "./agents.ts";
import { num, oneLine } from "./contract.ts";

/** The result of one probe: a value, or the one-line reason there is none. */
export type Probe<T> = { value: T | null; error: string | null };

/** Run `body` against a fresh read-only connection; any failure becomes `error`. */
export type WithDb = <T>(body: (db: DatabaseSync) => T) => Probe<T>;

export function createWithDb(dbPath: string): WithDb {
	function open(): DatabaseSync {
		const db = new DatabaseSync(dbPath, { readOnly: true });
		db.exec("PRAGMA query_only = 1");
		db.exec("PRAGMA busy_timeout = 2000");
		return db;
	}

	return function withDb<T>(body: (db: DatabaseSync) => T): Probe<T> {
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
	};
}

/** One `select count(*) as n …`, or `null` when the table is not there. */
export function count(db: DatabaseSync, sql: string, params: readonly string[] = []): number | null {
	try {
		const row = db.prepare(sql).get(...params) as { n?: unknown } | undefined;
		return num(row?.n);
	} catch {
		return null;
	}
}

export function fileSize(file: string): number | null {
	try {
		return fs.statSync(file).size;
	} catch {
		return null;
	}
}

/** Newest mtime of the database and its WAL: the ledger's last write. */
export function lastWriteMs(dbPath: string): number | null {
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

export function placeholders(values: readonly string[]): string {
	return values.map(() => "?").join(", ");
}

export function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** `"subagent:2393"` → `subagent:2393`; anything else is left alone. */
export function unquote(value: string | null): string | null {
	if (value === null || value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
	try {
		const parsed: unknown = JSON.parse(value);
		return typeof parsed === "string" ? parsed : value;
	} catch {
		return value;
	}
}

// --- the ledger's shape ----------------------------------------------------

/** `conversations`: id → owner_task_id (the anchor). Null when the table is unreadable. */
export function readConversationOwners(db: DatabaseSync): Map<number, number | null> | null {
	try {
		const rows = db.prepare("select id, owner_task_id from conversations").all() as Record<string, unknown>[];
		const out = new Map<number, number | null>();
		for (const row of rows) {
			const id = num(row.id);
			if (id !== null) out.set(id, num(row.owner_task_id));
		}
		return out;
	} catch {
		return null;
	}
}

/** The main conversation: the one nothing owns. pi-spike lives there. */
export function rootConversation(owners: Map<number, number | null> | null): number {
	if (owners === null || owners.size === 0) return ROOT_CONVERSATION;
	const roots = [...owners.entries()].filter(([, ownerTask]) => ownerTask === null).map(([id]) => id);
	return roots.length === 0 ? ROOT_CONVERSATION : Math.min(...roots);
}
