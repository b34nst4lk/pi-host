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
import { agentState, busyTasks, inboxItemCount, liveBusy, plainKind, reporterChild, stateLabel, type AnchorFact, type TaskFact } from "../src/wall/agents.ts";
import { createLedger, oneLine } from "../src/wall/ledger.ts";
import {
	AROUND_RADIUS,
	DEFAULT_LIMIT,
	DEFAULT_SEARCH_LIMIT,
	MAX_LIMIT,
	MAX_SEARCH_LIMIT,
	humanLine,
	kindPredicate,
	likeEscape,
	parseLogsQuery,
	parseSearchQuery,
	readSpill,
	spillPathOf,
} from "../src/wall/logs.ts";
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

/** The same replay, for a document that belongs to one conversation. */
function writeDocumentFor(
	db: DatabaseSync,
	id: number,
	kind: string,
	conversation: number,
	base: unknown,
	deltas: [number, unknown][],
): void {
	db
		.prepare("INSERT INTO documents (id, kind, scope_kind, owner_id, record) VALUES (?, ?, ?, ?, ?)")
		.run(id, quoted(kind), "conversation", conversation, "{}");
	db.prepare("INSERT INTO document_revisions (document_id, seq, kind, version, content) VALUES (?, 1, ?, 1, ?)").run(
		id,
		"base",
		JSON.stringify(base),
	);
	for (const [seq, delta] of deltas) {
		db
			.prepare("INSERT INTO document_revisions (document_id, seq, kind, version, content) VALUES (?, ?, ?, 1, ?)")
			.run(id, seq, "delta", JSON.stringify(delta));
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

// --- the agent-state enum --------------------------------------------------
//
// Two layers of proof. The table below pins the precedence on hand-built facts
// (no database at all), and the fixture after it proves the reader gathers the
// right facts from the real schema: conversations → anchors, tasks by kind,
// replayed `pi.inbox` / `pi.live`, and reporter tasks still in flight.

type Facts = Parameters<typeof agentState>[0];

function facts(overrides: Partial<Facts> = {}): Facts {
	return {
		tasks: [],
		inbox_items: 0,
		live_busy: null,
		reporter_pending: false,
		anchor: null,
		named: true,
		readable: true,
		...overrides,
	};
}

const runTask = (status: string, kind = "pi.generation"): TaskFact => ({ id: 1, kind, status, conversation: 9 });
const anchor = (status: string): AnchorFact => ({ id: 99, status, conversation: 1, name: "child" });

describe("agent state enum", () => {
	it("prefers working over queued when a child is busy AND has inbox items", () => {
		expect(agentState(facts({ tasks: [runTask("running")], inbox_items: 3 }))).toBe("working");
		expect(agentState(facts({ tasks: [runTask("waiting")], inbox_items: 3 }))).toBe("working");
		expect(agentState(facts({ tasks: [runTask("running", '"pi.tool"')], inbox_items: 1 }))).toBe("working");
		expect(agentState(facts({ tasks: [runTask("running", "pi.compaction")] }))).toBe("working");
	});

	it("says queued when only the inbox has work", () => {
		expect(agentState(facts({ inbox_items: 2 }))).toBe("queued");
		expect(agentState(facts({ tasks: [runTask("terminal")], inbox_items: 2 }))).toBe("queued");
	});

	it("says reporting when the child is idle but its reporter is still running", () => {
		expect(agentState(facts({ reporter_pending: true }))).toBe("reporting");
		// ...unless the child itself is busy, which wins.
		expect(agentState(facts({ reporter_pending: true, tasks: [runTask("running")] }))).toBe("working");
	});

	it("says alive for a held anchor the registry names", () => {
		expect(agentState(facts({ anchor: anchor("running") }))).toBe("alive");
		expect(agentState(facts({ anchor: anchor("waiting") }))).toBe("alive");
	});

	it("says orphaned for a held anchor nothing names", () => {
		expect(agentState(facts({ anchor: anchor("running"), named: false }))).toBe("orphaned");
		// A busy orphan is still working: precedence is about the work, not the name.
		expect(agentState(facts({ anchor: anchor("running"), named: false, tasks: [runTask("running")] }))).toBe("working");
	});

	it("says retired for a terminal anchor", () => {
		expect(agentState(facts({ anchor: anchor("terminal") }))).toBe("retired");
		expect(agentState(facts({ anchor: anchor("terminal"), named: false }))).toBe("retired");
	});

	it("says unknown when it cannot read the ledger", () => {
		expect(agentState(facts({ readable: false, tasks: [runTask("running")] }))).toBe("unknown");
		expect(agentState(facts({ anchor: null, named: false }))).toBe("unknown");
	});

	it("trusts pi.live when there is no task row yet", () => {
		expect(agentState(facts({ live_busy: true }))).toBe("working");
		expect(agentState(facts({ live_busy: false }))).toBe("alive");
	});

	it("ignores anchor and reporter tasks when counting run work", () => {
		const tasks = [
			{ id: 1, kind: "subagent-anchor", status: "running", conversation: 1 },
			{ id: 2, kind: '"subagent-reporter"', status: "running", conversation: 1 },
		] as TaskFact[];
		expect(busyTasks(tasks)).toHaveLength(0);
		expect(agentState(facts({ tasks }))).toBe("alive");
	});

	it("reads the reporter's child from either record spelling", () => {
		expect(reporterChild({ input: { child: 2166 } })).toBe(2166);
		expect(reporterChild({ input: { conversationId: 2402 } })).toBe(2402);
		expect(reporterChild({ input: {} })).toBeNull();
		expect(reporterChild(null)).toBeNull();
	});

	it("counts inbox items and live runs defensively", () => {
		expect(inboxItemCount({ items: [{ id: 1 }, { id: 2 }] })).toBe(2);
		expect(inboxItemCount({ items: [] })).toBe(0);
		expect(inboxItemCount({})).toBeNull();
		expect(inboxItemCount(null)).toBeNull();
		expect(liveBusy({ run: { taskId: 1 } })).toBe(true);
		expect(liveBusy({ generation: { attempt: 1 } })).toBe(true);
		expect(liveBusy({})).toBe(false);
		expect(liveBusy(null)).toBeNull();
	});

	it("renders the orphan state as a prunable, unnamed agent", () => {
		expect(stateLabel("orphaned")).toBe("unnamed (prunable)");
		expect(stateLabel("working")).toBe("working");
	});

	it("unquotes ledger task kinds", () => {
		expect(plainKind('"pi.generation"')).toBe("pi.generation");
		expect(plainKind("pi.generation")).toBe("pi.generation");
		expect(plainKind("not json\"")).toBe('not json"');
		expect(plainKind(null)).toBe("");
	});
});

/** A ledger with four children in four states, one orphan and one retired anchor. */
function agentsFixture(): Fixture {
	const dir = tempDir();
	const dbPath = path.join(dir, "session.sqlite");
	const logPath = path.join(dir, "daemon.log");
	const db = newDb(dbPath);
	db.exec("CREATE TABLE conversations (id INTEGER PRIMARY KEY, owner_conversation_id INTEGER, owner_task_id INTEGER, record TEXT)");

	const task = (id: number, conversation: number, kind: string, status: string, record: unknown = {}) => {
		db.prepare("INSERT INTO tasks (id, conversation_id, kind, status, abort_requested, background, record) VALUES (?, ?, ?, ?, 0, 0, ?)").run(
			id,
			conversation,
			quoted(kind),
			status,
			JSON.stringify(record),
		);
	};
	const conversation = (id: number, ownerTask: number | null) => {
		db.prepare("INSERT INTO conversations (id, owner_conversation_id, owner_task_id, record) VALUES (?, ?, ?, '{}')").run(
			id,
			ownerTask === null ? null : 1,
			ownerTask,
		);
	};

	// The main conversation owns everything: anchors, reporters, and its own run.
	conversation(1, null);
	task(2165, 1, "subagent-anchor", "running", { input: { name: "reader" }, state: { checkpoint: { phase: "hold" } } });
	task(2401, 1, "subagent-anchor", "running", { input: { name: "wall-ui" }, state: { checkpoint: { phase: "hold" } } });
	task(2774, 1, "subagent-anchor", "running", { input: { name: "probe" }, state: { checkpoint: { phase: "hold" } } });
	task(2899, 1, "subagent-anchor", "running", { input: { name: "ghost" } });
	task(2999, 1, "subagent-anchor", "terminal", { input: { name: "finished" } });
	task(10, 1, "pi.generation", "running");
	task(11, 1, "pi.generation", "terminal");
	task(12, 1, "subagent-reporter", "running", { input: { child: 2402 } });

	// reader (2166): a live generation, and inbox items the working state outranks.
	conversation(2166, 2165);
	task(20, 2166, "pi.generation", "running");
	writeDocumentFor(db, 30, "pi.inbox", 2166, { items: [] }, [[2, [["a", ["items"], { id: "a", mode: "steer", content: "go" }]]]]);
	writeDocumentFor(db, 31, "pi.live", 2166, {}, []);

	// wall-ui (2402): idle, with a reporter still running in the main conversation.
	conversation(2402, 2401);
	task(21, 2402, "pi.generation", "terminal");
	writeDocumentFor(db, 32, "pi.inbox", 2402, { items: [] }, []);

	// probe (2775): idle with one queued steer.
	conversation(2775, 2774);
	writeDocumentFor(db, 34, "pi.inbox", 2775, { items: [] }, [
		[2, [["a", ["items"], { id: "b", mode: "followUp", content: "and then?" }]]],
	]);

	// The main conversation also has queued steer — "queued" is countable work,
	// it just loses to "working" on the spike card.
	writeDocumentFor(db, 33, "pi.inbox", 1, { items: [] }, [
		[2, [["a", ["items"], { id: "c", mode: "steer", content: "status?" }]]],
		[3, [["a", ["items"], { id: "d", mode: "followUp", content: "then rest" }]]],
	]);

	// ghost (2900): a held anchor nothing names — the orphan.
	conversation(2900, 2899);

	// finished (3000): an anchor that reached terminal, so no card at all.
	conversation(3000, 2999);

	writeDocument(
		db,
		40,
		"app.subagents",
		{
			agents: {
				reader: { conversationId: 2166, reported: [2393], worktree: "/w/reader" },
				"wall-ui": { conversationId: 2402, reported: [], worktree: "/w/wall-ui" },
				probe: { conversationId: 2775, reported: [2782], worktree: "/w/probe" },
			},
			reporters: { "wall-ui": 2409 },
		},
		[],
	);
	db.close();
	fs.writeFileSync(logPath, "", "utf8");
	return { dbPath, logPath };
}

/** The same ledger plus `app.projects`: two bound projects, one alive, one idle. */
function projectsFixture(): Fixture {
	const fixture = agentsFixture();
	const db = new DatabaseSync(fixture.dbPath);
	db.exec("CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY, owner_conversation_id INTEGER, owner_task_id INTEGER, record TEXT)");
	const task = (id: number, conversation: number, kind: string, status: string, record: unknown = {}) => {
		db.prepare("INSERT INTO tasks (id, conversation_id, kind, status, abort_requested, background, record) VALUES (?, ?, ?, ?, 0, 1, ?)").run(
			id,
			conversation,
			quoted(kind),
			status,
			JSON.stringify(record),
		);
	};
	const conversation = (id: number, ownerTask: number) => {
		db.prepare("INSERT INTO conversations (id, owner_conversation_id, owner_task_id, record) VALUES (?, 1, ?, '{}')").run(id, ownerTask);
	};
	const entry = (id: number, conversationId: number, kind: string, record: unknown) => {
		db.prepare("INSERT INTO entries (id, conversation_id, head, commit_seq, record) VALUES (?, ?, NULL, 1, ?)").run(
			id,
			conversationId,
			JSON.stringify(record),
		);
	};

	// app (3100): a project anchor holding, two entries of history, one generation.
	task(3099, 1, "project-anchor", "running", { input: { name: "project-anchor" }, state: { checkpoint: { phase: "hold" } } });
	conversation(3100, 3099);
	task(50, 3100, "pi.generation", "running");
	entry(3101, 3100, "pi.user", { kind: "pi.user", model: [{ role: "user", content: "fix it", timestamp: "2026-01-01T00:00:00.000Z" }] });
	entry(3102, 3100, "pi.assistant", { kind: "pi.assistant", model: [{ role: "assistant", content: [{ type: "text", text: "done" }] }] });
	writeDocumentFor(db, 51, "pi.inbox", 3100, { items: [] }, []);

	// docs (3200): a project with a terminal anchor — the project was retired.
	task(3199, 1, "project-anchor", "terminal", { input: { name: "project-anchor" } });
	conversation(3200, 3199);

	writeDocument(db, 52, "app.projects", {
		projects: {
			app: {
				room: "!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU",
				conversation: 3100,
				cwd: "/work/projects/app",
				instructions_path: "/work/projects/app/AGENTS.md",
				summary: "the wall",
				created: "2026-01-01T00:00:00.000Z",
			},
			docs: {
				room: "!docs:jacks.im",
				conversation: 3200,
				cwd: "/work/projects/docs",
				instructions_path: "/work/projects/docs/AGENTS.md",
				summary: "",
				created: "2026-01-02T00:00:00.000Z",
			},
		},
	}, []);
	db.close();
	return fixture;
}

describe("agents report", () => {
	it("derives every state from the ledger, in precedence order", () => {
		const { dbPath, logPath } = agentsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;

		expect(agents.ok).toBe(true);
		expect(agents.spike).toEqual({ kind: "main", state: "working", conversation: 1 });
		// One list, three kinds: the PROJECTS view is this list filtered.
		expect(agents.named.every((card) => card.kind === "subagent")).toBe(true);
		expect(agents.named.every((card) => card.room === null && card.cwd === null)).toBe(true);
		const byName = Object.fromEntries(agents.named.map((card) => [card.name, card]));
		expect(byName.reader).toMatchObject({ state: "working", conversation: 2166, anchor: 2165, last_reply: 2393 });
		expect(byName["wall-ui"]).toMatchObject({ state: "reporting", conversation: 2402, anchor: 2401 });
		expect(byName.probe).toMatchObject({ state: "queued", conversation: 2775, anchor: 2774, last_reply: 2782 });
		expect(agents.named.map((card) => card.name)).toEqual(["probe", "reader", "wall-ui"]);
	});

	it("keeps held-but-unnamed anchors visible and terminal ones out of the cards", () => {
		const { dbPath, logPath } = agentsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;

		expect(agents.orphans).toEqual([{ anchor: 2899, conversation: 2900 }]);
		expect(agents.retired).toBe(1);
		expect(agents.named.some((card) => card.anchor === 2999)).toBe(false);
	});

	it("counts work in the main conversation: in flight and queued", () => {
		const { dbPath, logPath } = agentsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;
		// One live pi.generation in the main conversation: anchors and the reporter
		// are not work. Queued counts the replayed inbox, and it does not change
		// the spike state — working still wins.
		expect(agents.work).toEqual({ in_flight: 1, queued: 2 });
		expect(agents.spike.state).toBe("working");
	});

	it("falls back to the anchor's name when conversations is unreadable", () => {
		const { dbPath, logPath } = agentsFixture();
		const db = new DatabaseSync(dbPath);
		db.exec("DROP TABLE conversations");
		db.close();

		const agents = createLedger({ dbPath, logPath }).state().agents;
		expect(agents.ok).toBe(true);
		const byName = Object.fromEntries(agents.named.map((card) => [card.name, card]));
		// Anchors are matched by `input.name`, so the cards survive the loss.
		expect(byName.reader).toMatchObject({ state: "working", anchor: 2165 });
		expect(agents.orphans.map((orphan) => orphan.anchor)).toContain(2899);
	});

	it("reports states as unknown rather than alive when the ledger is gone", () => {
		const dir = tempDir();
		const ledger = createLedger({ dbPath: path.join(dir, "missing.sqlite"), logPath: path.join(dir, "daemon.log") });
		const agents = ledger.state().agents;
		expect(agents.ok).toBe(false);
		expect(agents.error).toBeTruthy();
		expect(agents.spike.state).toBe("unknown");
		expect(agents.work).toEqual({ in_flight: null, queued: null });
		expect(agents.retired).toBeNull();
	});

	it("gives a project a card of its own kind, with its room, cwd and entry count", () => {
		const { dbPath, logPath } = projectsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;
		const projects = agents.named.filter((card) => card.kind === "project");
		expect(projects.map((card) => card.name)).toEqual(["app", "docs"]);

		const app = projects.find((card) => card.name === "app")!;
		expect(app.state).toBe("working");
		expect(app.room).toBe("!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU");
		expect(app.cwd).toBe("/work/projects/app");
		expect(app.summary).toBe("the wall");
		expect(app.conversation).toBe(3100);
		expect(app.anchor).toBe(3099);
		expect(app.entries).toBe(2);
		// a project is not a worktree agent: no branch, no worktree, no reply entry
		expect(app.branch).toBe("");
		expect(app.worktree).toBeNull();
		expect(app.last_reply).toBeNull();
	});

	it("retires a project whose anchor reached terminal, and never calls its anchor an orphan", () => {
		const { dbPath, logPath } = projectsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;
		const docs = agents.named.find((card) => card.name === "docs")!;
		expect(docs.state).toBe("retired");
		expect(agents.orphans.map((orphan) => orphan.anchor)).not.toContain(3199);
		// the subagents are untouched by the second registry
		expect(agents.named.filter((card) => card.kind === "subagent").map((card) => card.name)).toEqual([
			"probe",
			"reader",
			"wall-ui",
		]);
	});

	it("titles a project space by its project name in the picker", () => {
		const { dbPath, logPath } = projectsFixture();
		const list = createLedger({ dbPath, logPath }).conversations();
		const titles = Object.fromEntries(list.conversations.map((conversation) => [conversation.id, conversation.title]));
		expect(titles[3100]).toBe("app");
		expect(titles[3200]).toBe("docs");
	});

	it("names no project when the registry document is missing or unreadable", () => {
		const { dbPath, logPath } = agentsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;
		expect(agents.named.some((card) => card.kind === "project")).toBe(false);

		const db = new DatabaseSync(dbPath);
		writeDocument(db, 60, "app.projects", { projects: "not an object" }, []);
		db.close();
		const broken = createLedger({ dbPath, logPath }).state().agents;
		expect(broken.ok).toBe(true);
		expect(broken.named.some((card) => card.kind === "project")).toBe(false);
	});

	it("serves the agents block on /api/state", async () => {
		const { handler } = wall(agentsFixture());
		const { server, base } = await serve(handler);
		try {
			const body = (await (await fetch(`${base}/api/state`)).json()) as {
				agents: { spike: { state: string }; named: { name: string }[]; orphans: unknown[]; work: { in_flight: number } };
			};
			expect(body.agents.spike.state).toBe("working");
			expect(body.agents.named.map((card) => card.name)).toEqual(["probe", "reader", "wall-ui"]);
			expect(body.agents.orphans).toHaveLength(1);
			expect(body.agents.work.in_flight).toBe(1);
		} finally {
			server.close();
		}
	});
});

// --- logs ------------------------------------------------------------------

/** A ledger with one entry of every kind the logs tab must render. */
function logsFixture(): Fixture {
	const dir = tempDir();
	const dbPath = path.join(dir, "session.sqlite");
	const logPath = path.join(dir, "daemon.log");
	const db = newDb(dbPath);
	const entry = (id: number, conversation: number, record: unknown) =>
		db
			.prepare("INSERT INTO entries (id, conversation_id, head, commit_seq, record) VALUES (?, ?, 0, 1, ?)")
			.run(id, conversation, typeof record === "string" ? record : JSON.stringify(record));
	const at = 1_793_000_000_000;
	const user = (text: string) => ({ kind: "pi.user", model: [{ role: "user", content: text, timestamp: at }] });
	const assistant = (blocks: unknown[], conversation = 1) => ({
		kind: "pi.assistant",
		conversationId: conversation,
		model: [{ role: "assistant", content: blocks, timestamp: at }],
	});

	entry(10, 1, user("please build the wall"));
	entry(
		11,
		1,
		assistant([
			{ type: "text", text: "I'll look around." },
			{ type: "thinking", thinking: "Round 3. Plan first.\nThen code." },
			{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls -la\nfind ." } },
		]),
	);
	entry(12, 1, {
		kind: "pi.tool-result",
		model: [{ role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: "total 12\ndrwx" }], timestamp: at }],
		data: { diagnostics: [] },
	});
	entry(13, 1, {
		kind: "pi.tool-result",
		model: [
			{ role: "toolResult", toolCallId: "c2", toolName: "bash", content: [{ type: "text", text: "exit 1" }], isError: true, timestamp: at },
		],
		data: {
			diagnostics: [
				{ severity: "info", code: "full_output", message: "Full output: /opt/pi-host/storage/spill/full.log" },
				{ severity: "warn", code: "truncated", message: "Output truncated" },
			],
		},
	});
	entry(14, 1, {
		kind: "pi.compaction",
		model: [{ role: "user", content: [{ type: "text", text: "The conversation history was compacted.\n\n<summary>…" }], timestamp: at }],
	});
	entry(15, 1, { kind: "pi.system", model: [{ role: "system", content: "", sections: { preamble: "You are a build-steer agent.\nKeep it terse." } }] });
	entry(16, 1, { kind: "app.subagents", data: { agents: { reader: {} } } });
	entry(17, 1, "not json");
	entry(18, 2166, user("child work in progress"));
	entry(19, 1, user("reached 100% done"));
	entry(20, 1, user("pi_tool literal"));

	writeDocument(
		db,
		8,
		"app.subagents",
		{ agents: { reader: { conversationId: 2166, reported: [], worktree: "/w/reader" } }, reporters: {} },
		[],
	);
	db.close();
	fs.writeFileSync(logPath, "2026-01-01T00:00:00Z started\n", "utf8");
	return { dbPath, logPath };
}

describe("logs query", () => {
	it("clamps the parameters instead of rejecting them", () => {
		const defaults = parseLogsQuery(new URLSearchParams(""));
		expect(defaults).toEqual({
			before: null,
			limit: DEFAULT_LIMIT,
			kinds: [],
			dir: "desc",
			q: "",
			conversation: null,
			around: null,
		});

		expect(parseLogsQuery(new URLSearchParams("limit=999")).limit).toBe(MAX_LIMIT);
		expect(parseLogsQuery(new URLSearchParams("limit=0")).limit).toBe(DEFAULT_LIMIT);
		expect(parseLogsQuery(new URLSearchParams("limit=abc")).limit).toBe(DEFAULT_LIMIT);
		expect(parseLogsQuery(new URLSearchParams("limit=-5")).limit).toBe(DEFAULT_LIMIT);
		expect(parseLogsQuery(new URLSearchParams("limit=7")).limit).toBe(7);
		expect(parseLogsQuery(new URLSearchParams("before=42")).before).toBe(42);
		expect(parseLogsQuery(new URLSearchParams("before=soon")).before).toBeNull();
		expect(parseLogsQuery(new URLSearchParams("dir=asc")).dir).toBe("asc");
		expect(parseLogsQuery(new URLSearchParams("dir=sideways")).dir).toBe("desc");
		expect(parseLogsQuery(new URLSearchParams("q=%20  ")).q).toBe("");
		expect(parseLogsQuery(new URLSearchParams("conversation=2166")).conversation).toBe(2166);
		expect(parseLogsQuery(new URLSearchParams("conversation=abc")).conversation).toBeNull();
		expect(parseLogsQuery(new URLSearchParams("around=42")).around).toBe(42);
		expect(parseLogsQuery(new URLSearchParams("around=-1")).around).toBeNull();
	});

	it("caps the search limit and keeps an empty query empty", () => {
		const defaults = parseSearchQuery(new URLSearchParams("q=wall"));
		expect(defaults).toEqual({ q: "wall", kinds: [], limit: DEFAULT_SEARCH_LIMIT });
		expect(parseSearchQuery(new URLSearchParams("q=wall&limit=9999")).limit).toBe(MAX_SEARCH_LIMIT);
		expect(parseSearchQuery(new URLSearchParams("q=wall&limit=0")).limit).toBe(DEFAULT_SEARCH_LIMIT);
		expect(parseSearchQuery(new URLSearchParams("q=%20%20")).q).toBe("");
		expect(parseSearchQuery(new URLSearchParams("q=a&kind=pi.user,%20app.*")).kinds).toEqual(["pi.user", "app.*"]);
	});

	it("splits the kind list and keeps the app.* wildcard", () => {
		const query = parseLogsQuery(new URLSearchParams("kind=pi.user,%20pi.assistant%20,,app.*"));
		expect(query.kinds).toEqual(["pi.user", "pi.assistant", "app.*"]);
	});

	it("escapes LIKE wildcards so a search box cannot lie", () => {
		expect(likeEscape("100%")).toBe("100\\%");
		expect(likeEscape("pi_tool")).toBe("pi\\_tool");
		expect(likeEscape("back\\slash")).toBe("back\\\\slash");
		expect(likeEscape("plain text")).toBe("plain text");
	});

	it("builds an exact predicate per kind and a prefix predicate for app.*", () => {
		const exact = kindPredicate(["pi.user"]);
		expect(exact.sql).toContain("json_extract(record, '$.kind')");
		expect(exact.sql.endsWith(" = ?)")).toBe(true);
		expect(exact.params).toEqual(["pi.user"]);

		const prefix = kindPredicate(["app.*"]);
		expect(prefix.sql).toContain("like ? escape '\\'");
		expect(prefix.params).toEqual(["app.%"]);

		expect(kindPredicate([]).params).toEqual([]);
		expect(kindPredicate([]).sql).toBe("1 = 1");
	});
});

describe("the human line", () => {
	it("renders each kind the way the tab shows it", () => {
		expect(humanLine({ kind: "pi.user", model: [{ content: "build  the\nwall" }] })).toMatchObject({ kind: "pi.user", text: "build the wall" });

		const answer = humanLine({
			kind: "pi.assistant",
			model: [
				{
					content: [
						{ type: "text", text: "I'll look." },
						{ type: "thinking", thinking: "Plan first.\nmore" },
						{ type: "toolCall", name: "bash", arguments: { command: "ls -la\nfind ." } },
					],
					timestamp: 1_793_000_000_000,
				},
			],
		});
		expect(answer.text).toContain("I'll look.");
		// Thinking is included by default: it is the agent's own mind.
		expect(answer.text).toContain("thinking: Plan first.");
		expect(answer.text).toContain('bash: {"command":"ls -la\\nfind ."}');
		expect(answer.at).toBe(new Date(1_793_000_000_000).toISOString());

		expect(
			humanLine({ kind: "pi.tool-result", model: [{ toolName: "bash", content: [{ type: "text", text: "total 12\ndrwx" }] }] }).text,
		).toBe("bash: total 12");
		expect(
			humanLine({ kind: "pi.tool-result", model: [{ toolName: "bash", content: [{ type: "text", text: "exit 1" }], isError: true }] }).text,
		).toBe("error bash: exit 1");
		expect(humanLine({ kind: "pi.compaction", model: [{ content: [{ type: "text", text: "compacted here\nsecond line" }] }] }).text).toBe(
			"summary: compacted here",
		);
		expect(humanLine({ kind: "pi.system", model: [{ sections: { preamble: "You are an agent.\nTerse." } }] }).text).toBe(
			"prompt: You are an agent.",
		);
		expect(humanLine({ kind: "app.matrix-note", data: "hello" }).text).toBe('app.matrix-note: "hello"');
	});

	it("degrades a broken record to one unknown line, never a crash", () => {
		expect(humanLine("not json")).toEqual({ kind: "unknown", text: "unknown entry", at: null, spill: null });
		expect(humanLine(null)).toMatchObject({ kind: "unknown" });
		expect(humanLine({ model: [] })).toMatchObject({ kind: "unknown", text: "unknown entry" });
		expect(humanLine({ kind: "pi.user" })).toMatchObject({ kind: "pi.user", text: "empty input" });
		expect(humanLine({ kind: "pi.assistant", model: [{ content: [] }] })).toMatchObject({ text: "empty answer" });
	});

	it("finds the spill path in both places the harness records it", () => {
		expect(spillPathOf({ data: { fullOutputPath: "/tmp/a.log" } })).toBe("/tmp/a.log");
		expect(
			spillPathOf({ data: { diagnostics: [{ code: "full_output", message: "Full output: /tmp/b.log" }] } }),
		).toBe("/tmp/b.log");
		expect(spillPathOf({ data: { diagnostics: [{ code: "truncated", message: "no path" }] } })).toBeNull();
		expect(spillPathOf({})).toBeNull();
	});
});

describe("logs report", () => {
	it("serves the newest page of the main conversation with a cursor", () => {
		const { dbPath, logPath } = logsFixture();
		const page = createLedger({ dbPath, logPath }).logs(parseLogsQuery(new URLSearchParams("limit=3")));

		expect(page.error).toBeNull();
		// No `conversation=` means the main conversation: the child's entry 18 is not
		// in this page (it never was in "the main conversation").
		expect(page.entries.map((entry) => entry.id)).toEqual([20, 19, 17]);
		expect(page.next_before).toBe(17);
		expect(page.entries[0]?.thread).toBeUndefined();
	});

	it("reads a child conversation by id, with the registry thread name", () => {
		const { dbPath, logPath } = logsFixture();
		const page = createLedger({ dbPath, logPath }).logs(
			parseLogsQuery(new URLSearchParams("conversation=2166")),
		);

		expect(page.error).toBeNull();
		expect(page.entries.map((entry) => entry.id)).toEqual([18]);
		// The child conversation is the `reader` subagent's: that is its thread.
		expect(page.entries[0]?.thread).toBe("reader");
		expect(page.entries[0]?.raw).toContain("child work in progress");
	});

	it("walks backwards with the cursor and stops at the archive start", () => {
		const { dbPath, logPath } = logsFixture();
		const ledger = createLedger({ dbPath, logPath });
		const first = ledger.logs(parseLogsQuery(new URLSearchParams("limit=4")));
		const older = ledger.logs(parseLogsQuery(new URLSearchParams(`limit=4&before=${first.next_before}`)));

		expect(first.entries.map((entry) => entry.id)).toEqual([20, 19, 17, 16]);
		expect(older.entries.map((entry) => entry.id)).toEqual([15, 14, 13, 12]);
		expect(older.next_before).toBe(12);

		const whole = ledger.logs(parseLogsQuery(new URLSearchParams("limit=200")));
		expect(whole.next_before).toBeNull();
		expect(whole.entries).toHaveLength(10);
	});

	it("orders a page either way round without changing which rows are in it", () => {
		const { dbPath, logPath } = logsFixture();
		const ledger = createLedger({ dbPath, logPath });
		const desc = ledger.logs(parseLogsQuery(new URLSearchParams("limit=3")));
		const asc = ledger.logs(parseLogsQuery(new URLSearchParams("limit=3&dir=asc")));
		expect(asc.entries.map((entry) => entry.id)).toEqual([...desc.entries].reverse().map((entry) => entry.id));
		expect(asc.next_before).toBe(desc.next_before);
	});

	it("filters by kind, including the app.* prefix", () => {
		const { dbPath, logPath } = logsFixture();
		const ledger = createLedger({ dbPath, logPath });

		expect(ledger.logs(parseLogsQuery(new URLSearchParams("kind=pi.user"))).entries.map((entry) => entry.id)).toEqual([20, 19, 10]);
		// The child's own `pi.user` row is in the child conversation, not this one.
		expect(
			ledger
				.logs(parseLogsQuery(new URLSearchParams("kind=pi.user&conversation=2166")))
				.entries.map((entry) => entry.id),
		).toEqual([18]);
		const apps = ledger.logs(parseLogsQuery(new URLSearchParams("kind=app.*")));
		expect(apps.entries.map((entry) => entry.id)).toEqual([16]);
		expect(apps.entries[0]?.text.startsWith('app.subagents: {"agents"')).toBe(true);
		expect(ledger.logs(parseLogsQuery(new URLSearchParams("kind=pi.system,pi.compaction"))).entries.map((e) => e.id)).toEqual([15, 14]);
		// A kind nobody wrote is an empty page, not an error.
		expect(ledger.logs(parseLogsQuery(new URLSearchParams("kind=app.nope")))).toMatchObject({ entries: [], error: null });
	});

	it("treats % and _ in the search as literals", () => {
		const { dbPath, logPath } = logsFixture();
		const ledger = createLedger({ dbPath, logPath });

		expect(ledger.logs(parseLogsQuery(new URLSearchParams("q=100%25"))).entries.map((e) => e.id)).toEqual([19]);
		expect(ledger.logs(parseLogsQuery(new URLSearchParams("q=pi_tool"))).entries.map((e) => e.id)).toEqual([20]);
		// `%` on its own matches only the row with a literal percent sign.
		expect(ledger.logs(parseLogsQuery(new URLSearchParams("q=%25"))).entries.map((e) => e.id)).toEqual([19]);
		expect(ledger.logs(parseLogsQuery(new URLSearchParams("q=nothing-like-this"))).entries).toHaveLength(0);
		expect(ledger.logs(parseLogsQuery(new URLSearchParams("q=WALL"))).entries.map((e) => e.id)).toEqual([10]);
	});

	it("keeps a record that is not JSON on the page as an unknown line", () => {
		const { dbPath, logPath } = logsFixture();
		const entry = createLedger({ dbPath, logPath })
			.logs(parseLogsQuery(new URLSearchParams("limit=200")))
			.entries.find((row) => row.id === 17);
		expect(entry).toMatchObject({ kind: "unknown", text: "unknown entry", raw: "not json" });
	});

	it("carries the spill path so the row can expand in place", () => {
		const { dbPath, logPath } = logsFixture();
		const entry = createLedger({ dbPath, logPath })
			.logs(parseLogsQuery(new URLSearchParams("kind=pi.tool-result")))
			.entries.find((row) => row.id === 13);
		expect(entry?.spill).toBe("/opt/pi-host/storage/spill/full.log");
	});

	it("reports an error field, not a throw, when the ledger is missing", () => {
		const dir = tempDir();
		const page = createLedger({ dbPath: path.join(dir, "missing.sqlite"), logPath: path.join(dir, "daemon.log") }).logs(
			parseLogsQuery(new URLSearchParams("")),
		);
		expect(page.entries).toEqual([]);
		expect(page.error).toBeTypeOf("string");
	});
});

describe("logs endpoints", () => {
	it("serves /api/logs as JSON with a cursor, and clamps a silly limit", async () => {
		const { handler } = wall(logsFixture());
		const { server, base } = await serve(handler);
		try {
			const body = (await (await fetch(`${base}/api/logs?limit=3`)).json()) as {
				v: number;
				ok: boolean;
				entries: { id: number; kind: string; text: string }[];
				next_before?: number;
			};
			expect(body.v).toBe(1);
			expect(body.ok).toBe(true);
			expect(body.entries.map((entry) => entry.id)).toEqual([20, 19, 17]);
			expect(body.next_before).toBe(17);
			expect(body.entries[0]?.kind).toBe("pi.user");

			const capped = (await (await fetch(`${base}/api/logs?limit=100000`)).json()) as { entries: unknown[] };
			expect(capped.entries.length).toBeLessThanOrEqual(MAX_LIMIT);

			const filtered = (await (await fetch(`${base}/api/logs?kind=pi.assistant&dir=asc`)).json()) as {
				entries: { id: number }[];
			};
			expect(filtered.entries.map((entry) => entry.id)).toEqual([11]);
		} finally {
			server.close();
		}
	});

	it("answers a missing ledger with ok:false and no entries", async () => {
		const dir = tempDir();
		const { handler } = wall({ dbPath: path.join(dir, "missing.sqlite"), logPath: path.join(dir, "missing.log") });
		const { server, base } = await serve(handler);
		try {
			const response = await fetch(`${base}/api/logs`);
			const body = (await response.json()) as { ok: boolean; error: string; entries: unknown[] };
			expect(response.status).toBe(200);
			expect(body.ok).toBe(false);
			expect(body.error).toBeTypeOf("string");
			expect(body.entries).toEqual([]);
		} finally {
			server.close();
		}
	});

	it("serves a spill file inside the allowlist and truncates a huge one", () => {
		const root = tempDir();
		const file = path.join(root, "spill", "full.log");
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, "line one\nline two\n", "utf8");

		const served = readSpill(file, { roots: [root] });
		expect(served).toMatchObject({ ok: true, path: file, bytes: 18, truncated: false, text: "line one\nline two\n" });

		const capped = readSpill(file, { roots: [root], maxBytes: 8 });
		expect(capped).toMatchObject({ ok: true, truncated: true, text: "line one" });
	});

	it("rejects traversal, escapes, symlinks and non-files before reading anything", () => {
		const root = tempDir();
		const outside = tempDir();
		const secret = path.join(outside, "secret.txt");
		fs.writeFileSync(secret, "nope", "utf8");
		const inside = path.join(root, "ok.log");
		fs.writeFileSync(inside, "fine", "utf8");
		const link = path.join(root, "link.log");
		fs.symlinkSync(secret, link);
		const directory = path.join(root, "dir");
		fs.mkdirSync(directory);

		const roots = [root];
		expect(readSpill(undefined, { roots })).toMatchObject({ ok: false, error: "path is required" });
		expect(readSpill("", { roots })).toMatchObject({ ok: false });
		expect(readSpill(`${root}/../outside/secret.txt`, { roots })).toMatchObject({ ok: false, error: "path rejected" });
		expect(readSpill("../etc/passwd", { roots })).toMatchObject({ ok: false, error: "path rejected" });
		expect(readSpill("ok.log", { roots })).toMatchObject({ ok: false, error: "path rejected" });
		expect(readSpill(secret, { roots })).toMatchObject({ ok: false, error: "path outside the allowlist" });
		expect(readSpill(link, { roots })).toMatchObject({ ok: false, error: "not a regular file" });
		expect(readSpill(directory, { roots })).toMatchObject({ ok: false, error: "not a regular file" });
		expect(readSpill(path.join(root, "absent.log"), { roots })).toMatchObject({ ok: false, error: "no such file" });
		expect(readSpill(inside, { roots })).toMatchObject({ ok: true, text: "fine" });
	});

	it("answers /api/spill with JSON: 200 for a file, 400/404 for the rest", async () => {
		const root = tempDir();
		const file = path.join(root, "full.log");
		fs.writeFileSync(file, "all of it\n", "utf8");
		const dir = tempDir();
		fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html>", "utf8");
		const ledger = createLedger({ dbPath: logsFixture().dbPath, logPath: path.join(dir, "daemon.log") });
		const spend = createSpend({
			apiBase: "https://example.test",
			apiKey: "k",
			fetchImpl: (async () => json({})) as unknown as typeof globalThis.fetch,
		});
		const handler = createHandler({ ledger, spend, assetsDir: dir, spillRoots: [root] });
		const { server, base } = await serve(handler);
		try {
			const ok = await fetch(`${base}/api/spill?path=${encodeURIComponent(file)}`);
			const okBody = (await ok.json()) as { ok: boolean; text: string; bytes: number; truncated: boolean };
			expect(ok.status).toBe(200);
			expect(okBody).toMatchObject({ ok: true, text: "all of it\n", bytes: 10, truncated: false });

			const traversal = await fetch(`${base}/api/spill?path=${encodeURIComponent(`${root}/../etc/passwd`)}`);
			expect(traversal.status).toBe(400);
			expect(((await traversal.json()) as { ok: boolean }).ok).toBe(false);

			// Percent-encoded traversal is decoded by the URL parser before the check.
			const encoded = await fetch(`${base}/api/spill?path=%2Ftmp%2F%2E%2E%2Fetc%2Fpasswd`);
			expect(encoded.status).toBe(400);

			const missing = await fetch(`${base}/api/spill?path=${encodeURIComponent(path.join(root, "gone.log"))}`);
			expect(missing.status).toBe(404);
			expect(((await missing.json()) as { error: string }).error).toBe("no such file");

			const noParam = await fetch(`${base}/api/spill`);
			expect(noParam.status).toBe(400);
		} finally {
			server.close();
		}
	});
});

