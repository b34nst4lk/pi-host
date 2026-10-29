// Pure formatters for the Ollama-facing room commands (/usage, /balance,
// /models, /embed). No I/O, no fetch, no env: the daemon does the calls
// (src/ollama_api.ts) and hands the parsed JSON here, so every rendering rule is
// testable without a homeserver or an API key.
//
// Shapes are typed from LIVE responses (2026-10-28), and EVERY metric is
// optional on purpose: ollama.com reports `request_count` only on this plan and
// nests `groups` inside `totals`/`buckets`, while the metered shape also carries
// `usage_usd` and token counters. A formatter that printed "$0.00" or "NaN"
// because a plan does not meter would be lying about spend.

/** Range tokens the API accepts, in the order the command documents them. */
export const USAGE_RANGES = ["24h", "7d", "30d"] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];

/** Every metric the usage endpoint may report. All optional: plans differ. */
export type UsageMetrics = {
	readonly request_count?: number;
	readonly usage_usd?: number;
	readonly input_tokens?: number;
	readonly cached_input_tokens?: number;
	readonly output_tokens?: number;
};

/** One model's share, present only when `group_by=model` was requested. */
export type UsageGroup = UsageMetrics & { readonly model: string };

/** One time bucket; `partial` marks the still-open one at the end of the window. */
export type UsageBucket = UsageMetrics & {
	readonly from?: string;
	readonly until?: string;
	readonly partial?: boolean;
	readonly groups?: readonly UsageGroup[];
};

export type UsageReport = UsageMetrics & {
	readonly range?: string;
	readonly scope?: string;
	readonly granularity?: string;
	readonly group_by?: string;
	readonly from?: string;
	readonly until?: string;
	readonly totals?: UsageMetrics & { readonly groups?: readonly UsageGroup[] };
	readonly groups?: readonly UsageGroup[];
	readonly buckets?: readonly UsageBucket[];
};

/** Either the metered shape (usd + allowance period) or the legacy percent shape. */
export type BalanceReport = {
	readonly included?: {
		readonly balance_usd?: number;
		readonly allowance_usd?: number;
		readonly period?: { readonly from?: string; readonly until?: string };
		readonly session?: { readonly remaining_percent?: number; readonly resets_at?: string };
		readonly weekly?: { readonly remaining_percent?: number; readonly resets_at?: string };
	};
	readonly purchased?: { readonly balance_usd?: number };
};

export type CloudModel = { readonly name: string; readonly capabilities?: readonly string[] };
export type TagsReport = { readonly models?: readonly CloudModel[] };

export type EmbedReport = {
	readonly model?: string;
	readonly embeddings?: readonly (readonly number[])[];
	readonly prompt_eval_count?: number;
};

