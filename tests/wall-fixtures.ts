// The wall's test fixtures: a scratch SQLite file in the ledger's real shape,
// built by hand so each test owns its bad input.
//
// Documents store kinds JSON-quoted, and a document reaches its final value
// through a `base` revision plus `s`/`t`/`a` deltas — so the writers below
// mirror the real schema rather than a convenient one. Shared by every wall test
// file; nothing here asserts.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type AnchorFact, type TaskFact, agentState } from "../src/wall/agents.ts";
import { createLedger } from "../src/wall/ledger.ts";
import { type SpendReader, createSpend } from "../src/wall/spend.ts";
import { createHandler } from "../src/wall/server.ts";

// --- fixtures --------------------------------------------------------------

const scratch: string[] = [];

export function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wall-test-"));
	scratch.push(dir);
	return dir;
}

/** Remove every scratch directory this file created; call it from `afterEach`. */
export function cleanupScratch(): void {
	while (scratch.length > 0) {
		const dir = scratch.pop();
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	}
}


/** Documents store kinds JSON-quoted; mirror the real ledger. */
export function quoted(kind: string): string {
	return JSON.stringify(kind);
}

export function newDb(file: string): DatabaseSync {
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
export function writeDocument(db: DatabaseSync, id: number, kind: string, base: unknown, deltas: [number, unknown][]): void {
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
export function writeDocumentFor(
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

export type Fixture = { dbPath: string; logPath: string };

export function fixture(): Fixture {
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
	// The fleet: one agent with answers in `reported[]`, one with a `reporters` TASK id
	// and no answer — the task id must never be read as an entry id.
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


// --- spend -----------------------------------------------------------------

/** A fetch that answers from a queue and counts its calls. */
export function fakeFetch(responses: (() => Response)[]): { fetchImpl: typeof globalThis.fetch; calls: () => number } {
	let index = 0;
	const impl = (async () => {
		const make = responses[Math.min(index, responses.length - 1)] as () => Response;
		index += 1;
		return make();
	}) as unknown as typeof globalThis.fetch;
	return { fetchImpl: impl, calls: () => index };
}

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function reader(fetchImpl: typeof globalThis.fetch, clock: { now: number }): SpendReader {
	return createSpend({
		apiBase: "https://example.test",
		apiKey: "test-key",
		fetchImpl,
		now: () => clock.now,
	});
}


// --- server ----------------------------------------------------------------

export async function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>) {
	const server = http.createServer((req, res) => void handler(req, res));
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	return { server, port, base: `http://127.0.0.1:${port}` };
}

export function wall(fixturePaths: Fixture) {
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


export type Facts = Parameters<typeof agentState>[0];

export function facts(overrides: Partial<Facts> = {}): Facts {
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

export const runTask = (status: string, kind = "pi.generation"): TaskFact => ({ id: 1, kind, status, conversation: 9 });
export const anchor = (status: string): AnchorFact => ({ id: 99, status, conversation: 1, name: "child" });

export function agentsFixture(): Fixture {
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

export function projectsFixture(): Fixture {
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


export function logsFixture(): Fixture {
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


export function browserFixture(): Fixture {
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


