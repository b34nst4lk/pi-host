// The three reading surfaces of the archive: the conversation picker, one page of
// the logs browser, and cross-conversation search. All three answer from the same
// rows, so they name a space the same way — a title from the picker is also the
// title a search hit shows.
//
// The picker's states are the agent cards' states (it lines them up, it does not
// decide them), which is why this module reads the fleet's report rather than
// re-deriving `agentState()` from raw tasks.
import type { DatabaseSync } from "node:sqlite";
import { ROOT_CONVERSATION, type AgentState } from "./agents.ts";
import type { ConversationKind, ConversationSummary, LogEntry, SearchHit } from "./contract.ts";
import { num, parseRecord } from "./contract.ts";
import { isNumber, placeholders, readConversationOwners, rootConversation, type WithDb } from "./db.ts";
import { readAnchors, type Fleet } from "./fleet.ts";
import {
	AROUND_RADIUS,
	entryAt,
	humanLine,
	kindPredicate,
	likeEscape,
	type LogsQuery,
	type SearchQuery,
} from "./logs.ts";

export type Conversations = {
	logs(query: LogsQuery): { entries: LogEntry[]; next_before: number | null; error: string | null };
	all(): { conversations: ConversationSummary[]; error: string | null };
	exists(id: number): boolean | null;
	search(query: SearchQuery): { hits: SearchHit[]; error: string | null };
};

