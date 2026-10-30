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
