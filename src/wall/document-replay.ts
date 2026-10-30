// The document replay engine: `documents` holds metadata, the content lives in
// `document_revisions` as a `base` snapshot followed by `delta` revisions, each
// delta a list of `[op, path, value]` edits (`s` set, `t` truncate, `a` append).
// The live value of the sync cursor, the subagent fleet or a project registry is
// therefore base + replay, which is what `readDocument` returns.
//
// Everything here is a pure function of the rows it is handed (plus the db handle
// to fetch them): no ledger, no server, no clock. A revision that will not parse
// is skipped, never fatal — a half-written delta must not take the wall down.
import type { DatabaseSync } from "node:sqlite";
import { isRecord, kindVariants, num } from "./contract.ts";

export type DocumentValue = { seq: number; state: unknown };

/** The live value of a document: newest `base` revision, then its deltas. */
export function readDocument(db: DatabaseSync, kind: string): DocumentValue | null {
	const [plain, quoted] = kindVariants(kind);
	const doc = db
		.prepare(
			"select id from documents where kind in (?, ?) and retired_at is null order by id desc limit 1",
		)
		.get(plain, quoted) as { id?: unknown } | undefined;
	const id = num(doc?.id);
	return id === null ? null : replayRevisions(db, id);
}

/** The same replay, for a document that belongs to one conversation (`pi.inbox`, `pi.live`). */
export function readDocumentFor(db: DatabaseSync, kind: string, conversationId: number): DocumentValue | null {
	const [plain, quoted] = kindVariants(kind);
	const doc = db
		.prepare(
			`select id from documents where kind in (?, ?) and scope_kind = 'conversation' and owner_id = ? and retired_at is null order by id desc limit 1`,
		)
		.get(plain, quoted, conversationId) as { id?: unknown } | undefined;
	const id = num(doc?.id);
	return id === null ? null : replayRevisions(db, id);
}

export function replayRevisions(db: DatabaseSync, documentId: number): DocumentValue {
	let state: unknown = null;
	let seq = 0;
	const revisions = db
		.prepare(
			"select seq, kind, content from document_revisions where document_id = ? order by seq asc",
		)
		.all(documentId) as { seq: unknown; kind: unknown; content: unknown }[];
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
