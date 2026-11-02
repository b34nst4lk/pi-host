// Which room steers what: the `/project` commands, the route table, and the
// router that drops a room it does not know without a word.

import { type ConversationId } from "@earendil-works/pi-durable";
import { describe, expect, it } from "vitest";
import { parseMatrixCommand, roomShort } from "../src/core/steer.ts";
import { EMPTY_PROJECTS, parseProjectName, projectHint, starterAgentsMd, summaryOf } from "../src/projects.ts";
import { isProjectCommand, roomForConversation, routeRoom } from "../src/rooms.ts";
import { bound, event, routerWith } from "./projects-fixtures.ts";






// --- command parsing -------------------------------------------------------

describe("/project commands", () => {
	it("parses the three syntaxes, keeping the rest of the line as the path", () => {
		expect(parseMatrixCommand("/project new app")).toEqual({ action: "project-new", name: "app", path: "" });
		expect(parseMatrixCommand("/project new app /srv/app")).toEqual({ action: "project-new", name: "app", path: "/srv/app" });
		expect(parseMatrixCommand("/project bind app /srv/my app")).toEqual({ action: "project-bind", name: "app", path: "/srv/my app" });
		expect(parseMatrixCommand("/project list")).toEqual({ action: "project-list" });
	});

	it("answers a typo with the hint instead of steering a model with it", () => {
		expect(parseMatrixCommand("/project")).toEqual({ action: "project-invalid", text: "" });
		expect(parseMatrixCommand("/project zap")).toEqual({ action: "project-invalid", text: "zap" });
		expect(parseMatrixCommand("/projects list")).toEqual({ action: "project-invalid", text: "s" });
		expect(parseMatrixCommand("/project new")).toEqual({ action: "project-invalid", text: "new (no name)" });
	});

	it("leaves every other message exactly as it was", () => {
		expect(parseMatrixCommand("what is this")).toEqual({ action: "input", content: "what is this" });
		expect(parseMatrixCommand("/steer go left")).toEqual({ action: "steer", content: "go left" });
		expect(parseMatrixCommand("/etc/hosts is odd")).toEqual({ action: "input", content: "/etc/hosts is odd" });
	});

	it("recognises project commands by action, and shortens a room id", () => {
		expect(isProjectCommand(parseMatrixCommand("/project list"))).toBe(true);
		expect(isProjectCommand(parseMatrixCommand("/status"))).toBe(false);
		expect(isProjectCommand(null)).toBe(false);
		expect(roomShort("!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU")).toBe("!ig3PmgqC-r…XpufmU");
		expect(roomShort("!short:jacks.im")).toBe("!short:jacks.im");
	});

	it("names projects directory-safely and summarises an instructions file", () => {
		expect(parseProjectName("app")).toBe("app");
		expect(parseProjectName("my-app-2")).toBe("my-app-2");
		expect(parseProjectName("My App")).toBeNull();
		expect(parseProjectName("../etc")).toBeNull();
		expect(parseProjectName("-x")).toBeNull();
		expect(summaryOf("\n\n# The wall\n\nmore")).toBe("The wall");
		expect(summaryOf("   ")).toBe("");
		const starter = starterAgentsMd("app");
		expect(starter.startsWith("# app")).toBe(true);
		expect(summaryOf(starter)).toBe("app");
	});

	it("teaches every syntax in the hint", () => {
		const hint = projectHint();
		expect(hint).toContain("/project new <name> [path]");
		expect(hint).toContain("/project bind <name> <path>");
		expect(hint).toContain("/project list");
	});
});

// --- route table -----------------------------------------------------------

describe("route table", () => {
	it("sends a bound room to its project, the configured room to pi-spike, the rest nowhere", () => {
		const state = bound(EMPTY_PROJECTS, "app", 7, "!b:jacks.im");
		expect(routeRoom(state, new Set(["!a:jacks.im"]), "!b:jacks.im")).toEqual({ kind: "project", name: "app", conversation: 7 });
		expect(routeRoom(state, new Set(["!a:jacks.im"]), "!a:jacks.im")).toEqual({ kind: "main" });
		expect(routeRoom(state, new Set(["!a:jacks.im"]), "!c:jacks.im")).toEqual({ kind: "unbound" });
	});

	it("lets an explicit bind win over the configured room", () => {
		const state = bound(EMPTY_PROJECTS, "app", 7, "!a:jacks.im");
		expect(routeRoom(state, new Set(["!a:jacks.im"]), "!a:jacks.im")).toEqual({ kind: "project", name: "app", conversation: 7 });
	});

	it("finds the room of a conversation, and nothing for a subagent child", () => {
		const state = bound(EMPTY_PROJECTS, "app", 7, "!b:jacks.im");
		expect(roomForConversation(state, 7 as ConversationId)).toBe("!b:jacks.im");
		// `null` is not an error: the main conversation and every subagent child report
		// to the fallback room, which is why the lookup is `?? fallback` in the daemon.
		expect(roomForConversation(state, 9 as ConversationId)).toBeNull();
		expect(roomForConversation(state, 1 as ConversationId)).toBeNull();
	});
});