// --- round four: conversations, windows and cross-conversation search -------

/**
 * The browser's own ledger: three spaces, a main conversation long enough that a
 * ±25 window has room on both sides, and rows whose text pins the LIKE escaping.
 */
function browserFixture(): Fixture {
	const dir = tempDir();
	const dbPath = path.join(dir, "session.sqlite");
	const logPath = path.join(dir, "daemon.log");
	const db = newDb(dbPath);
	// The real schema owns this table; `newDb` does not create it, so the picker's
	// fixture is the one test that adds it.
	db.exec(
		"CREATE TABLE conversations (id INTEGER PRIMARY KEY, owner_conversation_id INTEGER, owner_task_id INTEGER, record TEXT)",
	);
	const conversation = (id: number, owner: number | null, ownerTask: number | null) =>
		db
			.prepare("INSERT INTO conversations (id, owner_conversation_id, owner_task_id, record) VALUES (?, ?, ?, '{}')")
			.run(id, owner, ownerTask);
	// Main is the conversation nothing owns — the schema's own answer, not id 1.
	conversation(1, null, null);
	conversation(2166, 1, 2165);
	conversation(2402, 1, 2401);

	const at = 1_793_000_000_000;
	const entry = (id: number, conversationId: number, record: unknown) =>
		db
			.prepare("INSERT INTO entries (id, conversation_id, head, commit_seq, record) VALUES (?, ?, 0, 1, ?)")
			.run(id, conversationId, JSON.stringify(record));
	const user = (id: number, conversationId: number, text: string) =>
		entry(id, conversationId, {
			kind: "pi.user",
			model: [{ role: "user", content: text, timestamp: at + id }],
		});
	const assistant = (id: number, conversationId: number, text: string) =>
		entry(id, conversationId, {
			kind: "pi.assistant",
			model: [{ role: "assistant", content: [{ type: "text", text }], timestamp: at + id }],
		});

	// 60 consecutive main entries: enough that the middle of the range has 25 on
	// either side, and both ends run into the archive itself.
	for (let id = 100; id <= 159; id += 1) user(id, 1, `line ${id}`);
	// A literal `%` and a literal `_` in the wild (the escaping tests).
	assistant(200, 1, "reached 100% done");
	user(201, 1, "like this");
	// Two child conversations, one of them named in the registry.
	user(202, 2166, "child says hello");
	assistant(203, 2166, "child answers");
	user(205, 2402, "wall-ui says hi");
	entry(204, 1, {
		kind: "pi.compaction",
		model: [{ role: "user", content: "summary of history", timestamp: at + 204 }],
	});

	writeDocument(
		db,
		8,
		"app.subagents",
		{ agents: { reader: { conversationId: 2166, worktree: "/w/reader" } }, reporters: {} },
		[],
	);
	db.close();
	fs.writeFileSync(logPath, "2026-01-01T00:00:00Z started\n", "utf8");
	return { dbPath, logPath };
}

