// The multi-project fixtures: a real harness over memory storage, a faux model,
// and a git runner that pretends to clone — so a project can be bound, spawned
// and pumped without a homeserver or a network.

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { type TranscriptContext } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { type ConversationId, Harness, createRegistry } from "@earendil-works/pi-durable";
import { MemoryStorage } from "@earendil-works/pi-durable/storage/memory";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "vitest";
import { createAgentEnv } from "../src/env.ts";
import { type TextEvent } from "../src/core/steer.ts";
import { EMPTY_PROJECTS, type ProjectsApi, ProjectsDoc, createProjects } from "../src/projects.ts";
import { type RoomRouterDeps, createRoomRouter, routeRoom } from "../src/rooms.ts";
import { type GitRunner } from "../src/git.ts";






/** Every durable call in these tests rides the same background context. */
export const context = BACKGROUND_CONTEXT;

// --- helpers ---------------------------------------------------------------

export type Setup = Awaited<ReturnType<typeof setup>>;

export async function setup(options?: { git?: GitRunner }) {
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

