// Round four: the conversation picker, the ±window of context, and
// cross-conversation search — as reports and as endpoints.

import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLedger } from "../src/wall/ledger.ts";
import { AROUND_RADIUS, MAX_SEARCH_LIMIT, parseLogsQuery, parseSearchQuery } from "../src/wall/logs.ts";
import { anchor, browserFixture, cleanupScratch, json, logsFixture, newDb, reader, serve, tempDir, wall } from "./wall-fixtures.ts";

/** Every scratch directory is removed after each test, pass or fail. */
afterEach(cleanupScratch);

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
