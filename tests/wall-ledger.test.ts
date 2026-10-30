// The ledger, the spend reader and the HTTP surface that serves them.
//
// The scratch database is built by hand (see `wall-fixtures.ts`) so these tests
// own its shape: one base revision plus `s`/`t`/`a` deltas for the sync cursor,
// an unanswered submission with a reason, and a row whose `record` is not JSON.

import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LIVE_MAX_AGE_S, type SpendReport, freshness, oneLine } from "../src/wall/contract.ts";
import { createLedger } from "../src/wall/ledger.ts";
import { createSpend, mapBalance, mapUsage } from "../src/wall/spend.ts";
import { cleanupScratch, fakeFetch, fixture, json, reader, serve, tempDir, wall } from "./wall-fixtures.ts";

/** Every scratch directory is removed after each test, pass or fail. */
afterEach(cleanupScratch);

// --- ledger ----------------------------------------------------------------

describe("ledger", () => {
	it("replays base + delta documents and reports the cursor as fresh", () => {
		const { dbPath, logPath } = fixture();
		const ledger = createLedger({ dbPath, logPath });

		const sync = ledger.state().vitals.sync;
		expect(sync.ok).toBe(true);
		expect(sync.batch).toBe("1299"); // "1234" → truncate(2) "12" → append "99"
		expect(sync.seq).toBe(5);
		expect(sync.state).toBe("live");
		expect(sync.age_s).toBeLessThanOrEqual(LIVE_MAX_AGE_S);
	});

	it("counts what is live and what is finished, and keeps the reason of a dead submission", () => {
		const { dbPath, logPath } = fixture();
		const state = createLedger({ dbPath, logPath }).state();

		expect(state.vitals.ledger.ok).toBe(true);
		expect(state.vitals.ledger.entries).toBe(1);
		expect(state.vitals.ledger.tasks_live).toBe(1);
		expect(state.queue.tasks.running).toBe(1);
		expect(state.queue.tasks.terminal).toBe(1);
		expect(state.queue.submissions.unanswered).toBe(1);
		expect(state.queue.errors[0]).toMatchObject({ status: "unanswered", conversation_id: 1, request_id: "subagent:2393" });
	});

	it("merges the two places a report can be recorded", () => {
		const { dbPath, logPath } = fixture();
		const fleet = createLedger({ dbPath, logPath }).state().fleet;

		expect(fleet.ok).toBe(true);
		const byName = Object.fromEntries(fleet.agents.map((agent) => [agent.name, agent]));
		expect(byName.reader).toMatchObject({ reports: 1, last_report_entry: 2393, state: "reported", branch: "worktree-reader" });
		// 2409 is a task id in `reporters`, not an answer: no answer, no last reply.
		expect(byName["wall-ui"]).toMatchObject({ reports: 0, last_report_entry: null, state: "waiting" });
	});

	it("degrades to nulls — never throws — when the ledger is missing", () => {
		const dir = tempDir();
		const ledger = createLedger({ dbPath: path.join(dir, "nope.sqlite"), logPath: path.join(dir, "nope.log") });

		expect(ledger.health()).toMatchObject({ ledger_ok: false });
		const state = ledger.state();
		expect(state.vitals.ledger).toMatchObject({ ok: false, entries: null, bytes: null });
		expect(state.vitals.ledger.error).toBeTypeOf("string");
		expect(state.vitals.sync.state).toBe("unknown");
		expect(state.vitals.daemon).toMatchObject({ ok: false, log_bytes: null });
		expect(state.queue.ok).toBe(false);
		expect(state.fleet.agents).toEqual([]);
	});

	it("says unknown, not stale, when there is nothing to age", () => {
		expect(freshness(null)).toBe("unknown");
		expect(freshness(0)).toBe("live");
		expect(freshness(LIVE_MAX_AGE_S + 1)).toBe("slow");
		expect(oneLine(new Error("boom\nstack"))).toBe("boom");
	});
});

