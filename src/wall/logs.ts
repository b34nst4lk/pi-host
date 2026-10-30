// The logs browser, reader side. Two kinds of code, both defensive:
//
//  * `parseLogsQuery` / `likeEscape` / `kindPredicate` — turn a query string into
//    clamped SQL parameters. Nothing here throws: a junk `limit` is the default, a
//    junk `before` is "the newest page", an unknown `dir` is `desc`.
//  * `humanLine` — one rendered line per ledger entry. This is the only place that
//    knows what an entry *means*; the wall prints the line and offers the raw
//    record on expand. A record that does not parse renders `unknown entry`, never
//    a crash and never an invented line.
//
// The entry `kind` lives inside the JSON record (`entries` has no kind column), so
// kind filtering goes through JSON1 (`json_valid` guard first: a half-written row
// must not fail the whole page).
//
// Round four added two more readers over the same table: `conversation` selects
// one space and `around` centres a window on one entry (the "land in context"
// mechanism), while `search` matches the whole record text across every
// conversation. Both reuse `kindPredicate` and `likeEscape`: one escape rule, one
// definition of what a `kind=` list means.
import fs from "node:fs";
import path from "node:path";
import { isRecord } from "./contract.ts";

/** Page size when the caller says nothing, and the hard ceiling. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/**
 * `?around=<id>` is a window, not a page: this many entries on either side of the
 * anchor (so 51 rows with the anchor itself). The wall uses it to land a search
 * hit in its own context instead of at the top of a conversation.
 */
export const AROUND_RADIUS = 25;

/** Cross-conversation search: one page, no paging, capped like the logs are. */
export const DEFAULT_SEARCH_LIMIT = 25;
export const MAX_SEARCH_LIMIT = 100;

/** A spill larger than this is served truncated (the browser is not a pager). */
export const MAX_SPILL_BYTES = 4 * 1024 * 1024;

/**
 * The `/api/spill` allowlist. The reader never reads outside these roots — a
 * diagnostic path is data from the ledger, not a request for arbitrary files.
 */
export const DEFAULT_SPILL_ROOTS: readonly string[] = ["/opt/pi-host"];

export type LogDirection = "asc" | "desc";

export type LogsQuery = {
	readonly before: number | null;
	readonly limit: number;
	readonly kinds: readonly string[];
	readonly dir: LogDirection;
	readonly q: string;
	/** Which conversation to read; `null` means "the main one" (see `ledger.ts`). */
	readonly conversation: number | null;
	/** Centre a ±`AROUND_RADIUS` window on this entry id instead of paging. */
	readonly around: number | null;
};

export type SearchQuery = {
	readonly q: string;
	readonly kinds: readonly string[];
	readonly limit: number;
};

/** The kinds the contract names; anything else is still listable by its own name. */
export const KNOWN_KINDS: readonly string[] = [
	"pi.user",
	"pi.assistant",
	"pi.tool-result",
	"pi.compaction",
	"pi.system",
];

function positiveInt(raw: string | null): number | null {
	if (raw === null || raw.trim().length === 0) return null;
	const value = Number(raw);
	if (!Number.isFinite(value)) return null;
	const whole = Math.trunc(value);
	return whole > 0 ? whole : null;
}

export function parseLogsQuery(params: URLSearchParams): LogsQuery {
	const limitRaw = positiveInt(params.get("limit"));
	const limit = limitRaw === null ? DEFAULT_LIMIT : Math.min(limitRaw, MAX_LIMIT);
	const kinds = (params.get("kind") ?? "")
		.split(",")
		.map((kind) => kind.trim())
		.filter((kind) => kind.length > 0);
	return {
		before: positiveInt(params.get("before")),
		limit,
		kinds,
		dir: params.get("dir") === "asc" ? "asc" : "desc",
		q: (params.get("q") ?? "").trim(),
		// A junk conversation id is not an error here: the server rejects an id that
		// is not a number, and `null` is the documented default (the main
		// conversation). Existence is checked against the ledger, not the syntax.
		conversation: positiveInt(params.get("conversation")),
		around: positiveInt(params.get("around")),
	};
}

/**
 * The search query. Unlike `/api/logs` an empty `q` is not clamped to "everything":
 * a search for nothing is a mistake, and the server answers it as one.
 */
export function parseSearchQuery(params: URLSearchParams): SearchQuery {
	const limitRaw = positiveInt(params.get("limit"));
	const kinds = (params.get("kind") ?? "")
		.split(",")
		.map((kind) => kind.trim())
		.filter((kind) => kind.length > 0);
	return {
		q: (params.get("q") ?? "").trim(),
		kinds,
		limit: limitRaw === null ? DEFAULT_SEARCH_LIMIT : Math.min(limitRaw, MAX_SEARCH_LIMIT),
	};
}