describe("conversations report", () => {
	it("lists the main conversation first, then children in id order", () => {
		const { dbPath, logPath } = browserFixture();
		const report = createLedger({ dbPath, logPath }).conversations();

		expect(report.error).toBeNull();
		expect(report.conversations.map((row) => row.id)).toEqual([1, 2166, 2402]);
		expect(report.conversations.map((row) => row.kind)).toEqual(["main", "child", "child"]);
	});

	it("titles a space by the registry, and says unknown when nothing names it", () => {
		const { dbPath, logPath } = browserFixture();
		const rows = createLedger({ dbPath, logPath }).conversations().conversations;

		expect(rows[0]).toMatchObject({ title: "main", state: "alive", entries: 63 });
		// 2166 is the `reader` subagent's conversation: the enum says it is alive.
		expect(rows[1]).toMatchObject({ title: "reader", state: "alive", entries: 2 });
		// 2402 holds entries and is named by nobody: `unknown`, never a guess.
		expect(rows[2]).toMatchObject({ title: "conversation 2402", state: "unknown", entries: 1 });
	});

	it("reports the first and last entry timestamps of each space", () => {
		const { dbPath, logPath } = browserFixture();
		const rows = createLedger({ dbPath, logPath }).conversations().conversations;
		const iso = (ms: number) => new Date(ms).toISOString();
		const at = 1_793_000_000_000;

		expect(rows[0]?.first_at).toBe(iso(at + 100));
		expect(rows[0]?.last_at).toBe(iso(at + 204));
		expect(rows[1]?.first_at).toBe(iso(at + 202));
		expect(rows[1]?.last_at).toBe(iso(at + 203));
	});

	it("derives the spaces from the entries when the table is gone", () => {
		// `newDb` has no `conversations` table at all: the picker still works.
		const { dbPath, logPath } = logsFixture();
		const report = createLedger({ dbPath, logPath }).conversations();

		expect(report.error).toBeNull();
		expect(report.conversations.map((row) => row.id)).toEqual([1, 2166]);
		expect(report.conversations[0]).toMatchObject({ kind: "main", title: "main" });
		expect(report.conversations[1]).toMatchObject({ kind: "child", title: "reader" });
	});

	it("answers an unreadable ledger with an error, not a throw", () => {
		const dir = tempDir();
		const report = createLedger({ dbPath: path.join(dir, "missing.sqlite"), logPath: path.join(dir, "x.log") })
			.conversations();
		expect(report.conversations).toEqual([]);
		expect(report.error).toBeTypeOf("string");
	});

	it("knows which conversation ids exist", () => {
		const { dbPath, logPath } = browserFixture();
		const ledger = createLedger({ dbPath, logPath });
		expect(ledger.conversationExists(2166)).toBe(true);
		expect(ledger.conversationExists(9999)).toBe(false);
	});
});