describe("spend", () => {
	it("maps the two shapes the account actually returns", () => {
		const usage = mapUsage({ range: "24h", totals: { request_count: 1202 }, buckets: [] });
		expect(usage.requests).toBe(1202);
		expect(usage.input_tokens).toBeNull();

		const balance = mapBalance({
			included: { session: { remaining_percent: 48.56 } },
			purchased: { balance_usd: 0 },
		});
		expect(balance.balance_usd).toBe(0);
		expect(balance.percent_used).toBeCloseTo(51.44, 2);
		// No session window: say nothing rather than invent a percentage.
		expect(mapBalance({ purchased: { balance_usd: 1 } }).percent_used).toBeNull();
	});

	it("serves the cache inside the TTL and refreshes after it", async () => {
		const clock = { now: 1_000_000 };
		const fetcher = fakeFetch([
			() => json({ totals: { request_count: 1 } }),
			() => json({ purchased: { balance_usd: 5 } }),
			() => json({ totals: { request_count: 2 } }),
			() => json({ purchased: { balance_usd: 6 } }),
		]);
		const spend = reader(fetcher.fetchImpl, clock);

		const first = await spend.report();
		expect(fetcher.calls()).toBe(2); // usage + balance
		expect(first).toMatchObject({ ok: true, cached: false, stale: false, error: null });

		clock.now += 30_000;
		const cached = await spend.report();
		expect(fetcher.calls()).toBe(2);
		expect(cached).toMatchObject({ ok: true, cached: true, stale: false, age_s: 30 });

		clock.now += 40_000;
		const refreshed = await spend.report();
		expect(fetcher.calls()).toBe(4);
		expect(refreshed.usage?.requests).toBe(2);
	});

	it("serves stale cache with one line when upstream rate-limits", async () => {
		const clock = { now: 2_000_000 };
		const fetcher = fakeFetch([
			() => json({ totals: { request_count: 7 } }),
			() => json({ purchased: { balance_usd: 1 } }),
			() => new Response("slow down", { status: 429 }),
			() => new Response("slow down", { status: 429 }),
		]);
		const spend = reader(fetcher.fetchImpl, clock);

		await spend.report();
		clock.now += 61_000;
		const stale = await spend.report();

		expect(stale.ok).toBe(true);
		expect(stale.stale).toBe(true);
		expect(stale.cached).toBe(true);
		expect(stale.error).toContain("429");
		expect(stale.usage?.requests).toBe(7);
	});

	it("caps itself at ten upstream requests per rolling minute", async () => {
		const clock = { now: 3_000_000 };
		// Cache off, so every call wants the network and the budget is the only brake.
		const spend = createSpend({
			apiBase: "https://example.test",
			apiKey: "test-key",
			now: () => clock.now,
			cacheTtlMs: 0,
			fetchImpl: (async (url: string) =>
				String(url).includes("usage")
					? json({ totals: { request_count: 1 } })
					: json({ purchased: { balance_usd: 1 } })) as unknown as typeof globalThis.fetch,
		});

		const reports: SpendReport[] = [];
		for (let round = 0; round < 6; round += 1) reports.push(await spend.report());

		// Five rounds spend the whole minute's budget (2 calls each), the sixth is capped.
		expect(spend.limits()).toMatchObject({ max_per_minute: 10, used_in_window: 10 });
		const capped = reports[5] as SpendReport;
		expect(capped.ok).toBe(true);
		expect(capped.stale).toBe(true);
		expect(capped.error).toContain("self-capped");
		expect(capped.usage?.requests).toBe(1);

		// A minute later the budget refills and the reader refreshes again.
		clock.now += 61_000;
		expect((await spend.report()).stale).toBe(false);
	});

	it("reports a miss without a cache instead of inventing numbers", async () => {
		const clock = { now: 4_000_000 };
		const fetcher = fakeFetch([() => new Response("nope", { status: 500 }), () => new Response("nope", { status: 500 })]);
		const spend = reader(fetcher.fetchImpl, clock);

		const report = await spend.report();
		expect(report).toMatchObject({ ok: false, usage: null, balance: null, stale: false });
		expect(report.error).toContain("500");
	});
});

describe("server", () => {
	it("answers /api with JSON and no-store, and never with HTML", async () => {
		const { handler } = wall(fixture());
		const { server, base } = await serve(handler);
		try {
			for (const [route, key] of [
				["/api/health", "ledger_ok"],
				["/api/state", "vitals"],
				["/api/spend", "usage"],
			] as const) {
				const response = await fetch(`${base}${route}`);
				expect(response.status).toBe(200);
				expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
				expect(response.headers.get("cache-control")).toBe("no-store");
				const body = (await response.json()) as Record<string, unknown>;
				expect(body.v).toBe(1);
				expect(body.ok).toBe(true);
				expect(body).toHaveProperty(key);
			}

			const unknown = await fetch(`${base}/api/nope`);
			expect(unknown.status).toBe(404);
			expect(unknown.headers.get("content-type")).toContain("application/json");
			expect(((await unknown.json()) as SpendReport & { error: string }).error).toContain("/api/nope");

			const post = await fetch(`${base}/api/state`, { method: "POST" });
			expect(post.status).toBe(405);
			expect(post.headers.get("content-type")).toContain("application/json");
		} finally {
			server.close();
		}
	});

	it("serves the UI and refuses to leave the assets directory", async () => {
		const { handler } = wall(fixture());
		const { server, base } = await serve(handler);
		try {
			const index = await fetch(`${base}/`);
			expect(index.status).toBe(200);
			expect(index.headers.get("content-type")).toBe("text/html; charset=utf-8");
			expect(await index.text()).toContain("THE WALL");

			const module = await fetch(`${base}/assets/wall.mjs`);
			expect(module.status).toBe(200);
			expect(module.headers.get("content-type")).toBe("text/javascript; charset=utf-8");

			for (const escape of ["/../package.json", "/assets/../../package.json", "/%2e%2e/%2e%2e/etc/passwd"]) {
				const response = await fetch(`${base}${escape}`);
				expect(response.status).toBe(404);
			}
			expect((await fetch(`${base}/index.gleam`)).status).toBe(404);

			const head = await fetch(`${base}/api/health`, { method: "HEAD" });
			expect(head.status).toBe(200);
			expect(await head.text()).toBe("");
		} finally {
			server.close();
		}
	});
});