export function createConversations(deps: { readonly withDb: WithDb; readonly fleet: Fleet }): Conversations {
	const { withDb, fleet } = deps;

	function logs(query: LogsQuery): { entries: LogEntry[]; next_before: number | null; error: string | null } {
		// Thread names come from the registry the fleet already reads: an entry whose
		// conversation is a named subagent's is that subagent's line.
		const threads = new Map<number, string>();
		for (const agent of fleet.fleet().agents) {
			if (agent.conversation_id !== null && !threads.has(agent.conversation_id)) {
				threads.set(agent.conversation_id, agent.name);
			}
		}
		const predicate = kindPredicate(query.kinds);
		const probe = withDb((db) => {
			// Which space: the caller's conversation, else the root — whichever one
			// nothing owns, never a hardcoded id 1.
			const conversation = query.conversation ?? rootConversation(readConversationOwners(db));
			const base = `from entries where conversation_id = ? and ${predicate.sql}`;
			const baseParams: (string | number)[] = [conversation, ...predicate.params];
			if (query.around !== null) return aroundWindow(db, base, baseParams, query.around);
			const where: string[] = [];
			const params: (string | number)[] = [...baseParams];
			if (query.before !== null) {
				where.push("id < ?");
				params.push(query.before);
			}
			if (query.q.length > 0) {
				// The whole record is the searchable text: every text field lives there,
				// and LIKE is ASCII case-insensitive, which is what a search box wants.
				where.push("record like ? escape '\\'");
				params.push(`%${likeEscape(query.q)}%`);
			}
			const sql = `select id, conversation_id, record ${base}${where.length === 0 ? "" : ` and ${where.join(" and ")}`} order by id desc limit ?`;
			// One row past the page tells us whether `next_before` exists at all.
			const rows = db.prepare(sql).all(...params, query.limit + 1) as Record<string, unknown>[];
			const hasMore = rows.length > query.limit;
			const page = hasMore ? rows.slice(0, query.limit) : rows;
			const oldest = page.length === 0 ? null : num(page[page.length - 1]?.id);
			return { rows: page, next_before: hasMore ? oldest : null };
		});
		if (probe.error !== null) return { entries: [], next_before: null, error: probe.error };
		const result = probe.value ?? { rows: [], next_before: null };
		const entries = result.rows.map((row) => logEntry(row, threads));
		return {
			// `dir` is page order, not selection order: the page is always the newest
			// rows older than the cursor, shown either way round. A window is always
			// ascending — it is context, and time only reads one way.
			entries: query.dir === "asc" && query.around === null ? [...entries].reverse() : entries,
			next_before: result.next_before,
			error: null,
		};
	}

	function all(): { conversations: ConversationSummary[]; error: string | null } {
		// The enum is the agent cards' enum: this function lines states up with the
		// spaces the ledger holds, it does not decide them.
		const agents = fleet.agents();
		const named = new Map<number, { state: AgentState; name: string }>();
		for (const card of agents.named) {
			if (card.conversation !== null) named.set(card.conversation, { state: card.state, name: card.name });
		}
		const orphans = new Set<number>();
		for (const orphan of agents.orphans) {
			if (orphan.conversation !== null) orphans.add(orphan.conversation);
		}

		const probe = withDb((db) => {
			const rows = readConversationRows(db);
			const spans = readEntrySpans(db);
			const anchors = new Map(readAnchors(db).map((anchor) => [anchor.id, anchor] as const));
			const stamps = readSpanStamps(db, spans);
			return { rows, spans, anchors, stamps, rootId: rootConversation(readConversationOwners(db)) };
		});
		if (probe.error !== null || probe.value === null) {
			return { conversations: [], error: probe.error ?? "the conversations could not be read" };
		}
		const { rows, spans, anchors, stamps, rootId } = probe.value;

		// Every conversation the ledger mentions: the table's rows, plus any id only
		// the entries know about (a table that lags behind its own log).
		const known = new Map(rows.map((row) => [row.id, row] as const));
		for (const id of spans.keys()) {
			if (known.has(id)) continue;
			known.set(id, { id, kind: id === rootId ? "main" : "child", owner_task_id: null });
		}

		const out: ConversationSummary[] = [];
		for (const row of known.values()) {
			const span = spans.get(row.id) ?? { entries: 0, first: null, last: null };
			const card = named.get(row.id) ?? null;
			const anchor = row.owner_task_id === null ? null : (anchors.get(row.owner_task_id) ?? null);
			const state: AgentState =
				card !== null
					? card.state
					: row.id === rootId
						? agents.spike.state
						: orphans.has(row.id)
							? "orphaned"
							: anchor?.status === "terminal"
								? "retired"
								: "unknown";
			const title =
				row.kind === "main" ? "main" : (card?.name ?? anchor?.name ?? `conversation ${row.id}`);
			out.push({
				id: row.id,
				kind: row.kind,
				title,
				state,
				entries: span.entries,
				first_at: span.first === null ? null : (stamps.get(span.first) ?? null),
				last_at: span.last === null ? null : (stamps.get(span.last) ?? null),
			});
		}
		// Main pinned first, children in id order: the picker's order is the
		// reader's job, so every client agrees about it.
		return { conversations: out.sort(compareConversations), error: null };
	}

	function exists(id: number): boolean | null {
		const probe = withDb(
			(db) => db.prepare("select 1 as ok from conversations where id = ? limit 1").get(id) !== undefined,
		);
		if (probe.error === null) return probe.value === true;
		// No `conversations` table (an older ledger): the entries still know the space.
		const fallback = withDb(
			(db) => db.prepare("select 1 as ok from entries where conversation_id = ? limit 1").get(id) !== undefined,
		);
		return fallback.error !== null ? null : fallback.value === true;
	}

	function search(query: SearchQuery): { hits: SearchHit[]; error: string | null } {
		// Titles come from the same picker the wall renders, so a hit and a card name
		// a conversation the same way.
		const titles = new Map<number, string>();
		for (const conversation of all().conversations) titles.set(conversation.id, conversation.title);
		const predicate = kindPredicate(query.kinds);
		const probe = withDb((db) => {
			const sql = `select id, conversation_id, record from entries where ${predicate.sql} and record like ? escape '\\' order by id desc limit ?`;
			return db
				.prepare(sql)
				.all(...predicate.params, `%${likeEscape(query.q)}%`, query.limit) as Record<string, unknown>[];
		});
		if (probe.error !== null) return { hits: [], error: probe.error };
		const hits = (probe.value ?? []).map((row) => {
			const line = humanLine(parseRecord(row.record));
			const conversation = num(row.conversation_id);
			return {
				conversation_id: conversation,
				conversation_title:
					conversation === null
						? "unknown"
						: (titles.get(conversation) ?? `conversation ${conversation}`),
				entry_id: num(row.id) ?? 0,
				kind: line.kind,
				at: line.at,
				text: line.text,
			};
		});
		return { hits, error: null };
	}

	return { logs, all, exists, search };
}

/** One row of `conversations`, reduced to what the picker needs. */
type ConversationRow = {
	readonly id: number;
	readonly kind: ConversationKind;
	readonly owner_task_id: number | null;
};

/** How many entries a conversation holds, and where it starts and ends. */
type EntrySpan = {
	readonly entries: number;
	readonly first: number | null;
	readonly last: number | null;
};

/**
 * A ±`AROUND_RADIUS` window centred on one entry, ascending.
 *
 * The anchor is not required to exist: the two halves are "the entries at or below
 * the anchor" and "the entries above it", so an id past the archive end yields the
 * newest rows, an id before the start yields the oldest ones, and both boundaries
 * fall out of the same two queries rather than a third special case.
 */