describe("around window", () => {
	it("returns 25 entries on either side of the anchor, ascending", () => {
		const { dbPath, logPath } = browserFixture();
		const page = createLedger({ dbPath, logPath }).logs(parseLogsQuery(new URLSearchParams("around=130")));
		const ids = page.entries.map((entry) => entry.id);

		expect(page.error).toBeNull();
		expect(ids).toHaveLength(AROUND_RADIUS * 2 + 1);
		expect(ids[0]).toBe(105);
		expect(ids[ids.length - 1]).toBe(155);
		// Ascending regardless of `dir`: a window is context, and time reads one way.
		expect([...ids].sort((a, b) => a - b)).toEqual(ids);
		expect(ids).toContain(130);
		// The window can be paged further back from its oldest row.
		expect(page.next_before).toBe(105);
	});

	it("stops at the archive start instead of inventing rows", () => {
		const { dbPath, logPath } = browserFixture();
		const page = createLedger({ dbPath, logPath }).logs(parseLogsQuery(new URLSearchParams("around=100")));

		expect(page.entries.map((entry) => entry.id)).toEqual(Array.from({ length: 26 }, (_, index) => 100 + index));
		expect(page.next_before).toBeNull();
	});

	it("anchors past the end of the conversation on its newest rows", () => {
		const { dbPath, logPath } = browserFixture();
		const page = createLedger({ dbPath, logPath }).logs(parseLogsQuery(new URLSearchParams("around=99999")));
		const ids = page.entries.map((entry) => entry.id);

		expect(ids).toHaveLength(AROUND_RADIUS + 1);
		expect(ids[ids.length - 1]).toBe(204);
		expect(page.next_before).toBe(ids[0]);
	});

	it("keeps the kind filter and cannot see another conversation", () => {
		const { dbPath, logPath } = browserFixture();
		const ledger = createLedger({ dbPath, logPath });
		const users = ledger.logs(parseLogsQuery(new URLSearchParams("around=130&kind=pi.user")));
		expect(users.entries.every((entry) => entry.kind === "pi.user")).toBe(true);
		expect(users.entries).toHaveLength(AROUND_RADIUS * 2 + 1);

		// The child's rows are not in the main conversation's window.
		const child = ledger.logs(parseLogsQuery(new URLSearchParams("conversation=2166&around=203")));
		expect(child.entries.map((entry) => entry.id)).toEqual([202, 203]);
	});
});

