// The wire format between the wall's reader and the wall's UI. Frozen at v1 in
// wall/CONTRACT.md: additive fields do not bump `v`, breaking ones do.
//
// This module is deliberately types + tiny pure helpers only — no I/O — so the
// shapes a response is built from are the same shapes the tests assert on.
export const VERSION = 1;

/** How fresh the sync cursor is; mirrors the UI's four states. */
export type Freshness = "live" | "slow" | "stale" | "unknown";

/** 90 s live, 600 s slow, else stale (contract v1). */
export const LIVE_MAX_AGE_S = 90;
export const SLOW_MAX_AGE_S = 600;

export function freshness(ageS: number | null): Freshness {
	if (ageS === null) return "unknown";
	if (ageS <= LIVE_MAX_AGE_S) return "live";
	if (ageS <= SLOW_MAX_AGE_S) return "slow";
	return "stale";
}

export function isoNow(now = Date.now()): string {
	return new Date(now).toISOString();
}

export function isoFrom(ms: number | null): string | null {
	return ms === null || !Number.isFinite(ms) ? null : new Date(ms).toISOString();
}

export function secondsBetween(fromMs: number, nowMs = Date.now()): number {
	return Math.max(0, Math.round((nowMs - fromMs) / 1000));
}

/** Every leaf the ledger side can fail to fill is nullable on purpose. */
export type LedgerVitals = {
	ok: boolean;
	error: string | null;
	path: string;
	bytes: number | null;
	wal_bytes: number | null;
	entries: number | null;
	tasks_live: number | null;
	submissions_live: number | null;
};

export type SyncVitals = {
	ok: boolean;
	error: string | null;
	batch: string | null;
	seq: number | null;
	updated_at: string | null;
	age_s: number | null;
	state: Freshness;
};

export type DaemonVitals = {
	ok: boolean;
	error: string | null;
	log_path: string;
	log_bytes: number | null;
	log_updated_at: string | null;
	uptime_s: number | null;
	errors_24h: number | null;
	last_error_at: string | null;
	last_error: string | null;
};

export type ContainerVitals = {
	ok: boolean;
	error: string | null;
	uptime_s: number | null;
	source: string;
};

export type Vitals = {
	ledger: LedgerVitals;
	sync: SyncVitals;
	daemon: DaemonVitals;
	container: ContainerVitals;
};

export type Counts = Record<"pending" | "running" | "waiting" | "completing" | "terminal", number | null>;

export type SubmissionCounts = Record<"queued" | "placed" | "done" | "unanswered", number | null>;

export type QueueError = {
	at: string | null;
	status: string;
	request_id: string | null;
	conversation_id: number | null;
};

export type QueueReport = {
	ok: boolean;
	error: string | null;
	inbox_depth: number | null;
	tasks: Counts;
	submissions: SubmissionCounts;
	background_live: number | null;
	errors: QueueError[];
};

export type AgentReport = {
	name: string;
	branch: string;
	worktree: string | null;
	conversation_id: number | null;
	reports: number;
	last_report_entry: number | null;
	state: string;
};

export type FleetReport = {
	ok: boolean;
	error: string | null;
	agents: AgentReport[];
};

export type StateReport = {
	v: typeof VERSION;
	ok: boolean;
	generated_at: string;
	vitals: Vitals;
	queue: QueueReport;
	fleet: FleetReport;
	/** Added in v1 without a version bump: agent-state cards (see wall/CONTRACT.md). */
	agents: AgentsReport;
};

// --- agents: the state enum, as cards --------------------------------------

/** Precedence order documented in `agents.ts`; `unknown` = the ledger could not be read. */
export type AgentStateValue = "working" | "queued" | "reporting" | "alive" | "orphaned" | "retired" | "unknown";

/**
 * What a card IS, so one enum covers the fleet: the wall renders one card per
 * agent and the PROJECTS view is that same list filtered by `kind`.
 *
 * - `main`     — pi-spike, the conversation nothing owns;
 * - `project`  — a room bound to a persistent child conversation (`app.projects`);
 * - `subagent` — a worktree child the daemon spawned and can retire.
 */
export type AgentKind = "main" | "project" | "subagent";

/** pi-spike itself: the main conversation, judged by the same enum. */
export type SpikeCard = {
	kind: AgentKind;
	state: AgentStateValue;
	conversation: number | null;
};

/**
 * One named agent: a subagent, or a project. `last_reply` is the newest answer
 * entry the registry knows. The project-only fields are `null` on subagent cards,
 * so the JSON shape stays one flat record and an old wall still decodes.
 */
export type NamedAgentCard = {
	kind: AgentKind;
	name: string;
	state: AgentStateValue;
	branch: string;
	worktree: string | null;
	last_reply: number | null;
	conversation: number | null;
	anchor: number | null;
	/** Projects only: the Matrix room that steers it. */
	room: string | null;
	/** Projects only: the directory the project works in. */
	cwd: string | null;
	/** Projects only: what its `AGENTS.md` says it is (first meaningful line). */
	summary: string | null;
	/** Projects only: how many entries its conversation holds. */
	entries: number | null;
};