/**
 * Escape a literal for `LIKE … ESCAPE '\'`. Without this, `q=100%` matches
 * everything and `q=pi_tool` matches `pi.tool` — a search box that lies.
 */
export function likeEscape(value: string): string {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** `app.*` is a prefix match over `app.`; everything else is an exact kind. */
function isPrefixKind(kind: string): boolean {
	return kind.endsWith("*");
}

/**
 * The SQL predicate for a kind filter list, plus its parameters. An empty list is
 * "all kinds": the wall's unfiltered tab must show `app.*` entries too, and those
 * are not in any fixed enumeration.
 */
export function kindPredicate(kinds: readonly string[]): { sql: string; params: string[] } {
	if (kinds.length === 0) return { sql: "1 = 1", params: [] };
	const parts: string[] = [];
	const params: string[] = [];
	const kindOf = "case when json_valid(record) then json_extract(record, '$.kind') else null end";
	for (const kind of kinds) {
		if (isPrefixKind(kind)) {
			const prefix = kind.slice(0, -1);
			parts.push(`${kindOf} like ? escape '\\'`);
			params.push(`${likeEscape(prefix)}%`);
		} else {
			parts.push(`${kindOf} = ?`);
			params.push(kind);
		}
	}
	return { sql: `(${parts.join(" or ")})`, params };
}

// --- the human line -------------------------------------------------------

function oneLine(text: string, max = 500): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function firstLine(text: string, max = 160): string {
	const line = text.split("\n").map((part) => part.trim()).find((part) => part.length > 0) ?? "";
	return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** The text of a message content: a string, or the `text` blocks of a block list. */
function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (!isRecord(block)) continue;
		if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
	}
	return parts.join("\n");
}

function isoFromMs(value: unknown): string | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The timestamp of an entry record: `model[0].timestamp`, in milliseconds. Split
 * out of `humanLine` because the conversation picker needs it without rendering a
 * line, and one definition of "when" is better than two.
 */
export function entryAt(record: unknown): string | null {
	if (!isRecord(record)) return null;
	const message = Array.isArray(record.model) && isRecord(record.model[0]) ? record.model[0] : null;
	return message === null ? null : isoFromMs(message.timestamp);
}

/** Where the full output of a spilled tool call lives, when the record says so. */
export function spillPathOf(record: Record<string, unknown>): string | null {
	const data = isRecord(record.data) ? record.data : null;
	if (data === null) return null;
	if (typeof data.fullOutputPath === "string" && data.fullOutputPath.length > 0) return data.fullOutputPath;
	const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
	for (const diagnostic of diagnostics) {
		if (!isRecord(diagnostic)) continue;
		if (diagnostic.code !== "full_output") continue;
		const message = typeof diagnostic.message === "string" ? diagnostic.message : "";
		const at = message.indexOf(": ");
		if (at !== -1) return message.slice(at + 2).trim();
	}
	return null;
}

export type HumanLine = {
	readonly kind: string;
	readonly text: string;
	readonly at: string | null;
	readonly spill: string | null;
};

/**
 * One rendered line for one entry record. The rules, per kind:
 *
 *  * `pi.user` — the input, verbatim;
 *  * `pi.assistant` — its text, its thinking (it is the agent's own mind: it is
 *    shown by default), and each tool call as `name: <first line of args>`;
 *  * `pi.tool-result` — the tool's first output line, `error` marked;
 *  * `pi.compaction` — the first line of the summary;
 *  * `pi.system` — the first line of the system preamble;
 *  * anything else (`app.*`, unknown) — its kind and its `data`, one line.
 */