// --- multi-room routing ----------------------------------------------------

describe("multi-room sync", () => {
	const rooms = { main: "!main:jacks.im", project: "!proj:jacks.im", other: "!household:jacks.im" };

	it("steers the main conversation from the configured room and ignores an unbound one", async () => {
		const t = routerWith(EMPTY_PROJECTS, rooms);
		await t.router.handleEvent(event(rooms.main, "hello"));
		await t.router.handleEvent(event(rooms.other, "hello from the household"));
		expect(t.submitCalls).toEqual([{ conversation: 1, action: "input" }]);
		// ignored means ignored: no ack reaction, no reply
		expect(t.reactions.map((r) => r.room)).toEqual([rooms.main]);
		expect(t.sent).toEqual([]);
	});

	it("steers the BOUND room's project conversation, never the main one", async () => {
		const state = bound(EMPTY_PROJECTS, "app", 7, rooms.project);
		const t = routerWith(state, rooms);
		await t.router.handleEvent(event(rooms.project, "fix the build"));
		expect(t.submitCalls).toEqual([{ conversation: 7, action: "input" }]);
		expect(t.reactions[0]?.room).toBe(rooms.project);
	});

	it("reads /project in a room nothing is bound to, and replies there", async () => {
		const t = routerWith(EMPTY_PROJECTS, rooms);
		await t.router.handleEvent(event(rooms.other, "/project bind app /srv/app"));
		expect(t.sent).toEqual([{ room: rooms.other, text: `bind app /srv/app in ${rooms.other}` }]);
		expect(t.reactions[0]?.room).toBe(rooms.other);
	});

	it("answers a bad project command with the hint, in the same room", async () => {
		const t = routerWith(EMPTY_PROJECTS, rooms);
		await t.router.handleEvent(event(rooms.other, "/project zap"));
		expect(t.sent[0]?.room).toBe(rooms.other);
		expect(t.sent[0]?.text).toContain('unknown project command "zap"');
		expect(t.sent[0]?.text).toContain("/project new <name> [path]");
		expect(t.submitCalls).toEqual([]);
	});

	it("handles a redelivered event once and a stranger's message never", async () => {
		const t = routerWith(EMPTY_PROJECTS, rooms);
		const redelivered = event(rooms.main, "hello", "$same");
		await t.router.handleEvent(redelivered);
		await t.router.handleEvent(redelivered);
		expect(t.submitCalls).toHaveLength(1);
		await t.router.handleEvent({ ...event(rooms.main, "let me in"), sender: "@stranger:jacks.im" });
		expect(t.submitCalls).toHaveLength(1);
		expect(t.reactions).toHaveLength(1);
	});

	it("aborts and reports the conversation of the room the command came from", async () => {
		const state = bound(EMPTY_PROJECTS, "app", 7, rooms.project);
		const t = routerWith(state, rooms);
		await t.router.handleEvent(event(rooms.project, "/stop"));
		await t.router.handleEvent(event(rooms.project, "/status"));
		expect(t.aborted).toEqual([7]);
		expect(t.sent.map((s) => s.text)).toEqual(["stopped 7", "status 7"]);
	});

	it("threads a reply onto the message of ITS room", async () => {
		const state = bound(EMPTY_PROJECTS, "app", 7, rooms.project);
		const t = routerWith(state, rooms);
		const inMain = event(rooms.main, "one", "$m1");
		const inProject = event(rooms.project, "two", "$p1");
		await t.router.handleEvent(inMain);
		await t.router.handleEvent(inProject);
		expect(t.router.replyTarget(rooms.main)).toBe("$m1");
		expect(t.router.replyTarget(rooms.project)).toBe("$p1");
		expect(t.router.replyTarget(rooms.other)).toBeNull();
	});

	it("logs an ignored room once, not once per message", async () => {
		const t = routerWith(EMPTY_PROJECTS, rooms);
		await t.router.handleEvent(event(rooms.other, "a"));
		await t.router.handleEvent(event(rooms.other, "b"));
		expect(t.logs.filter((line) => line.includes("steers nothing"))).toHaveLength(1);
	});
});

