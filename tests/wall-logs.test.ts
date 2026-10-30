// The logs browser: query parsing, the human line, and the report behind both.

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLedger } from "../src/wall/ledger.ts";
import { DEFAULT_LIMIT, DEFAULT_SEARCH_LIMIT, MAX_LIMIT, MAX_SEARCH_LIMIT, humanLine, kindPredicate, likeEscape, parseLogsQuery, parseSearchQuery, readSpill, spillPathOf } from "../src/wall/logs.ts";
import { createSpend } from "../src/wall/spend.ts";
import { createHandler } from "../src/wall/server.ts";
import { cleanupScratch, json, logsFixture, reader, serve, tempDir, wall } from "./wall-fixtures.ts";

/** Every scratch directory is removed after each test, pass or fail. */
afterEach(cleanupScratch);

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

