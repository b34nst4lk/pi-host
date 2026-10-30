// Project (multi-room) tests. RED first: written against the round-5 spec — a
// project is a ROOM bound to a persistent child conversation — then implemented
// in src/projects.ts (registry, bind, scaffold) and src/rooms.ts (routing).
//
// What they pin down (each one is a failure mode we would otherwise ship):
// - `/project ...` is a routed command, not steering text: a typo lands on the
//   teaching hint instead of being submitted to a model;
// - a bind is ONE commit, and the registry stores POINTERS (room, conversation,
//   directory, path of AGENTS.md) — never a copy of the instructions;
// - the room that gets bound is the room the command arrived in, and a room
//   steers exactly one project;
// - multi-room sync: only a BOUND room steers; unbound rooms are ignored
//   silently (the bot idles in them as a plain user) except for `/project`;
// - routing is per room: a message in room B lands in conversation B, never in
//   the main conversation — and each conversation's answers go back to its own
//   room (one pump, one cursor, per conversation);
// - the instructions are LIVE: an AGENTS.md edited between two messages changes
//   the prompt of the second one.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import type { TranscriptContext } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, defineDoc, Harness, type ConversationId } from "@earendil-works/pi-durable";
import { MemoryStorage } from "@earendil-works/pi-durable/storage/memory";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentEnv } from "../src/env.ts";
import { createReplyPump, parseMatrixCommand, roomShort, type TextEvent } from "../src/core/steer.ts";
import {
	createProjects,
	describeProjects,
	EMPTY_PROJECTS,
	parseProjectName,
	projectHint,
	ProjectsDoc,
	starterAgentsMd,
	summaryOf,
	type ProjectOutcome,
	type ProjectsApi,
} from "../src/projects.ts";
import { createRoomRouter, isProjectCommand, roomForConversation, routeRoom, type RoomRouterDeps } from "../src/rooms.ts";
import type { GitRunner } from "../src/subagents.ts";

const context = BACKGROUND_CONTEXT;

// --- helpers ---------------------------------------------------------------

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(options?: { git?: GitRunner }) {
	// A real directory: the instructions are a real file, and "live" only means
	// something if something can edit it between two messages.
	const sandbox = mkdtempSync(join(tmpdir(), "pi-projects-"));
	const projectsDir = join(sandbox, "projects");
	const faux = fauxProvider({ tokensPerSecond: 100_000 });
	const models = createModels();
	models.setProvider(faux.provider);
	const gitCalls: string[][] = [];
	const git: GitRunner =
		options?.git ??
		(async (args, cwd) => {
			gitCalls.push([cwd ?? "?", ...args]);
			return { ok: true, stdout: "", stderr: "" };
		});
	const projects = createProjects({
		provider: "faux",
		model: "faux-1",
		projectsDir,
		git,
		hideExtensions: [],
		env: (cwd) => createAgentEnv({ cwd }, sandbox),
	});
	const registry = createRegistry();
	registry.install(projects.extension);
	const harness = await Harness.open(
		new MemoryStorage(),
		{
			models,
			registry,
			// The project section reads its AGENTS.md through the conversation's env,
			// exactly as the daemon wires it; without one it can only say so.
			env: (target) => createAgentEnv(target, sandbox),
			settings: { followUpMode: "all", steeringMode: "all" },
		},
		context,
	);
	const root = await harness.root(context, { agent: { model: { provider: "faux", modelId: "faux-1" }, cwd: sandbox } });
	harness.resume();
	const api: ProjectsApi = {
		main: root.id,
		commit: (body) => root.commit(body, context),
		projects: async () => (await harness.snapshot(ProjectsDoc, root.id, context)) ?? EMPTY_PROJECTS,
	};
	return { sandbox, projectsDir, faux, harness, root, gitCalls, projects, api };
}

/**
 * The system prompt of ONE request. The transcript keeps a system entry per
 * request (that is what was asked), so only the LAST one is the live prompt —
 * reading them all would make every prompt look like the first.
 */
