// Reader tests: the ledger is someone else's file, so most of what is pinned here
// is behaviour under bad input — a missing table, an unparsable record, a document
// that only exists as a delta chain, an upstream that rate-limits us.
//
// The scratch database is built by hand so the tests own its shape: one base
// revision plus `s`/`t`/`a` deltas for the sync cursor, agents in both places they
// can appear (the agent's `reported` array and the `reporters` map), an unanswered
// submission with a reason, and a row whose `record` is not JSON at all.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { LIVE_MAX_AGE_S, freshness } from "../src/wall/contract.ts";
import { createLedger, oneLine } from "../src/wall/ledger.ts";
import { createSpend, mapBalance, mapUsage } from "../src/wall/spend.ts";
import { createHandler } from "../src/wall/server.ts";
import type { SpendReport } from "../src/wall/contract.ts";
import type { SpendReader } from "../src/wall/spend.ts";

// --- fixtures --------------------------------------------------------------

const scratch: string[] = [];

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wall-test-"));
	scratch.push(dir);
	return dir;
}

afterEach(() => {
	while (scratch.length > 0) {
		const dir = scratch.pop();
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	}
});

/** Documents store kinds JSON-quoted; mirror the real ledger. */
function quoted(kind: string): string {
	return JSON.stringify(kind);
}

function newDb(file: string): DatabaseSync {
	const db = new DatabaseSync(file);
	db.exec(`
		CREATE TABLE entries (id INTEGER PRIMARY KEY, conversation_id INTEGER, head INTEGER, commit_seq INTEGER, record TEXT);
		CREATE TABLE tasks (id INTEGER PRIMARY KEY, conversation_id INTEGER, kind TEXT, status TEXT, abort_requested INTEGER, background INTEGER, record TEXT);
		CREATE TABLE submissions (id INTEGER PRIMARY KEY, conversation_id INTEGER, request_id TEXT, status TEXT, record TEXT);
		CREATE TABLE documents (id INTEGER PRIMARY KEY, kind TEXT, family INTEGER, key_value TEXT, scope_kind TEXT, owner_id INTEGER, created_at INTEGER, retired_at INTEGER, record TEXT);
		CREATE TABLE document_revisions (document_id INTEGER, seq INTEGER, kind TEXT, version INTEGER, content TEXT);
	`);
	return db;
}

/** A document that only reaches its final value through base + deltas. */
function writeDocument(db: DatabaseSync, id: number, kind: string, base: unknown, deltas: [number, unknown][]): void {
	db.prepare("INSERT INTO documents (id, kind, record) VALUES (?, ?, ?)").run(id, quoted(kind), "{}");
	db.prepare("INSERT INTO document_revisions (document_id, seq, kind, version, content) VALUES (?, ?, ?, 1, ?)").run(
		id,
		1,
		"base",
		JSON.stringify(base),
	);
	for (const [seq, delta] of deltas) {
		db.prepare("INSERT INTO document_revisions (document_id, seq, kind, version, content) VALUES (?, ?, ?, 1, ?)").run(
			id,
			seq,
			"delta",
			JSON.stringify(delta),
		);
	}
}

type Fixture = { dbPath: string; logPath: string };

function fixture(): Fixture {
	const dir = tempDir();
	const dbPath = path.join(dir, "session.sqlite");
	const logPath = path.join(dir, "daemon.log");
	const db = newDb(dbPath);

	db.prepare("INSERT INTO entries (id, conversation_id, head, commit_seq, record) VALUES (1, 1, 0, 1, '{}')").run();
	db.prepare(
		"INSERT INTO tasks (id, conversation_id, kind, status, abort_requested, background, record) VALUES (1, 1, 'turn', 'running', 0, 0, '{}')",
	).run();
	db.prepare(
		"INSERT INTO tasks (id, conversation_id, kind, status, abort_requested, background, record) VALUES (2, 1, 'turn', 'terminal', 0, 1, '{}')",
	).run();
	db.prepare(
		"INSERT INTO submissions (id, conversation_id, request_id, status, record) VALUES (1, 1, ?, 'unanswered', ?)",
	).run(
		quoted("subagent:2393"),
		JSON.stringify({ conversationId: 1, requestId: "subagent:2393", status: "unanswered", reason: "no_model" }),
	);
	db.prepare(
		// A row the reader must survive: `record` is not JSON at all.
		"INSERT INTO submissions (id, conversation_id, request_id, status, record) VALUES (2, 1, ?, 'done', 'not json')",
	).run(quoted("req-2"));

	// The cursor: `s` sets, `t` truncates the string, `a` appends to it.
	writeDocument(db, 7, "app.sync-state", { batch: "1", seen: [] }, [
		[2, [["s", ["batch"], "1234"]]],
		[3, [["t", ["batch"], 2]]],
		[4, [["a", ["batch"], "99"]]],
		[5, [["s", ["seen"], ["a", "b"]]]],
	]);
	// The fleet: one agent reported through its array, one only through `reporters`.
	writeDocument(
		db,
		8,
		"app.subagents",
		{
			agents: {
				reader: { conversationId: 2166, reported: [2393], worktree: "/w/reader" },
				"wall-ui": { conversationId: 2402, reported: [], worktree: "/w/wall-ui" },
			},
			reporters: { "wall-ui": 2409 },
		},
		[],
	);
	db.close();

	fs.writeFileSync(logPath, "2026-01-01T00:00:00Z started\n2026-01-01T00:01:00Z error: upstream fell over\n", "utf8");
	return { dbPath, logPath };
}

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
		expect(byName["wall-ui"]).toMatchObject({ reports: 1, last_report_entry: 2409, state: "reported" });
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

// --- spend -----------------------------------------------------------------

/** A fetch that answers from a queue and counts its calls. */
function fakeFetch(responses: (() => Response)[]): { fetchImpl: typeof globalThis.fetch; calls: () => number } {
	let index = 0;
	const impl = (async () => {
		const make = responses[Math.min(index, responses.length - 1)] as () => Response;
		index += 1;
		return make();
	}) as unknown as typeof globalThis.fetch;
	return { fetchImpl: impl, calls: () => index };
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function reader(fetchImpl: typeof globalThis.fetch, clock: { now: number }): SpendReader {
	return createSpend({
		apiBase: "https://example.test",
		apiKey: "test-key",
		fetchImpl,
		now: () => clock.now,
	});
}

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

// --- server ----------------------------------------------------------------

async function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>) {
	const server = http.createServer((req, res) => void handler(req, res));
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	return { server, port, base: `http://127.0.0.1:${port}` };
}

function wall(fixturePaths: Fixture) {
	const dir = tempDir();
	fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>THE WALL</title>", "utf8");
	fs.mkdirSync(path.join(dir, "assets"));
	fs.writeFileSync(path.join(dir, "assets", "wall.mjs"), "export {};\n", "utf8");
	const ledger = createLedger({ dbPath: fixturePaths.dbPath, logPath: fixturePaths.logPath });
	const spend = createSpend({
		apiBase: "https://example.test",
		apiKey: "k",
		fetchImpl: (async () => json({ totals: { request_count: 3 } })) as unknown as typeof globalThis.fetch,
	});
	const handler = createHandler({ ledger, spend, assetsDir: dir });
	return { handler, assets: dir };
}

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
