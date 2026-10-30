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
	agentState,
	type AgentState,
	ANCHOR_KIND,
	anchorDetail,
	busyTasks,
	type AnchorFact,
	inboxItemCount,
	liveBusy,
	plainKind,
	REPORTER_KIND,
	ROOT_CONVERSATION,
	reporterChild,
	RUNNING_STATUSES,
	type TaskFact,
} from "./agents.ts";
import {
	AROUND_RADIUS,
	entryAt,
	humanLine,
	kindPredicate,
	likeEscape,
	type LogsQuery,
	type SearchQuery,
} from "./logs.ts";
import {
	type AgentsReport,
	type AgentReport,
	type ConversationKind,
	type ConversationSummary,
	type Counts,
	freshness,
	isoFrom,
	kindVariants,
	type LogEntry,
	num,
	parseRecord,
	secondsBetween,
	type DaemonVitals,
	type FleetReport,
	type LedgerVitals,
	type NamedAgentCard,
	type OrphanCard,
	type QueueError,
	type QueueReport,
	type SearchHit,
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
	state(): { vitals: Vitals; queue: QueueReport; fleet: FleetReport; agents: AgentsReport };
	/** One page of the logs browser; `error` set means the page could not be read. */
	logs(query: LogsQuery): { entries: LogEntry[]; next_before: number | null; error: string | null };
	/** The conversation picker: main first, then children in id order. */
	conversations(): { conversations: ConversationSummary[]; error: string | null };
	/** Does this conversation exist? `null` = the ledger could not be read at all. */
	conversationExists(id: number): boolean | null;
	/** One cross-conversation search page, newest first. */
	search(query: SearchQuery): { hits: SearchHit[]; error: string | null };
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

	function agentsReport(): AgentsReport {
		// The registry is already read for `fleet`; the cards reuse it rather than
		// reopening the same document. Projects are a second registry (`app.projects`),
		// and their cards join the same list, tagged `kind: "project"`.
		const registry = fleetReport();
		const projectsProbe = withDb((db) => projectRows(db));
		const projects = projectsProbe.value ?? [];
		const probe = withDb((db) => {
			const owners = readConversationOwners(db);
			const rootId = rootConversation(owners);
			const anchors = readAnchors(db);
			const reporting = readPendingReporterChildren(db);

			const childOfAnchor = (anchor: AnchorFact): number | null => {
				for (const [conversation, ownerTask] of owners ?? []) {
					if (ownerTask === anchor.id) return conversation;
				}
				// Fallback when `conversations` is unreadable: the anchor names the agent.
				if (anchor.name === null) return null;
				const byName = registry.agents.find((agent) => agent.name === anchor.name);
				return byName?.conversation_id ?? null;
			};

			const wanted = new Set<number>([rootId]);
			for (const agent of registry.agents) {
				if (agent.conversation_id !== null) wanted.add(agent.conversation_id);
			}
			for (const anchor of anchors) {
				const child = childOfAnchor(anchor);
				if (child !== null) wanted.add(child);
			}
			for (const project of projects) {
				if (project.conversation !== null) wanted.add(project.conversation);
			}

			// A project's card shows how much history it holds; one count per project.
			const entryCounts = new Map<number, number>();
			for (const project of projects) {
				if (project.conversation !== null) {
					entryCounts.set(project.conversation, countEntries(db, project.conversation));
				}
			}

			const facts = new Map<number, ChildFacts>();
			for (const conversation of wanted) facts.set(conversation, readChildFacts(db, conversation));
			return { owners, rootId, anchors, reporting, facts, childOfAnchor, entryCounts };
		});

		const named: NamedAgentCard[] = [];
		if (probe.value === null) {
			// Unreadable ledger: still name the agents (the registry parsed), state unknown.
			for (const agent of registry.agents) {
				named.push({
					kind: "subagent",
					name: agent.name,
					state: "unknown",
					branch: agent.branch,
					worktree: agent.worktree,
					last_reply: agent.last_report_entry,
					conversation: agent.conversation_id,
					anchor: null,
					room: null,
					cwd: null,
					summary: null,
					entries: null,
				});
			}
			for (const project of projects) {
				named.push({
					kind: "project",
					name: project.name,
					state: "unknown",
					branch: "",
					worktree: null,
					last_reply: null,
					conversation: project.conversation,
					anchor: null,
					room: project.room,
					cwd: project.cwd,
					summary: project.summary,
					entries: null,
				});
			}
			return {
				ok: false,
				error: probe.error,
				spike: { kind: "main", state: "unknown", conversation: null },
				named,
				orphans: [],
				retired: null,
				work: { in_flight: null, queued: null },
			};
		}

		const { owners, rootId, anchors, reporting, facts, childOfAnchor, entryCounts } = probe.value;
		const namedConversations = new Set<number>();
		const namedNames = new Set<string>();
		for (const agent of registry.agents) {
			namedNames.add(agent.name);
			if (agent.conversation_id !== null) namedConversations.add(agent.conversation_id);
		}
		for (const project of projects) {
			if (project.conversation !== null) namedConversations.add(project.conversation);
		}

		for (const agent of registry.agents) {
			const conversation = agent.conversation_id;
			const anchor = anchors.find((candidate) => {
				const child = childOfAnchor(candidate);
				return child !== null ? child === conversation : candidate.name === agent.name;
			}) ?? null;
			const childFacts = conversation === null ? null : facts.get(conversation) ?? null;
			named.push({
				kind: "subagent",
				name: agent.name,
				state: agentState({
					// A named agent we cannot locate is `unknown`, not `alive`.
					readable: childFacts !== null,
					tasks: childFacts?.tasks ?? [],
					inbox_items: childFacts?.inbox_items ?? null,
					live_busy: childFacts?.live_busy ?? null,
					reporter_pending: conversation !== null && reporting.has(conversation),
					anchor,
					named: true,
				}),
				branch: agent.branch,
				worktree: agent.worktree,
				last_reply: agent.last_report_entry,
				conversation,
				anchor: anchor?.id ?? null,
				room: null,
				cwd: null,
				summary: null,
				entries: null,
			});
		}

		// Projects: the same enum, the same card, a different registry. Their anchor is
		// matched by CONVERSATION only — every project anchor is named `project-anchor`,
		// so matching by name here would tag them all with the same project.
		for (const project of projects) {
			const conversation = project.conversation;
			const childFacts = conversation === null ? null : facts.get(conversation) ?? null;
			const anchor =
				(conversation === null
					? null
					: anchors.find((candidate) => childOfAnchor(candidate) === conversation) ?? null);
			named.push({
				kind: "project",
				name: project.name,
				state: agentState({
					readable: childFacts !== null,
					tasks: childFacts?.tasks ?? [],
					inbox_items: childFacts?.inbox_items ?? null,
					live_busy: childFacts?.live_busy ?? null,
					reporter_pending: conversation !== null && reporting.has(conversation),
					anchor,
					named: true,
				}),
				branch: "",
				worktree: null,
				last_reply: null,
				conversation,
				anchor: anchor?.id ?? null,
				room: project.room,
				cwd: project.cwd,
				summary: project.summary,
				entries: conversation === null ? null : (entryCounts.get(conversation) ?? 0),
			});
		}

		const orphans: OrphanCard[] = [];
		let retired = 0;
		for (const anchor of anchors) {
			if (anchor.status === "terminal") {
				retired += 1;
				continue;
			}
			const conversation = childOfAnchor(anchor);
			const namedAnchor =
				(conversation !== null && namedConversations.has(conversation)) ||
				(anchor.name !== null && namedNames.has(anchor.name));
			if (namedAnchor) continue;
			orphans.push({ anchor: anchor.id, conversation });
		}

		const rootFacts = facts.get(rootId) ?? null;
		const spike = agentState({
			readable: rootFacts !== null,
			tasks: rootFacts?.tasks ?? [],
			inbox_items: rootFacts?.inbox_items ?? null,
			live_busy: rootFacts?.live_busy ?? null,
			reporter_pending: false,
			anchor: null,
			named: true,
		});

		return {
			ok: true,
			error: probe.error,
			spike: { kind: "main", state: spike, conversation: rootId },
			named: named.sort((a, b) => a.name.localeCompare(b.name)),
			orphans: orphans.sort((a, b) => a.anchor - b.anchor),
			retired,
			work: {
				in_flight: rootFacts === null ? null : busyTasks(rootFacts.tasks).length,
				queued: rootFacts?.inbox_items ?? null,
			},
		};
	}

	function logs(query: LogsQuery): { entries: LogEntry[]; next_before: number | null; error: string | null } {
		// Thread names come from the registry the fleet already reads: an entry whose
		// conversation is a named subagent's is that subagent's line.
		const threads = new Map<number, string>();
		for (const agent of fleetReport().agents) {
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

	function conversations(): { conversations: ConversationSummary[]; error: string | null } {
		// The enum is the agent cards' enum: this function lines states up with the
		// spaces the ledger holds, it does not decide them.
		const agents = agentsReport();
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

	function conversationExists(id: number): boolean | null {
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
		for (const conversation of conversations().conversations) titles.set(conversation.id, conversation.title);
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

	return {
		health,
		logs,
		conversations,
		conversationExists,
		search,
		state: () => ({
			vitals: {
				ledger: ledgerVitals(),
				sync: syncVitals(),
				daemon: daemonVitals(),
				container: containerVitals(),
			},
			queue: queueReport(),
			fleet: fleetReport(),
			agents: agentsReport(),
		}),
	};
}

// --- the project registry --------------------------------------------------

/** One bound project, as the daemon recorded it in `app.projects`. */
type ProjectRow = {
	readonly name: string;
	readonly room: string | null;
	readonly conversation: number | null;
	readonly cwd: string | null;
	readonly summary: string | null;
};

/** Anchor kinds the daemon writes for a project (a project is an anchor too). */
const PROJECT_ANCHOR_KIND = "project-anchor";

/**
 * `app.projects`: the daemon's project registry. It stores POINTERS (room,
 * conversation, directory, the path of `AGENTS.md`), so the wall can name a
 * project but not quote its instructions — which is right: the file is the
 * source of truth and it changes without a daemon restart.
 *
 * A project whose record is unreadable is skipped, never invented.
 */
function projectRows(db: DatabaseSync): ProjectRow[] {
	const doc = readDocument(db, "app.projects");
	const record = parseRecord(doc?.state);
	const projects = record ? parseRecord(record.projects) : null;
	if (!projects) return [];
	const out: ProjectRow[] = [];
	for (const [name, raw] of Object.entries(projects)) {
		const entry = parseRecord(raw);
		if (!entry) continue;
		out.push({
			name,
			room: str(entry.room),
			conversation: num(entry.conversation),
			cwd: str(entry.cwd),
			summary: str(entry.summary),
		});
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

// --- per-conversation facts the agent enum needs ---------------------------

type ChildFacts = {
	readonly tasks: TaskFact[];
	readonly inbox_items: number | null;
	readonly live_busy: boolean | null;
};

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

/** `conversations`: id → owner_task_id (the anchor). Null when the table is unreadable. */
function readConversationOwners(db: DatabaseSync): Map<number, number | null> | null {
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
function rootConversation(owners: Map<number, number | null> | null): number {
	if (owners === null || owners.size === 0) return ROOT_CONVERSATION;
	const roots = [...owners.entries()].filter(([, ownerTask]) => ownerTask === null).map(([id]) => id);
	return roots.length === 0 ? ROOT_CONVERSATION : Math.min(...roots);
}

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

function readTasks(db: DatabaseSync, conversation: number): TaskFact[] {
	const rows = db
		.prepare("select id, kind, status, conversation_id from tasks where conversation_id = ?")
		.all(conversation) as Record<string, unknown>[];
	const out: TaskFact[] = [];
	for (const row of rows) {
		const id = num(row.id);
		if (id === null) continue;
		out.push({
			id,
			kind: plainKind(row.kind),
			status: str(row.status) ?? "unknown",
			conversation: num(row.conversation_id),
		});
	}
	return out;
}

/** How many entries one conversation holds (a project card's "entries" figure). */
function countEntries(db: DatabaseSync, conversation: number): number {
	try {
		const row = db
			.prepare("select count(*) as total from entries where conversation_id = ?")
			.get(conversation) as { total?: unknown } | undefined;
		return num(row?.total) ?? 0;
	} catch {
		return 0;
	}
}

function readChildFacts(db: DatabaseSync, conversation: number): ChildFacts {
	const inbox = readDocumentFor(db, "pi.inbox", conversation);
	const live = readDocumentFor(db, "pi.live", conversation);
	return {
		tasks: readTasks(db, conversation),
		inbox_items: inboxItemCount(inbox?.state),
		live_busy: liveBusy(live?.state),
	};
}

/**
 * Anchor tasks live in the main conversation; they own the child conversations.
 * Both kinds count: a subagent's anchor (retirable) and a project's anchor
 * (long-lived) hold a conversation the same way, and the state enum must see
 * both or a retired project would read as alive.
 */
function readAnchors(db: DatabaseSync): AnchorFact[] {
	const [plain, quoted] = kindVariants(ANCHOR_KIND);
	const [projectPlain, projectQuoted] = kindVariants(PROJECT_ANCHOR_KIND);
	const rows = db
		.prepare("select id, status, conversation_id, record from tasks where kind in (?, ?, ?, ?) order by id")
		.all(plain, quoted, projectPlain, projectQuoted) as Record<string, unknown>[];
	const out: AnchorFact[] = [];
	for (const row of rows) {
		const id = num(row.id);
		if (id === null) continue;
		out.push({
			id,
			status: str(row.status) ?? "unknown",
			conversation: num(row.conversation_id),
			name: anchorDetail(parseRecord(row.record)).name,
		});
	}
	return out;
}

/** Children with a reporter task still in flight in the main conversation. */
function readPendingReporterChildren(db: DatabaseSync): Set<number> {
	const [plain, quoted] = kindVariants(REPORTER_KIND);
	const rows = db
		.prepare(
			`select record from tasks where kind in (?, ?) and status in (${placeholders(RUNNING_STATUSES)})`,
		)
		.all(plain, quoted, ...RUNNING_STATUSES) as Record<string, unknown>[];
	const out = new Set<number>();
	for (const row of rows) {
		const child = reporterChild(parseRecord(row.record));
		if (child !== null) out.add(child);
	}
	return out;
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
	return id === null ? null : replayRevisions(db, id);
}

/** The same replay, for a document that belongs to one conversation (`pi.inbox`, `pi.live`). */
function readDocumentFor(db: DatabaseSync, kind: string, conversationId: number): DocumentValue | null {
	const [plain, quoted] = kindVariants(kind);
	const doc = db
		.prepare(
			`select id from documents where kind in (?, ?) and scope_kind = 'conversation' and owner_id = ? and retired_at is null order by id desc limit 1`,
		)
		.get(plain, quoted, conversationId) as { id?: unknown } | undefined;
	const id = num(doc?.id);
	return id === null ? null : replayRevisions(db, id);
}

function replayRevisions(db: DatabaseSync, documentId: number): DocumentValue {
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
