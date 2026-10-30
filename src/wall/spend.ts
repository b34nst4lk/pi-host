// Ollama Cloud spend, behind a cache and a rate limit.
//
// The upstream allows ~10 requests per minute per account and the wall polls every
// 10 s, so an uncached reader would eat the budget in one page load. Policy (see
// wall/CONTRACT.md): cache for 60 s, hard-cap ourselves at 10 upstream requests per
// rolling minute, and never fail the page when the cache can still answer — a 429
// serves the cache with `stale:true` and a one-line `error`.
//
// Field mapping is defensive on purpose: the account we are reading returns only
// `request_count` for usage and legacy percentages plus `purchased.balance_usd` for
// balance, while other accounts return tokens and `balance_usd`. Missing means
// `null` on the wire, and `raw` always carries the upstream object verbatim.
import fs from "node:fs";
import {
	num,
	parseRecord,
	type SpendBalance,
	type SpendLimits,
	type SpendReport,
	type SpendUsage,
	VERSION,
	isoNow,
	secondsBetween,
	str,
} from "./contract.ts";

export type SpendOptions = {
	readonly apiBase: string;
	readonly apiKey?: string | null;
	/** Read the key from here when `apiKey` is absent (mounted secret). */
	readonly keyFile?: string;
	readonly fetchImpl?: typeof globalThis.fetch;
	readonly now?: () => number;
	readonly cacheTtlMs?: number;
	readonly windowMs?: number;
	readonly maxPerWindow?: number;
};

export type SpendReader = {
	report(): Promise<SpendReport>;
	/** For tests and /api/health: how much of the minute's budget is gone. */
	limits(): SpendLimits;
};

type CacheEntry = { usage: SpendUsage | null; balance: SpendBalance | null; fetchedAt: number };

export function createSpend(options: SpendOptions): SpendReader {
	const now = options.now ?? Date.now;
	const doFetch = options.fetchImpl ?? globalThis.fetch;
	const cacheTtlMs = options.cacheTtlMs ?? 60_000;
	const windowMs = options.windowMs ?? 60_000;
	const maxPerWindow = options.maxPerWindow ?? 10;

	let cache: CacheEntry | null = null;
	let calls: number[] = [];
	/** One upstream round trip at a time: a burst of tabs must not multiply calls. */
	let inFlight: Promise<SpendReport> | null = null;

	function limits(): SpendLimits {
		calls = calls.filter((at) => now() - at < windowMs);
		return { window_s: Math.round(windowMs / 1000), max_per_minute: maxPerWindow, used_in_window: calls.length };
	}

	function apiKey(): string | null {
		if (options.apiKey) return options.apiKey;
		if (!options.keyFile) return null;
		try {
			const value = fs.readFileSync(options.keyFile, "utf8").trim();
			return value === "" ? null : value;
		} catch {
			return null;
		}
	}

	function served(
		entry: CacheEntry,
		flags: { cached: boolean; stale: boolean; error: string | null },
	): SpendReport {
		return {
			v: VERSION,
			ok: true,
			generated_at: isoNow(now()),
			fetched_at: isoNow(entry.fetchedAt),
			age_s: secondsBetween(entry.fetchedAt, now()),
			cached: flags.cached,
			stale: flags.stale,
			error: flags.error,
			limits: limits(),
			usage: entry.usage,
			balance: entry.balance,
		};
	}

	function empty(problem: string): SpendReport {
		return {
			v: VERSION,
			ok: false,
			generated_at: isoNow(now()),
			fetched_at: null,
			age_s: null,
			cached: false,
			stale: false,
			error: problem,
			limits: limits(),
			usage: null,
			balance: null,
		};
	}

	async function upstream(path: string, key: string): Promise<{ ok: boolean; status: number; body: unknown; error: string | null }> {
		calls.push(now());
		try {
			const response = await doFetch(`${options.apiBase}${path}`, {
				headers: { authorization: `Bearer ${key}`, accept: "application/json" },
			});
			if (!response.ok) {
				// Read (and discard) the body so the connection can be reused.
				await response.text().catch(() => "");
				return { ok: false, status: response.status, body: null, error: `upstream ${response.status}` };
			}
			const body = (await response.json()) as unknown;
			return { ok: true, status: response.status, body, error: null };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { ok: false, status: 0, body: null, error: `upstream unreachable: ${message.split("\n")[0]}` };
		}
	}

	async function refresh(): Promise<SpendReport> {
		const budget = limits();
		if (budget.used_in_window >= maxPerWindow) {
			const problem = `self-capped at ${maxPerWindow} upstream requests per minute`;
			return cache ? served(cache, { cached: true, stale: true, error: problem }) : empty(problem);
		}

		const key = apiKey();
		if (key === null) {
			return cache
				? served(cache, { cached: true, stale: true, error: "no Ollama API key" })
				: empty("no Ollama API key");
		}

		const [usageResult, balanceResult] = await Promise.all([
			upstream("/api/usage?range=24h", key),
			upstream("/api/balance", key),
		]);

		const rateLimited = usageResult.status === 429 || balanceResult.status === 429;
		const problem = usageResult.error ?? balanceResult.error;
		if (!usageResult.ok || !balanceResult.ok) {
			const oneLine = rateLimited
				? `upstream 429${cache ? `; serving cache from ${secondsBetween(cache.fetchedAt, now())}s ago` : ""}`
				: (problem ?? "upstream failed");
			return cache ? served(cache, { cached: true, stale: true, error: oneLine }) : empty(oneLine);
		}

		const entry: CacheEntry = {
			usage: mapUsage(usageResult.body),
			balance: mapBalance(balanceResult.body),
			fetchedAt: now(),
		};
		cache = entry;
		return served(entry, { cached: false, stale: false, error: null });
	}

	return {
		limits,
		report() {
			const fresh = cache !== null && now() - cache.fetchedAt < cacheTtlMs;
			if (fresh && cache) return Promise.resolve(served(cache, { cached: true, stale: false, error: null }));
			inFlight ??= refresh().finally(() => {
				inFlight = null;
			});
			return inFlight;
		},
	};
}