describe("cross-conversation search", () => {
	it("finds hits in several conversations and says where each one lives", () => {
		const { dbPath, logPath } = browserFixture();
		const report = createLedger({ dbPath, logPath }).search(parseSearchQuery(new URLSearchParams("q=says")));

		expect(report.error).toBeNull();
		expect(report.hits.map((hit) => [hit.entry_id, hit.conversation_id, hit.conversation_title])).toEqual([
			[205, 2402, "conversation 2402"],
			[202, 2166, "reader"],
		]);
		expect(report.hits[1]?.kind).toBe("pi.user");
		expect(report.hits[1]?.at).toBe(new Date(1_793_000_000_000 + 202).toISOString());
		expect(report.hits[1]?.text).toBe("child says hello");
	});

	it("treats % and _ in the query as literals", () => {
		const { dbPath, logPath } = browserFixture();
		const ledger = createLedger({ dbPath, logPath });
		const ids = (q: string) =>
			ledger.search(parseSearchQuery(new URLSearchParams(`q=${q}`))).hits.map((hit) => hit.entry_id);

		expect(ids("100%25")).toEqual([200]);
		// `pi_user` would match `pi.user` in every record if `_` were a wildcard.
		expect(ids("pi_user")).toEqual([]);
		expect(ids("pi.user")).not.toHaveLength(0);
	});

	it("caps the page at the requested limit, newest first", () => {
		const { dbPath, logPath } = browserFixture();
		const report = createLedger({ dbPath, logPath }).search(parseSearchQuery(new URLSearchParams("q=line&limit=3")));

		expect(report.hits.map((hit) => hit.entry_id)).toEqual([159, 158, 157]);
		const capped = createLedger({ dbPath, logPath }).search(
			parseSearchQuery(new URLSearchParams("q=line&limit=1000")),
		);
		expect(capped.hits).toHaveLength(60);
	});

	it("narrows to a kind when asked", () => {
		const { dbPath, logPath } = browserFixture();
		const report = createLedger({ dbPath, logPath }).search(
			parseSearchQuery(new URLSearchParams("q=child&kind=pi.assistant")),
		);
		expect(report.hits.map((hit) => hit.entry_id)).toEqual([203]);
	});

	it("reports an error field, not a throw, when the ledger is missing", () => {
		const dir = tempDir();
		const report = createLedger({ dbPath: path.join(dir, "missing.sqlite"), logPath: path.join(dir, "x.log") }).search(
			parseSearchQuery(new URLSearchParams("q=wall")),
		);
		expect(report.hits).toEqual([]);
		expect(report.error).toBeTypeOf("string");
	});
});