function promptText(transcript: TranscriptContext): string {
	const systems = transcript.messages.filter((message) => message.role === "system");
	const message = systems[systems.length - 1];
	if (message === undefined) return "";
	const typed = message as { content?: unknown; sections?: Record<string, string> };
	const content = typeof typed.content === "string" ? typed.content : "";
	return [content, ...Object.values(typed.sections ?? {})].join("\n");
}

/** A response step that records the system prompt of every request it answers. */
function capture(faux: ReturnType<typeof fauxProvider>) {
	const prompts: string[] = [];
	return {
		prompts,
		step: (text: string) => (transcript: TranscriptContext) => {
			prompts.push(promptText(transcript));
			return fauxAssistantMessage(text);
		},
		faux,
	};
}

async function waitUntil(check: () => boolean | Promise<boolean>, ms = 4000): Promise<void> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`waitUntil timed out after ${ms}ms`);
}

async function submit(handle: { submit(draft: unknown, ctx: typeof context): Promise<{ wait(ctx: typeof context): Promise<unknown> }> }, text: string) {
	const submission = await handle.submit({ type: "input", content: text }, context);
	await submission.wait(context);
}

/** A registry with one bound project. Clones, so the EMPTY_PROJECTS constant stays empty. */
function bound(state: Parameters<typeof routeRoom>[0], name: string, conversation: number, room: string) {
	const next = { projects: { ...state.projects } };
	next.projects[name] = {
		room,
		conversation: conversation as ConversationId,
		cwd: `/work/${name}`,
		instructions_path: `/work/${name}/AGENTS.md`,
		summary: `${name} summary`,
		created: "2026-01-01T00:00:00.000Z",
	};
	return next;
}

const event = (room: string, text: string, id = `$evt-${Math.random().toString(16).slice(2)}`): TextEvent => ({
	room,
	id,
	sender: "@jacksim:jacks.im",
	text,
});

/** A router with recording fakes; `submitCalls` is what actually got steered. */
function routerWith(state: Parameters<typeof routeRoom>[0], rooms: { main: string; project: string; other: string }) {
	const sent: Array<{ room: string; text: string }> = [];
	const reactions: Array<{ room: string; eventId: string }> = [];
	const submitCalls: Array<{ conversation: ConversationId; action: string }> = [];
	const logs: string[] = [];
	const aborted: ConversationId[] = [];
	const deps: RoomRouterDeps = {
		client: {
			sendText: async (room, text) => {
				sent.push({ room, text });
				return "$sent";
			},
			sendReaction: async (room, eventId) => {
				reactions.push({ room, eventId });
				return "$r";
			},
		},
		mainRooms: new Set([rooms.main]),
		mainConversation: 1 as ConversationId,
		registry: async () => state,
		allowed: (sender) => sender === "@jacksim:jacks.im",
		submit: async (conversation, command) => {
			submitCalls.push({ conversation, action: command.action });
		},
		abort: async (conversation) => {
			aborted.push(conversation);
			return `stopped ${conversation}`;
		},
		status: async (conversation) => `status ${conversation}`,
		ollama: () => {},
		project: {
			create: async (name, path, room) => `create ${name} ${path} in ${room}`,
			bind: async (name, path, room) => `bind ${name} ${path} in ${room}`,
			list: async () => "list",
		},
		seen: new Set<string>(),
		lastInbound: new Map(),
		log: (line) => logs.push(line),
	};
	return { router: createRoomRouter(deps), deps, sent, reactions, submitCalls, logs, aborted };
}

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
		expect(roomForConversation(state, 9 as ConversationId)).toBeNull();
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

// --- bind / new ------------------------------------------------------------