export function humanLine(record: unknown): HumanLine {
	if (!isRecord(record)) return { kind: "unknown", text: "unknown entry", at: null, spill: null };
	const kind = typeof record.kind === "string" && record.kind.length > 0 ? record.kind : "unknown";
	const message = Array.isArray(record.model) && isRecord(record.model[0]) ? record.model[0] : null;
	const at = entryAt(record);
	const spill = spillPathOf(record);

	switch (kind) {
		case "pi.user": {
			const text = oneLine(contentText(message?.content));
			return { kind, text: text.length > 0 ? text : "empty input", at, spill };
		}
		case "pi.system": {
			const sections = message !== null && isRecord(message.sections) ? message.sections : null;
			const preamble = sections !== null && typeof sections.preamble === "string" ? sections.preamble : "";
			const line = firstLine(preamble, 200);
			return { kind, text: line.length > 0 ? `prompt: ${line}` : "system prompt", at, spill };
		}
		case "pi.assistant": {
			const content = message !== null && Array.isArray(message.content) ? message.content : [];
			const parts: string[] = [];
			for (const block of content) {
				if (!isRecord(block)) continue;
				if (block.type === "text" && typeof block.text === "string") {
					const text = oneLine(block.text, 400);
					if (text.length > 0) parts.push(text);
					continue;
				}
				if (block.type === "thinking" && typeof block.thinking === "string") {
					const text = firstLine(block.thinking, 240);
					if (text.length > 0) parts.push(`thinking: ${text}`);
					continue;
				}
				if (block.type === "toolCall") {
					const name = typeof block.name === "string" ? block.name : "tool";
					const args = isRecord(block.arguments) ? JSON.stringify(block.arguments) : String(block.arguments ?? "");
					parts.push(`${name}: ${firstLine(args, 160)}`);
				}
			}
			return { kind, text: parts.length > 0 ? oneLine(parts.join(" · "), 800) : "empty answer", at, spill };
		}
		case "pi.tool-result": {
			const name = message !== null && typeof message.toolName === "string" ? message.toolName : "tool";
			const output = firstLine(contentText(message?.content), 300);
			const failed = message !== null && message.isError === true;
			const body = output.length > 0 ? output : "no output";
			return { kind, text: `${failed ? "error " : ""}${name}: ${body}`, at, spill };
		}
		case "pi.compaction": {
			const line = firstLine(contentText(message?.content), 300);
			return { kind, text: line.length > 0 ? `summary: ${line}` : "compaction summary", at, spill };
		}
		default: {
			// No kind at all is a record we do not understand: say only that.
			if (kind === "unknown") return { kind, text: "unknown entry", at, spill };
			const data = record.data;
			const body = data === undefined ? JSON.stringify(record) : JSON.stringify(data);
			return { kind, text: oneLine(`${kind}: ${body}`, 400), at, spill };
		}
	}
}

// --- the spill file -------------------------------------------------------

export type SpillResult =
	| { readonly ok: true; readonly path: string; readonly bytes: number; readonly truncated: boolean; readonly text: string }
	| { readonly ok: false; readonly error: string };

function insideRoot(resolved: string, root: string): boolean {
	const base = path.resolve(root);
	return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

/**
 * Serve one diagnostic spill file, read-only and strictly scoped.
 *
 * Rejections, in order: no path; `..` anywhere (a decoded `%2e%2e%2f` arrives here
 * as `..`, which is exactly why the check is on the decoded value); a relative
 * path (no cwd-relative reads); anything outside the allowlist roots after
 * `path.resolve`; a symlink; anything that is not a regular file. Only then a
 * bounded read.
 */
export function readSpill(
	rawPath: string | null | undefined,
	options: { readonly roots?: readonly string[]; readonly maxBytes?: number } = {},
): SpillResult {
	const roots = options.roots ?? DEFAULT_SPILL_ROOTS;
	const maxBytes = options.maxBytes ?? MAX_SPILL_BYTES;
	if (typeof rawPath !== "string" || rawPath.trim().length === 0) return { ok: false, error: "path is required" };
	const requested = rawPath.trim();
	if (requested.includes("\0")) return { ok: false, error: "path rejected" };
	if (requested.split(/[/\\]/).includes("..")) return { ok: false, error: "path rejected" };
	if (!path.isAbsolute(requested)) return { ok: false, error: "path rejected" };
	const resolved = path.resolve(requested);
	if (!roots.some((root) => insideRoot(resolved, root))) return { ok: false, error: "path outside the allowlist" };
	let stat: fs.Stats;
	try {
		stat = fs.lstatSync(resolved);
	} catch {
		return { ok: false, error: "no such file" };
	}
	if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, error: "not a regular file" };
	let handle: number | null = null;
	try {
		handle = fs.openSync(resolved, "r");
		// The lstat above is advisory: re-check the opened handle, so a path swapped
		// for a symlink between the two calls cannot slip through.
		if (!fs.fstatSync(handle).isFile()) return { ok: false, error: "not a regular file" };
		const length = Math.min(stat.size, maxBytes);
		const buffer = Buffer.alloc(length);
		const read = length === 0 ? 0 : fs.readSync(handle, buffer, 0, length, 0);
		return {
			ok: true,
			path: resolved,
			bytes: stat.size,
			truncated: stat.size > maxBytes,
			text: buffer.subarray(0, read).toString("utf8"),
		};
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message.split("\n")[0] : "read failed" };
	} finally {
		if (handle !== null) {
			try {
				fs.closeSync(handle);
			} catch {
				// closing a descriptor cannot usefully fail
			}
		}
	}
}