describe("browser endpoints", () => {
	it("serves /api/conversations with the picker's rows", async () => {
		const { handler } = wall(browserFixture());
		const { server, base } = await serve(handler);
		try {
			const response = await fetch(`${base}/api/conversations`);
			const body = (await response.json()) as {
				v: number;
				ok: boolean;
				conversations: { id: number; kind: string; title: string; state: string; entries: number }[];
			};
			expect(response.status).toBe(200);
			expect(body.v).toBe(1);
			expect(body.ok).toBe(true);
			expect(body.conversations.map((row) => row.id)).toEqual([1, 2166, 2402]);
			expect(body.conversations[1]).toMatchObject({ title: "reader", state: "alive", entries: 2 });
		} finally {
			server.close();
		}
	});

	it("rejects a conversation the ledger does not have as a 400, not a 500", async () => {
		const { handler } = wall(browserFixture());
		const { server, base } = await serve(handler);
		try {
			const response = await fetch(`${base}/api/logs?conversation=9999`);
			const body = (await response.json()) as { ok: boolean; error: string; entries?: unknown };
			expect(response.status).toBe(400);
			expect(body.ok).toBe(false);
			expect(body.error).toContain("no such conversation");
			expect(body.entries).toBeUndefined();
		} finally {
			server.close();
		}
	});

	it("serves a child conversation and an around window from /api/logs", async () => {
		const { handler } = wall(browserFixture());
		const { server, base } = await serve(handler);
		try {
			const child = (await (await fetch(`${base}/api/logs?conversation=2166&dir=asc`)).json()) as {
				entries: { id: number; thread?: string }[];
			};
			expect(child.entries.map((entry) => entry.id)).toEqual([202, 203]);
			expect(child.entries[0]?.thread).toBe("reader");

			const window = (await (await fetch(`${base}/api/logs?around=130`)).json()) as { entries: { id: number }[] };
			expect(window.entries.map((entry) => entry.id)).toContain(130);
			expect(window.entries.length).toBeLessThanOrEqual(AROUND_RADIUS * 2 + 1);
		} finally {
			server.close();
		}
	});

	it("serves /api/search across conversations, and rejects an empty query", async () => {
		const { handler } = wall(browserFixture());
		const { server, base } = await serve(handler);
		try {
			const body = (await (await fetch(`${base}/api/search?q=says&limit=10`)).json()) as {
				v: number;
				ok: boolean;
				q: string;
				limit: number;
				hits: { entry_id: number; conversation_id: number; conversation_title: string }[];
			};
			expect(body.v).toBe(1);
			expect(body.ok).toBe(true);
			expect(body.q).toBe("says");
			expect(body.limit).toBe(10);
			expect(body.hits.map((hit) => hit.conversation_id)).toEqual([2402, 2166]);
			expect(body.hits.map((hit) => hit.conversation_title)).toEqual(["conversation 2402", "reader"]);

			const capped = (await (await fetch(`${base}/api/search?q=line&limit=9999`)).json()) as {
				limit: number;
				hits: unknown[];
			};
			expect(capped.limit).toBe(MAX_SEARCH_LIMIT);
			expect(capped.hits.length).toBeLessThanOrEqual(MAX_SEARCH_LIMIT);

			const empty = await fetch(`${base}/api/search?q=%20%20`);
			const emptyBody = (await empty.json()) as { ok: boolean; error: string };
			expect(empty.status).toBe(400);
			expect(emptyBody.ok).toBe(false);
			expect(emptyBody.error).toBeTypeOf("string");
		} finally {
			server.close();
		}
	});
});