describe("bind", () => {
	it("binds an existing directory in ONE commit and stores pointers, not instructions", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "existing");
		mkdirSync(dir, { recursive: true });
		const outcome = await t.projects.bind("app", dir, "!proj:jacks.im", t.api);
		expect(outcome).toMatchObject({ ok: true, created: false });
		// The bind is honest about a directory with no instructions yet: it does not
		// invent one, it says so.
		expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
		if (outcome.ok) expect(outcome.note).toContain("does not exist yet");

		const registry = await t.api.projects();
		const record = registry.projects.app!;
		expect(record.room).toBe("!proj:jacks.im");
		expect(record.cwd).toBe(dir);
		expect(record.instructions_path).toBe(join(dir, "AGENTS.md"));
		expect(record.summary).toBe("");
		// pointers only: the record must not carry the file's content
		expect(Object.keys(record).sort()).toEqual(["conversation", "created", "cwd", "instructions_path", "room", "summary"]);

		const child = await t.harness.conversation(record.conversation, context);
		expect(child).toBeDefined();
		const agent = await child!.agent(context);
		expect(agent.cwd).toBe(dir);
		expect(agent.instructions).toContain("app");
		expect(agent.instructions).toContain(join(dir, "AGENTS.md"));
		// a project is a space, not a spawner: the hidden extension is gone
		expect(agent.model).toEqual({ provider: "faux", modelId: "faux-1" });
	});

	it("takes the summary from AGENTS.md when there is one", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "docs");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "AGENTS.md"), "# Docs project\n\nlong form\n", { flag: "w" });
		const outcome = (await t.projects.bind("docs", dir, "!proj:jacks.im", t.api)) as ProjectOutcome & { ok: true };
		expect(outcome.ok).toBe(true);
		expect((await t.api.projects()).projects.docs!.summary).toBe("Docs project");
	});

	it("refuses a room that already steers a project, and a name that is taken", async () => {
		const t: Setup = await setup();
		const first = join(t.sandbox, "one");
		const second = join(t.sandbox, "two");
		mkdirSync(first, { recursive: true });
		mkdirSync(second, { recursive: true });
		expect((await t.projects.bind("one", first, "!proj:jacks.im", t.api)).ok).toBe(true);
		const clash = await t.projects.bind("two", second, "!proj:jacks.im", t.api);
		expect(clash.ok).toBe(false);
		if (!clash.ok) expect(clash.error).toContain("already bound to project one");
		const name = await t.projects.bind("one", second, "!other:jacks.im", t.api);
		expect(name.ok).toBe(false);
		if (!name.ok) expect(name.error).toContain("already bound to room !proj:jacks.im");
		expect(Object.keys((await t.api.projects()).projects)).toEqual(["one"]);
	});

	it("refuses a directory that is not there, and a name that is not safe", async () => {
		const t: Setup = await setup();
		const missing = await t.projects.bind("app", join(t.sandbox, "nope"), "!p:jacks.im", t.api);
		expect(missing.ok).toBe(false);
		if (!missing.ok) expect(missing.error).toContain("no such directory");
		const unsafe = await t.projects.bind("Bad Name", t.sandbox, "!p:jacks.im", t.api);
		expect(unsafe.ok).toBe(false);
		expect((await t.api.projects()).projects).toEqual({});
	});
});

