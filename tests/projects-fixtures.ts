// The multi-project fixtures: a real harness over memory storage, a faux model,
// and a git runner that pretends to clone — so a project can be bound, spawned
// and pumped without a homeserver or a network.

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { type TranscriptContext } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { type ConversationId, type EnvTarget, Harness, createRegistry } from "@earendil-works/pi-durable";
import { MemoryStorage } from "@earendil-works/pi-durable/storage/memory";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { createAgentEnv, gitPushFor } from "../src/env.ts";
import { type TextEvent } from "../src/core/steer.ts";
import { type ProjectsApi, createProjects } from "../src/projects.ts";
import { EMPTY_PROJECTS, ProjectDoc, ProjectsDoc } from "../src/project-registry.ts";
import { type RoomRouterDeps, createRoomRouter, routeRoom } from "../src/rooms.ts";
import { createSubagents } from "../src/subagents.ts";
import { type GitRunner } from "../src/git.ts";






/** Every durable call in these tests rides the same background context. */
export const context = BACKGROUND_CONTEXT;

// --- helpers ---------------------------------------------------------------

export type Setup = Awaited<ReturnType<typeof setup>>;

export async function setup(options?: { git?: GitRunner; subagents?: boolean; canPush?: boolean }) {
	// A real directory: the instructions are a real file, and "live" only means
	// something if something can edit it between two messages.
	const sandbox = mkdtempSync(join(tmpdir(), "pi-projects-"));
	const projectsDir = join(sandbox, "projects");
	const faux = fauxProvider({ tokensPerSecond: 100_000 });
	const models = createModels();
	models.setProvider(faux.provider);
	const gitCalls: string[][] = [];
	// The `gh` config dir the daemon would grant (`GH_CONFIG_DIR`); empty means the
	// host has none, which makes `push on` a refusal rather than a silent no-op.
	const ghConfigDir = options?.canPush === false ? "" : "/gh";
	const git: GitRunner =
		options?.git ??
		(async (args, cwd) => {
			gitCalls.push([cwd ?? "?", ...args]);
			// a spawn asks for the repository root first; everything else just succeeds
			if (args[0] === "rev-parse") return { ok: true, stdout: "/repo\n", stderr: "" };
			return { ok: true, stdout: "", stderr: "" };
		});
	const projects = createProjects({
		provider: "faux",
		model: "faux-1",
		projectsDir,
		git,
		// The daemon's posture: a project agent keeps every installed extension, the
		// subagent tool included. It is a steer agent in its own repository.
		hideExtensions: [],
		// The daemon in a container: a gh config dir exists, so `push on` is grantable.
		canPush: ghConfigDir.length > 0,
		env: (cwd) => createAgentEnv({ cwd }, sandbox),
	});
	// A report records WHICH conversation spawned the subagent (`roomPost`'s second
	// argument) plus the text: that pair is what the daemon turns into a room.
	const roomPosts: Array<{ text: string; conversation: ConversationId }> = [];
	const subagents =
		options?.subagents === true
			? createSubagents({
					provider: "faux",
					model: "faux-1",
					maxTurns: 3,
					git,
					roomPost: async (text, conversation) => {
						roomPosts.push({ text, conversation });
					},
				})
			: undefined;
	const registry = createRegistry();
	registry.install(projects.extension);
	if (subagents !== undefined) {
		registry.install(subagents.tools);
		registry.install(subagents.limits);
	}
	// The daemon's env factory, mirrored: the permission comes from the conversation's
	// project marker and nowhere else, so a push-enabled project can be probed here.
	const agentEnv = async (target: EnvTarget, envContext: typeof context) =>
		createAgentEnv(target, sandbox, {
			gitPush: gitPushFor(await target.read.snapshot(ProjectDoc, target.conversationId, envContext), ghConfigDir),
		});
	const harness = await Harness.open(
		new MemoryStorage(),
		{
			models,
			registry,
			// The project section reads its AGENTS.md through the conversation's env,
			// exactly as the daemon wires it; without one it can only say so.
			env: agentEnv,
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
	return { sandbox, projectsDir, faux, harness, root, gitCalls, projects, api, roomPosts, subagents, agentEnv, ghConfigDir };
}

/**
 * The system prompt of ONE request. The transcript keeps a system entry per
 * request (that is what was asked), so only the LAST one is the live prompt —
 * reading them all would make every prompt look like the first.
 */
export function promptText(transcript: TranscriptContext): string {
	const systems = transcript.messages.filter((message) => message.role === "system");
	const message = systems[systems.length - 1];
	if (message === undefined) return "";
	const typed = message as { content?: unknown; sections?: Record<string, string> };
	const content = typeof typed.content === "string" ? typed.content : "";
	return [content, ...Object.values(typed.sections ?? {})].join("\n");
}

/** A response step that records the system prompt of every request it answers. */
export function capture(faux: ReturnType<typeof fauxProvider>) {
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

export async function waitUntil(check: () => boolean | Promise<boolean>, ms = 4000): Promise<void> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`waitUntil timed out after ${ms}ms`);
}

export async function submit(handle: { submit(draft: unknown, ctx: typeof context): Promise<{ wait(ctx: typeof context): Promise<unknown> }> }, text: string) {
	const submission = await handle.submit({ type: "input", content: text }, context);
	await submission.wait(context);
}

/** A registry with one bound project. Clones, so the EMPTY_PROJECTS constant stays empty. */
export function bound(state: Parameters<typeof routeRoom>[0], name: string, conversation: number, room: string) {
	const next = { projects: { ...state.projects } };
	next.projects[name] = {
		room,
		conversation: conversation as ConversationId,
		cwd: `/work/${name}`,
		instructions_path: `/work/${name}/AGENTS.md`,
		summary: `${name} summary`,
		push: false,
		created: "2026-01-01T00:00:00.000Z",
	};
	return next;
}

export const event = (room: string, text: string, id = `$evt-${Math.random().toString(16).slice(2)}`): TextEvent => ({
	room,
	id,
	sender: "@jacksim:jacks.im",
	text,
});

/** A router with recording fakes; `submitCalls` is what actually got steered. */
export function routerWith(state: Parameters<typeof routeRoom>[0], rooms: { main: string; project: string; other: string }) {
	const sent: Array<{ room: string; text: string }> = [];
	const reactions: Array<{ room: string; eventId: string }> = [];
	const joins: Array<{ room: string }> = [];
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
		joinRoom: async (roomIdOrAlias) => {
			joins.push({ room: roomIdOrAlias });
			return roomIdOrAlias;
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
			push: async (name, enabled) => `push ${name} ${enabled ? "on" : "off"}`,
			list: async () => "list",
		},
		seen: new Set<string>(),
		lastInbound: new Map(),
		log: (line) => logs.push(line),
	};
	return { router: createRoomRouter(deps), deps, sent, reactions, submitCalls, logs, aborted };
}