function aroundWindow(
	db: DatabaseSync,
	base: string,
	baseParams: readonly (string | number)[],
	around: number,
): { rows: Record<string, unknown>[]; next_before: number | null } {
	const below = db
		.prepare(`select id, conversation_id, record ${base} and id <= ? order by id desc limit ?`)
		.all(...baseParams, around, AROUND_RADIUS + 1) as Record<string, unknown>[];
	const above = db
		.prepare(`select id, conversation_id, record ${base} and id > ? order by id asc limit ?`)
		.all(...baseParams, around, AROUND_RADIUS) as Record<string, unknown>[];
	const rows = [...[...below].reverse(), ...above];
	const oldest = rows.length === 0 ? null : num(rows[0]?.id);
	// A window can be paged further back: `before=<oldest id in the window>`.
	const older =
		oldest === null
			? undefined
			: db.prepare(`select 1 as ok ${base} and id < ? limit 1`).get(...baseParams, oldest);
	return { rows, next_before: older === undefined ? null : oldest };
}

/**
 * The spaces the ledger knows. `owner_conversation_id is null` is the main
 * conversation — the schema's own answer, not a hardcoded id. A ledger whose
 * `conversations` table is missing or empty falls back to the ids in `entries`.
 */
function readConversationRows(db: DatabaseSync): ConversationRow[] {
	const out: ConversationRow[] = [];
	try {
		const rows = db
			.prepare("select id, owner_conversation_id, owner_task_id from conversations order by id")
			.all() as Record<string, unknown>[];
		for (const row of rows) {
			const id = num(row.id);
			if (id === null) continue;
			out.push({
				id,
				kind: row.owner_conversation_id === null || row.owner_conversation_id === undefined ? "main" : "child",
				owner_task_id: num(row.owner_task_id),
			});
		}
	} catch {
		// No `conversations` table: the entries below are all we have.
	}
	if (out.length > 0) return out;
	try {
		const rows = db.prepare("select distinct conversation_id as id from entries order by id").all() as Record<
			string,
			unknown
		>[];
		for (const row of rows) {
			const id = num(row.id);
			if (id === null) continue;
			out.push({ id, kind: id === ROOT_CONVERSATION ? "main" : "child", owner_task_id: null });
		}
	} catch {
		// Nothing readable at all: an empty picker is honest.
	}
	return out;
}

/** Per conversation: how many entries, and the ids of its first and last one. */
function readEntrySpans(db: DatabaseSync): Map<number, EntrySpan> {
	const out = new Map<number, EntrySpan>();
	try {
		const rows = db
			.prepare(
				"select conversation_id, count(*) as n, min(id) as first_id, max(id) as last_id from entries group by conversation_id",
			)
			.all() as Record<string, unknown>[];
		for (const row of rows) {
			const id = num(row.conversation_id);
			if (id === null) continue;
			out.set(id, { entries: num(row.n) ?? 0, first: num(row.first_id), last: num(row.last_id) });
		}
	} catch {
		// An unreadable `entries` table leaves the counts at zero, not a failed page.
	}
	return out;
}

/** The timestamps of the boundary entries, one query for all of them. */
function readSpanStamps(db: DatabaseSync, spans: Map<number, EntrySpan>): Map<number, string | null> {
	const out = new Map<number, string | null>();
	const ids = [...new Set([...spans.values()].flatMap((span) => [span.first, span.last]).filter(isNumber))];
	if (ids.length === 0) return out;
	try {
		const rows = db
			.prepare(`select id, record from entries where id in (${placeholders(ids.map(String))})`)
			.all(...ids) as Record<string, unknown>[];
		for (const row of rows) {
			const id = num(row.id);
			if (id !== null) out.set(id, entryAt(parseRecord(row.record)));
		}
	} catch {
		// No timestamps: the picker shows `—` for both ends.
	}
	return out;
}

/** Main pinned first, then children in id order. */
function compareConversations(a: ConversationSummary, b: ConversationSummary): number {
	const rank = (conversation: ConversationSummary): number => (conversation.kind === "main" ? 0 : 1);
	const byRank = rank(a) - rank(b);
	return byRank !== 0 ? byRank : a.id - b.id;
}

/**
 * One row of `entries` as the logs browser reports it. The record is passed to
 * `humanLine` defensively (a broken row is `unknown entry`, not a failed page) and
 * also carried verbatim so the wall can expand the row without a second request.
 */
function logEntry(row: Record<string, unknown>, threads: Map<number, string>): LogEntry {
	const record = parseRecord(row.record);
	const line = humanLine(record);
	const raw =
		typeof row.record === "string"
			? row.record
			: (() => {
					try {
						return JSON.stringify(row.record ?? null);
					} catch {
						return "null";
					}
				})();
	const entry: LogEntry = { id: num(row.id) ?? 0, kind: line.kind, at: line.at, text: line.text, raw };
	const conversation = num(row.conversation_id);
	if (conversation !== null) {
		const name = threads.get(conversation);
		if (name !== undefined) entry.thread = name;
	}
	if (line.spill !== null) entry.spill = line.spill;
	return entry;
}