/** 999 → "999" · 1000 → "1.0K" · 756000 → "756.0K" · 1570574 → "1.6M". */
export function compactNumber(value: number): string {
	if (!Number.isFinite(value)) return "0";
	const magnitude = Math.abs(value);
	if (magnitude < 1000) return String(Math.trunc(value));
	if (magnitude < 1_000_000) return `${(value / 1000).toFixed(1)}K`;
	if (magnitude < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	return `${(value / 1_000_000_000).toFixed(1)}B`;
}

/** Request counts are exact — compaction is for token counts, not for events. */
function count(value: number | undefined): string {
	return String(Math.trunc(value ?? 0));
}

/** Spend in dollars; sub-cent amounts are shown as "<$0.01" rather than rounded to zero. */
export function formatUsd(value: number): string {
	if (!Number.isFinite(value)) return "$0.00";
	if (value > 0 && value < 0.01) return "<$0.01";
	return `$${value.toFixed(2)}`;
}

/** An ISO instant as the room shows it: minute precision, no seconds or fractions. */
export function stamp(iso: string): string {
	const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(iso);
	if (match !== null) return match[1];
	const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
	return dateOnly !== null ? dateOnly[1] : iso;
}

/** A window edge: minute precision for hourly buckets, date only for daily ones. */
function edge(iso: string | undefined, granularity: string | undefined): string | undefined {
	if (iso === undefined) return undefined;
	return granularity === "hour" ? stamp(iso) : stamp(iso).slice(0, 10);
}

/** `totals.groups` is the live location; the top-level `groups` is kept for the documented shape. */
function usageGroups(report: UsageReport): readonly UsageGroup[] {
	return report.totals?.groups ?? report.groups ?? [];
}

/** The metered line: only when the plan actually reports token counters. */
function tokenLine(metrics: UsageMetrics): string | undefined {
	const input = metrics.input_tokens;
	const output = metrics.output_tokens;
	const cached = metrics.cached_input_tokens;
	if (input === undefined && output === undefined) return undefined;
	const parts: string[] = [];
	if (input !== undefined) {
		parts.push(cached !== undefined && cached > 0 ? `${compactNumber(input)} in (${compactNumber(cached)} cached)` : `${compactNumber(input)} in`);
	}
	if (output !== undefined) parts.push(`${compactNumber(output)} out`);
	return `tokens ${parts.join(" · ")}`;
}

/**
 * Render a usage report as room lines: a totals line, the optional token line,
 * the top `maxGroups` model groups, and the current bucket last (its `partial`
 * flag matters — the window is still open).
 */
export function formatUsage(report: UsageReport, maxGroups = 5): string[] {
	const totals: UsageMetrics = report.totals ?? report;
	const parts = [`usage ${report.range ?? "?"}`];
	const from = edge(report.from, report.granularity);
	const until = edge(report.until, report.granularity);
	if (from !== undefined && until !== undefined) parts.push(`${from}→${until}`);
	if (report.granularity !== undefined) parts.push(report.granularity);
	parts.push(`${count(totals.request_count)} req`);
	if (totals.usage_usd !== undefined) parts.push(formatUsd(totals.usage_usd));
	const lines = [parts.join(" · ")];

	const tokens = tokenLine(totals);
	if (tokens !== undefined) lines.push(tokens);

	usageGroups(report)
		.slice(0, maxGroups)
		.forEach((group, index) => {
			const groupParts = [`#${index + 1} ${group.model}`, `${count(group.request_count)} req`];
			if (group.usage_usd !== undefined) groupParts.push(formatUsd(group.usage_usd));
			lines.push(groupParts.join(" · "));
		});

	const last = report.buckets?.[report.buckets.length - 1];
	if (last !== undefined) {
		const open = last.partial === true ? " (partial)" : "";
		const bucketParts = [`latest ${last.from === undefined ? "?" : stamp(last.from)}${open}`, `${count(last.request_count)} req`];
		lines.push(bucketParts.join(" · "));
	}
	return lines;
}

/** One line: metered (included/purchased dollars) or legacy (session/weekly percent left). */
export function formatBalance(report: BalanceReport): string {
	const parts = ["balance"];
	const included = report.included;
	if (included?.balance_usd !== undefined) {
		parts.push(
			included.allowance_usd === undefined
				? `included ${formatUsd(included.balance_usd)}`
				: `included ${formatUsd(included.balance_usd)} of ${formatUsd(included.allowance_usd)}`,
		);
		const from = included.period?.from;
		const until = included.period?.until;
		if (from !== undefined && until !== undefined) parts.push(`${stamp(from).slice(0, 10)}→${stamp(until).slice(0, 10)}`);
	}
	const percent = (label: string, window: { readonly remaining_percent?: number; readonly resets_at?: string } | undefined) => {
		if (window?.remaining_percent === undefined) return;
		const left = `${window.remaining_percent.toFixed(1)}% left`;
		parts.push(window.resets_at === undefined ? `${label} ${left}` : `${label} ${left} (resets ${stamp(window.resets_at)})`);
	};
	percent("session", included?.session);
	percent("weekly", included?.weekly);
	if (report.purchased?.balance_usd !== undefined) parts.push(`purchased ${formatUsd(report.purchased.balance_usd)}`);
	return parts.length === 1 ? "balance · no balance reported" : parts.join(" · ");
}

/** The cloud catalogue: name plus capabilities, capped so the room stays readable. */
export function formatModels(report: TagsReport, limit = 20): string[] {
	const models = report.models ?? [];
	const header = models.length > limit ? `models ${models.length} (showing ${limit})` : `models ${models.length}`;
	const lines = models.slice(0, limit).map((model) => `${model.name} [${(model.capabilities ?? []).join(" ")}]`);
	return [header, ...lines];
}

/**
 * An embedding reply, minus the vector: name, dims, input count, eval count, and
 * the first four values. Dumping a 1024-float vector into a chat room is not a
 * diagnostic, it is spam.
 */
export function formatEmbed(report: EmbedReport, inputCount: number, shown = 4): string {
	const vector = report.embeddings?.[0] ?? [];
	const parts = [
		`embed ${report.model ?? "?"}`,
		`${vector.length} dims`,
		`${inputCount} input${inputCount === 1 ? "" : "s"}`,
	];
	if (report.prompt_eval_count !== undefined) parts.push(`eval ${report.prompt_eval_count}`);
	const head = vector.slice(0, shown).map((value) => value.toFixed(4));
	const tail = vector.length > shown ? ` (first ${shown} of ${vector.length})` : "";
	parts.push(`[${head.join(", ")}]${tail}`);
	return parts.join(" · ");
}