/** A held anchor nothing names. `anchor` is the anchor task id, not the conversation. */
export type OrphanCard = {
	anchor: number;
	conversation: number | null;
};

/** Run work in the main conversation: what the wall shows instead of "running tasks". */
export type WorkCounts = {
	in_flight: number | null;
	queued: number | null;
};

export type AgentsReport = {
	ok: boolean;
	error: string | null;
	spike: SpikeCard;
	named: NamedAgentCard[];
	orphans: OrphanCard[];
	/** Terminal anchors: counted for the health line, never rendered as cards. */
	retired: number | null;
	work: WorkCounts;
};

export type SpendUsage = {
	range: string;
	requests: number | null;
	input_tokens: number | null;
	output_tokens: number | null;
	raw: unknown;
};

export type SpendBalance = {
	balance_usd: number | null;
	purchased_usd: number | null;
	percent_used: number | null;
	currency: string | null;
	raw: unknown;
};

export type SpendLimits = {
	window_s: number;
	max_per_minute: number;
	used_in_window: number;
};

export type SpendReport = {
	v: typeof VERSION;
	ok: boolean;
	generated_at: string;
	fetched_at: string | null;
	age_s: number | null;
	cached: boolean;
	stale: boolean;
	error: string | null;
	limits: SpendLimits;
	usage: SpendUsage | null;
	balance: SpendBalance | null;
};

export type HealthReport = {
	v: typeof VERSION;
	ok: boolean;
	generated_at: string;
	uptime_s: number;
	ledger_ok: boolean;
};

/** The one shape every failure shares: still JSON, still one line. */
export function failure(error: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { v: VERSION, ok: false, generated_at: isoNow(), error, ...extra };
}

/** `null` for anything that is not a finite number — bad rows never throw. */
export function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function str(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

/** Errors go on the wire as one line, never a stack. */
export function oneLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split("\n")[0]?.slice(0, 300) ?? "unknown error";
}

/** A JSON object, not an array and not null: the shape almost every record starts as. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ledger records are stored as JSON text in some eras and objects in others. */
export function parseRecord(record: unknown): Record<string, unknown> | null {
	if (record && typeof record === "object" && !Array.isArray(record)) {
		return record as Record<string, unknown>;
	}
	if (typeof record !== "string") return null;
	try {
		const parsed = JSON.parse(record) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** The documents table stores kinds JSON-quoted; accept both spellings. */
export function kindVariants(kind: string): string[] {
	return [kind, JSON.stringify(kind)];
}

// --- logs: the browser over `entries` -------------------------------------

/**
 * One ledger entry, rendered. `text` is the human line (see `logs.ts`); `raw` is
 * the record exactly as the ledger stores it, so the wall can expand the row
 * without a second request. `thread` and `spill` are absent when not applicable —
 * absent, not `null`, so the UI's "no expander" case is one check.
 */
export type LogEntry = {
	id: number;
	kind: string;
	at: string | null;
	text: string;
	thread?: string;
	spill?: string;
	raw: string;
};

export type LogsReport = {
	v: typeof VERSION;
	ok: boolean;
	error: string | null;
	generated_at: string;
	entries: LogEntry[];
	/** Cursor for the next page (`before=<next_before>`); absent at the archive start. */
	next_before?: number;
};

export type SpillReport = {
	v: typeof VERSION;
	ok: boolean;
	error: string | null;
	generated_at: string;
	path: string | null;
	bytes: number | null;
	truncated: boolean;
	text: string | null;
};

// --- conversations: the spaces the ledger holds ----------------------------

/** `main` is the conversation nothing owns (`owner_conversation_id is null`). */
export type ConversationKind = "main" | "child";

/**
 * One row of the conversation picker. `state` is the *same* enum the agent cards
 * use — deliberately not re-derived here: a conversation is a space, and the enum
 * already says what is happening inside it.
 */
export type ConversationSummary = {
	id: number;
	kind: ConversationKind;
	/** `main` for the root, the registry (or anchor) name for a child, else `conversation <id>`. */
	title: string;
	state: AgentStateValue;
	entries: number;
	/** First and last entry timestamps in this conversation; `null` when unknown. */
	first_at: string | null;
	last_at: string | null;
};

export type ConversationsReport = {
	v: typeof VERSION;
	ok: boolean;
	error: string | null;
	generated_at: string;
	/** Main first, then children in id order. */
	conversations: ConversationSummary[];
};

// --- search: one query over every conversation ----------------------------

/**
 * One match. `text` is the same human line `/api/logs` renders for the record (the
 * wall shows the line, not a snippet with the match cut out of it), and
 * `conversation_title` is the picker's title, so a hit says where it lives.
 */
export type SearchHit = {
	conversation_id: number | null;
	conversation_title: string;
	entry_id: number;
	kind: string;
	at: string | null;
	text: string;
};

export type SearchReport = {
	v: typeof VERSION;
	ok: boolean;
	error: string | null;
	generated_at: string;
	/** Newest first, at most `limit`. */
	hits: SearchHit[];
	limit: number;
	q: string;
};