describe("new", () => {
	it("scaffolds the default directory: mkdir, git init, starter AGENTS.md, then bind", async () => {
		const t: Setup = await setup();
		const outcome = await t.projects.create("app", "", "!proj:jacks.im", t.api);
		expect(outcome.ok).toBe(true);
		const dir = join(t.projectsDir, "app");
		expect(t.gitCalls.map((call) => call.slice(0, 2))).toEqual([[dir, "init"]]);
		const starter = readFileSync(join(dir, "AGENTS.md"), "utf8");
		expect(starter).toContain("# app");
		expect(starter).toContain("How to work here");
		const record = (await t.api.projects()).projects.app!;
		expect(record.cwd).toBe(dir);
		expect(record.summary).toBe("app");
		if (outcome.ok) expect(outcome.created).toBe(true);
	});

	it("honours a path argument and keeps an existing AGENTS.md", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "custom dir");
		mkdirSync(dir, { recursive: true });
		const first = await t.projects.create("app", dir, "!proj:jacks.im", t.api);
		expect(first.ok).toBe(true);
		expect(t.gitCalls[0]).toEqual([dir, "init"]);
		expect((await t.api.projects()).projects.app!.cwd).toBe(dir);
	});

	it("keeps the file it found instead of overwriting it", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "kept");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "AGENTS.md"), "# Mine\n", { flag: "w" });
		await t.projects.create("kept", dir, "!proj:jacks.im", t.api);
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("# Mine\n");
	});

	it("fails loudly and binds nothing when git is missing", async () => {
		const t: Setup = await setup({
			git: async () => ({ ok: false, stdout: "", stderr: "spawn git ENOENT", missing: true }),
		});
		const outcome = await t.projects.create("app", "", "!p:jacks.im", t.api);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.error).toContain("git is not available");
		expect((await t.api.projects()).projects).toEqual({});
	});

	it("refuses a second project with the same name", async () => {
		const t: Setup = await setup();
		expect((await t.projects.create("app", "", "!a:jacks.im", t.api)).ok).toBe(true);
		const again = await t.projects.create("app", "", "!b:jacks.im", t.api);
		expect(again.ok).toBe(false);
		if (!again.ok) expect(again.error).toContain("already exists");
		expect(Object.keys((await t.api.projects()).projects)).toEqual(["app"]);
	});
});

// --- living instructions ---------------------------------------------------

describe("living instructions", () => {
	it("re-reads AGENTS.md on every request, so an edit changes the next prompt", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "live");
		mkdirSync(dir, { recursive: true });
		const file = join(dir, "AGENTS.md");
		writeFileSync(file, "# Live\n\nFIRST VERSION marker\n", { flag: "w" });
		const outcome = await t.projects.bind("live", dir, "!proj:jacks.im", t.api);
		expect(outcome.ok).toBe(true);
		const child = (await t.harness.conversation((await t.api.projects()).projects.live!.conversation, context))!;

		const cap = capture(t.faux);
		t.faux.setResponses([cap.step("ack one"), cap.step("ack two")]);
		await submit(child, "first message");
		writeFileSync(file, "# Live\n\nSECOND VERSION marker\n", { flag: "w" });
		await submit(child, "second message");

		expect(cap.prompts).toHaveLength(2);
		expect(cap.prompts[0]).toContain("FIRST VERSION marker");
		expect(cap.prompts[1]).toContain("SECOND VERSION marker");
		expect(cap.prompts[1]).not.toContain("FIRST VERSION marker");
		expect(cap.prompts[0]).toContain('project "live"');
	});

	it("says so, in the prompt, when the instructions file is gone", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "gone");
		mkdirSync(dir, { recursive: true });
		await t.projects.bind("gone", dir, "!proj:jacks.im", t.api);
		const child = (await t.harness.conversation((await t.api.projects()).projects.gone!.conversation, context))!;
		const cap = capture(t.faux);
		t.faux.setResponses([cap.step("ok")]);
		await submit(child, "hello");
		expect(cap.prompts[0]).toContain("cannot be read");
		expect(cap.prompts[0]).toContain(join(dir, "AGENTS.md"));
	});

	it("renders nothing in a conversation that is not a project", async () => {
		const t: Setup = await setup();
		const cap = capture(t.faux);
		t.faux.setResponses([cap.step("ok")]);
		await submit(t.root, "hello");
		expect(cap.prompts[0]).not.toContain("You are the agent of the project");
	});
});

// --- listing ---------------------------------------------------------------