// --- upstream → contract --------------------------------------------------

export function mapUsage(body: unknown): SpendUsage {
	const record = parseRecord(body);
	// This account nests the numbers under `totals`; others answer at the top level.
	const usage =
		(record && isRecord(record.usage) ? record.usage : null) ??
		(record && isRecord(record.totals) ? record.totals : null) ??
		record;
	return {
		range: "24h",
		requests: firstNumber(usage, ["request_count", "requests", "count"]),
		input_tokens: firstNumber(usage, ["input_tokens", "inputTokens", "prompt_tokens"]),
		output_tokens: firstNumber(usage, ["output_tokens", "outputTokens", "completion_tokens"]),
		raw: body,
	};
}

export function mapBalance(body: unknown): SpendBalance {
	const record = parseRecord(body);
	const purchased = record && isRecord(record.purchased) ? record.purchased : null;
	const included = record && isRecord(record.included) ? record.included : null;
	const session = included && isRecord(included.session) ? included.session : null;
	// Upstream reports what is *left* (session and weekly windows); the contract asks
	// what is used, so the session's remaining percent is inverted. No session window
	// means we say nothing rather than invent a percentage.
	const remaining =
		firstNumber(session, ["remaining_percent", "remainingPercent"]) ??
		firstNumber(record, ["remaining_percent"]);
	const percent =
		firstNumber(record, ["percent_used", "percentUsed", "used_percent"]) ??
		firstNumber(purchased, ["percent_used", "percentUsed"]) ??
		(remaining === null ? null : Math.round((100 - remaining) * 100) / 100);
	return {
		balance_usd: firstNumber(record, ["balance_usd", "balanceUsd", "balance"]) ?? firstNumber(purchased, ["balance_usd"]),
		purchased_usd: firstNumber(purchased, ["purchased_usd", "amount_usd"]),
		percent_used: percent,
		currency: str(record?.currency) ?? "USD",
		raw: body,
	};
}

function firstNumber(record: Record<string, unknown> | null, keys: readonly string[]): number | null {
	if (!record) return null;
	for (const key of keys) {
		const value = num(record[key]);
		if (value !== null) return value;
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