describe("list", () => {
	it("says how to start when there is nothing to show", () => {
		expect(describeProjects(EMPTY_PROJECTS)).toContain("no projects yet");
	});

	it("lists every project with its room, conversation and directory", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "app");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "AGENTS.md"), "# App\n", { flag: "w" });
		await t.projects.bind("app", dir, "!app:jacks.im", t.api);
		mkdirSync(join(t.sandbox, "docs"), { recursive: true });
		await t.projects.bind("docs", join(t.sandbox, "docs"), "!docs:jacks.im", t.api);
		const listed = await t.projects.list(t.api);
		const lines = listed.split("\n");
		expect(lines[0]).toContain("app — room !app:jacks.im");
		expect(lines[0]).toContain(dir);
		expect(lines[1]).toContain("App"); // the summary, read live
		expect(listed).toContain("docs — room !docs:jacks.im");
	});

	it("reads the summary live, not from the bind", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "app");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "AGENTS.md"), "# Old title\n", { flag: "w" });
		await t.projects.bind("app", dir, "!app:jacks.im", t.api);
		writeFileSync(join(dir, "AGENTS.md"), "# New title\n", { flag: "w" });
		expect(await t.projects.list(t.api)).toContain("New title");
		expect((await t.api.projects()).projects.app!.summary).toBe("Old title");
	});
});

// --- one pump per conversation ---------------------------------------------

describe("reply pumps", () => {
	/** The daemon's wiring, verbatim: one pump + one cursor doc per conversation. */
	const Cursor = defineDoc<{ ids: Array<string | number> }>({
		kind: "app.steer-cursor",
		version: 1,
		scope: "conversation",
		history: "latest",
		fork: "initial",
		initial: () => ({ ids: [] }),
	});

	async function pumpFor(t: Setup, conversation: ConversationId, room: string, sent: Array<{ room: string; text: string }>) {
		const handle = (await t.harness.conversation(conversation, context))!;
		const pump = createReplyPump({
			sendText: async (text) => {
				sent.push({ room, text });
				return "$sent";
			},
			replyTarget: () => null,
			loadCursor: async () => new Set((await t.harness.snapshot(Cursor, conversation, context))?.ids ?? []),
			saveCursor: async (ids) => {
				await handle.commit(async (tx) => {
					(await tx.doc(Cursor, conversation)).ids = [...ids];
				}, context);
			},
		});
		const watch = await handle.watch(context);
		watch.start(async (value) => {
			await pump(value.entries);
		});
		return watch;
	}

	it("carries each conversation's answer to its own room", async () => {
		const t: Setup = await setup();
		mkdirSync(join(t.sandbox, "app"), { recursive: true });
		expect((await t.projects.bind("app", join(t.sandbox, "app"), "!app:jacks.im", t.api)).ok).toBe(true);
		const project = (await t.api.projects()).projects.app!.conversation;
		const sent: Array<{ room: string; text: string }> = [];
		const watches = [await pumpFor(t, t.root.id, "!main:jacks.im", sent), await pumpFor(t, project, "!app:jacks.im", sent)];

		// One scripted answer per request: both conversations ask, so two steps.
		const answer = (transcript: TranscriptContext) => {
			// Which agent is being asked, taken from the prompt it was given.
			const asked = promptText(transcript);
			return fauxAssistantMessage(asked.includes("agent of the project") ? "answer from app" : "answer from spike");
		};
		t.faux.setResponses([answer, answer]);
		await submit(t.root, "ask spike");
		await waitUntil(() => sent.some((s) => s.text.includes("answer from spike")));
		await submit((await t.harness.conversation(project, context))!, "ask app");
		await waitUntil(() => sent.some((s) => s.text.includes("answer from app")));

		expect(sent).toEqual([
			{ room: "!main:jacks.im", text: "answer from spike" },
			{ room: "!app:jacks.im", text: "answer from app" },
		]);
		// separate cursors: replaying one conversation never replays the other
		const mainCursor = await t.harness.snapshot(Cursor, t.root.id, context);
		const appCursor = await t.harness.snapshot(Cursor, project, context);
		expect(mainCursor?.ids.length).toBeGreaterThan(0);
		expect(appCursor?.ids.length).toBeGreaterThan(0);
		expect(mainCursor?.ids).not.toEqual(appCursor?.ids);
		for (const watch of watches) await watch.stop();
	});
});
