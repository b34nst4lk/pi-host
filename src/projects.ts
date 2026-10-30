// Projects: rooms bound to persistent child conversations.
//
// A project is a ROOM plus a durable conversation plus a working directory. The
// room is the chat surface a project answers in; the conversation is where the
// work is recorded; the directory is where the agent's tools run. Binding one is
// `/project bind <name> <path>`, and the room that gets bound is the room the
// command arrived in — a chat surface must not be able to bind a room the sender
// is not standing in.
//
// Shape of a bind (ONE commit, the same machinery as a subagent):
//   anchor task (background: it holds, so `/stop` on the main conversation never
//   reaches into a project) → child conversation owned by it → agent configured
//   for the project directory → `app.project` marker in the child → the
//   `app.projects` record in the main conversation.
//
// The registry stores POINTERS, never a copy of the instructions: a project's
// instructions are its own `AGENTS.md`, re-read on every request by the `project`
// prompt section below. Editing the file changes the agent's prompt on the next
// message, with no command and no restart — the file is the living source of
// truth and the registry only remembers where it is.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
	configure,
	defineDoc,
	section,
	type ConversationId,
	type Extension,
	type PromptSection,
	type TaskRuntime,
	type Tx,
} from "@earendil-works/pi-durable";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";
import { isAbsolute, join, resolve } from "node:path";
import { defineAnchorTask } from "./anchor.ts";
import type { GitRunner } from "./git.ts";

const context = BACKGROUND_CONTEXT;

/** Project names become directory names and appear in replies: narrow on purpose. */
export const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** The instructions file a project reads on every request. */
export const INSTRUCTIONS_FILE = "AGENTS.md";

/** `null` when the name is not directory-safe; otherwise the trimmed name. */
export function parseProjectName(raw: string): string | null {
	const name = raw.trim();
	return PROJECT_NAME_PATTERN.test(name) ? name : null;
}

// --- durable state ---------------------------------------------------------

/** One project, as the registry in the main conversation records it. */
export type ProjectRecord = {
	/** The Matrix room this project answers in (full id: it is a routing key). */
	room: string;
	/** The child conversation bound to that room. */
	conversation: ConversationId;
	/** Where the agent's tools run. */
	cwd: string;
	/** The file re-read on every request: `<cwd>/AGENTS.md` unless it was moved. */
	instructions_path: string;
	/** First line of `AGENTS.md` when the project was bound (and when last listed). */
	summary: string;
	/** ISO timestamp of the bind. */
	created: string;
};

/** The project registry. One per daemon, kept in the main conversation. */
export type ProjectsState = { projects: Record<string, ProjectRecord> };

/** A conversation that never had a project bound has an empty registry. */
export const EMPTY_PROJECTS: ProjectsState = { projects: {} };

export const ProjectsDoc = defineDoc<ProjectsState>({
	kind: "app.projects",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ projects: {} }),
});

/**
 * The marker a project conversation carries about itself. It exists because the
 * prompt section renders INSIDE the child conversation and can only read that
 * conversation's documents: without it, a project agent could not say which
 * project it is or where its instructions live.
 */
export type ProjectMarker = {
	name: string;
	cwd: string;
	instructions_path: string;
};

export const ProjectDoc = defineDoc<ProjectMarker>({
	kind: "app.project",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ name: "", cwd: "", instructions_path: "" }),
});

// --- the anchor ------------------------------------------------------------

/** What a project conversation hangs from: the shared anchor, under its own kind. */
const anchorTask = defineAnchorTask("project-anchor");

// --- text ------------------------------------------------------------------

/** The starter `AGENTS.md` `/project new` writes; the project's agent fills it in. */
export function starterAgentsMd(name: string): string {
	return [
		`# ${name}`,
		"",
		"One line on what this project is for. Replace this line.",
		"",
		"## Layout",
		"",
		"- (what lives where)",
		"",
		"## How to work here",
		"",
		"- Keep every change inside this directory.",
		"- Run the tests before you report.",
		"- Say what you changed and what is left; no preamble.",
		"",
	].join("\n");
}

/** The first meaningful line of an `AGENTS.md`, for the registry summary. */
export function summaryOf(text: string): string {
	for (const raw of text.split("\n")) {
		const line = raw.trim().replace(/^#{1,6}\s*/, "");
		if (line.length > 0) return line.length > 120 ? `${line.slice(0, 117)}…` : line;
	}
	return "";
}

/** The configured instructions of a project conversation (the static half). */
export function projectInstructions(input: { name: string; cwd: string; instructionsPath: string }): string {
	return [
		`You are the agent of the project "${input.name}", working in the directory ${input.cwd}.`,
		"Everything you change stays inside that directory; it is its own git repository.",
		`Your instructions for this project are the file ${input.instructionsPath}, which is re-read on every request: ` +
			"it is the living source of truth for what this project is and how to work in it. Keep it current when you learn something durable.",
		"You are steered from a Matrix room; answer the message you are given and stop. Be terse and factual.",
	].join("\n");
}

/** The teaching hint: what the project commands are, in one reply. */
export function projectHint(): string {
	return [
		"project commands (type them in the room you want to stand in):",
		"  /project new <name> [path] — scaffold a directory (mkdir + git init + starter AGENTS.md) and bind THIS room to it",
		"  /project bind <name> <path> — bind THIS room to an existing directory",
		"  /project list — every project, its room and its working directory",
		"plain text in a bound room goes to that project's conversation; /steer, /note, /stop and /status work there too.",
	].join("\n");
}

/** One project as `/project list` shows it. Pure, so the test is a fixture. */
export function describeProject(name: string, record: ProjectRecord, liveSummary: string | null): string {
	const summary = liveSummary ?? record.summary;
	return [
		`${name} — room ${record.room} — conversation ${record.conversation} — ${record.cwd}`,
		summary.length === 0 ? "" : `    ${summary}`,
	]
		.filter(Boolean)
		.join("\n");
}

/** The whole registry, newest bind last, or a single line saying there is none. */
export function describeProjects(state: ProjectsState, summaries: Record<string, string> = {}): string {
	const names = Object.keys(state.projects ?? {}).sort();
	if (names.length === 0) return "no projects yet: /project new <name> [path] in the room you want to bind";
	return names
		.map((name) => describeProject(name, state.projects[name]!, summaries[name] ?? null))
		.join("\n");
}

// --- binding ---------------------------------------------------------------

/** What every project operation needs from the daemon's durable side. */
export type ProjectsApi = {
	/** The main conversation: where the registry lives. */
	readonly main: ConversationId;
	/** A commit on the main conversation. */
	readonly commit: <T>(body: (tx: Tx) => T | Promise<T>) => Promise<T>;
	/** The current registry. */
	readonly projects: () => Promise<ProjectsState>;
};

/** Everything the project system needs from the daemon. */
export type ProjectsHost = {
	/** Provider of a project's model (the daemon's own). */
	readonly provider: string;
	/** Model id of a project's model. */
	readonly model: string;
	/** Where `/project new` puts a project when the message carries no path. */
	readonly projectsDir: string;
	/** Runs git; `envGit` in production. */
	readonly git: GitRunner;
	/** Extensions a project agent must never select (the subagent tool: a project is a space, not a spawner). */
	readonly hideExtensions: readonly Extension[];
	/** The execution environment for one directory. */
	readonly env: (cwd: string) => ExecutionEnv;
	/** One-line logger. */
	readonly log?: (message: string) => void;
};

/** The outcome of one `/project` command: a line for the room, or why not. */
export type ProjectOutcome =
	| {
			readonly ok: true;
			readonly name: string;
			readonly conversation: ConversationId;
			readonly room: string;
			readonly cwd: string;
			readonly created: boolean;
			readonly note: string;
	  }
	| { readonly ok: false; readonly error: string };

function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Absolute paths stay; a relative path is resolved against the projects directory. */
function resolveDir(projectsDir: string, raw: string): string {
	return isAbsolute(raw) ? resolve(raw) : resolve(projectsDir, raw);
}

export function createProjects(host: ProjectsHost) {
	const log = host.log ?? (() => {});

	/**
	 * The living instructions: rendered per request, read from disk per request.
	 * A project whose `AGENTS.md` changed since the last message is a project
	 * whose agent knows the change — the prompt is never a snapshot.
	 */
	const projectSection: PromptSection = section(
		"project",
		async (input, promptContext) => {
			const marker = await input.read.snapshot(ProjectDoc, input.conversationId, promptContext);
			if (marker === undefined || marker.name.length === 0) return undefined;
			const cwd = marker.cwd.length > 0 ? marker.cwd : input.agent.cwd ?? "";
			const path = marker.instructions_path.length > 0 ? marker.instructions_path : join(cwd, INSTRUCTIONS_FILE);
			let body: string;
			if (input.env === undefined) {
				body = "(no execution environment: the instructions file cannot be read)";
			} else {
				const read = await input.env.readTextFile(path, promptContext);
				body = read.ok
					? read.value.trimEnd()
					: `(the instructions file ${path} cannot be read: ${read.error.message} — write it; it is your source of truth)`;
			}
			return [
				`You are the agent of the project "${marker.name}". Its working directory is ${cwd}.`,
				`Its instructions live in ${path} and are re-read on every request; this is the current content:`,
				"",
				body,
			].join("\n");
		},
		{ tag: false },
	);

	/** The registry, read fresh: bind commands change it mid-run. */
	async function registry(api: ProjectsApi): Promise<ProjectsState> {
		return (await api.projects()) ?? EMPTY_PROJECTS;
	}

	/**
	 * ONE commit binds a directory to a room: anchor, child conversation,
	 * configured agent, marker, registry record. Every duplicate check runs inside
	 * that commit, so two bind commands racing cannot both win.
	 */
	async function attach(
		name: string,
		dir: string,
		room: string,
		created: boolean,
		api: ProjectsApi,
	): Promise<ProjectOutcome> {
		const instructionsPath = join(dir, INSTRUCTIONS_FILE);
		const env = host.env(dir);
		const read = await env.readTextFile(instructionsPath, context);
		const summary = read.ok ? summaryOf(read.value) : "";
		const note =
			read.ok || created
				? ""
				: ` — note: ${instructionsPath} does not exist yet; write it, the agent reads it on every request`;
		const createdAt = new Date().toISOString();
		let conversation: ConversationId;
		try {
			conversation = await api.commit(async (tx) => {
				const doc = await tx.doc(ProjectsDoc, api.main);
				const existing = doc.projects[name];
				if (existing !== undefined) {
					throw new Error(
						`project ${name} is already bound to room ${existing.room} (conversation ${existing.conversation}); unbinding is not implemented`,
					);
				}
				for (const [other, record] of Object.entries(doc.projects)) {
					if (record.room !== room) continue;
					throw new Error(
						`this room is already bound to project ${other}; a room steers one project (unbinding is not implemented)`,
					);
				}
				const anchor = await tx.createTask(
					anchorTask,
					{ name },
					{ ownership: { kind: "conversation" }, conversationId: api.main, background: true },
				);
				const child = await tx.createConversation({ ownership: { kind: "task", taskId: anchor } });
				const change = {
					instructions: projectInstructions({ name, cwd: dir, instructionsPath }),
					model: { provider: host.provider, modelId: host.model },
					cwd: dir,
					...(host.hideExtensions.length > 0 ? { extensions: { remove: [...host.hideExtensions] } } : {}),
				};
				await configure(tx, child.id, change);
				const marker = await tx.doc(ProjectDoc, child.id);
				marker.name = name;
				marker.cwd = dir;
				marker.instructions_path = instructionsPath;
				doc.projects[name] = {
					room,
					conversation: child.id,
					cwd: dir,
					instructions_path: instructionsPath,
					summary,
					created: createdAt,
				};
				return child.id;
			});
		} catch (error) {
			return { ok: false, error: reasonOf(error) };
		}
		log(`project ${name} ${created ? "created" : "bound"}: conversation ${conversation}, room ${room}, cwd ${dir}`);
		return { ok: true, name, conversation, room, cwd: dir, created, note };
	}

	/** `/project new <name> [path]`: scaffold a directory, then bind it. */
	async function create(name: string, path: string, room: string, api: ProjectsApi): Promise<ProjectOutcome> {
		const trimmed = parseProjectName(name);
		if (trimmed === null) {
			return { ok: false, error: `invalid project name '${name}': lower-case letters, digits, dashes (max 40)` };
		}
		const dir = path.length > 0 ? resolveDir(host.projectsDir, path) : join(host.projectsDir, trimmed);
		const state = await registry(api);
		if (state.projects[trimmed] !== undefined) {
			return {
				ok: false,
				error: `project ${trimmed} already exists (room ${state.projects[trimmed]!.room}); /project bind it or /project list them`,
			};
		}
		const env = host.env(dir);
		const made = await env.createDir(dir, { recursive: true }, context);
		if (!made.ok) return { ok: false, error: `mkdir ${dir} failed: ${made.error.message}` };
		const initialised = await host.git(["init"], dir, env, context);
		if (!initialised.ok) {
			if (initialised.missing === true) {
				return {
					ok: false,
					error: `created ${dir} but git is not available in this runtime, so nothing was bound: the project system needs the git-equipped image`,
				};
			}
			return {
				ok: false,
				error: `created ${dir} but \`git init\` failed there: ${initialised.stderr.trim() || "git said nothing"} — nothing was bound`,
			};
		}
		const instructionsPath = join(dir, INSTRUCTIONS_FILE);
		const existing = await env.readTextFile(instructionsPath, context);
		if (!existing.ok) {
			const wrote = await env.writeFile(instructionsPath, starterAgentsMd(trimmed), context);
			if (!wrote.ok) {
				return { ok: false, error: `created ${dir} but writing ${instructionsPath} failed: ${wrote.error.message}` };
			}
		}
		return attach(trimmed, dir, room, true, api);
	}

	/** `/project bind <name> <path>`: bind a room to an existing directory. */
	async function bind(name: string, path: string, room: string, api: ProjectsApi): Promise<ProjectOutcome> {
		const trimmed = parseProjectName(name);
		if (trimmed === null) {
			return { ok: false, error: `invalid project name '${name}': lower-case letters, digits, dashes (max 40)` };
		}
		if (path.length === 0) {
			return { ok: false, error: `bind needs a directory: /project bind ${trimmed} <path>` };
		}
		const dir = resolveDir(host.projectsDir, path);
		const env = host.env(dir);
		const there = await env.exists(dir, context);
		if (!there.ok) return { ok: false, error: `cannot check ${dir}: ${there.error.message}` };
		if (!there.value) return { ok: false, error: `no such directory: ${dir}` };
		return attach(trimmed, dir, room, false, api);
	}

	/** `/project list`: the registry, with each project's summary re-read live. */
	async function list(api: ProjectsApi): Promise<string> {
		const state = await registry(api);
		const summaries: Record<string, string> = {};
		for (const [name, record] of Object.entries(state.projects)) {
			const read = await host.env(record.cwd).readTextFile(record.instructions_path, context);
			if (read.ok) summaries[name] = summaryOf(read.value);
		}
		return describeProjects(state, summaries);
	}

	return {
		create,
		bind,
		list,
		/** The `project` prompt section: the living instructions. */
		section: projectSection,
		/** The extension that installs the section AND the anchor task — the anchor
			must ship with the extension (the durability contract: pending anchors
			resume only once their definition is registered again). Missed in the
			2026-10-30 wiring: both project anchors sat pending forever. */
		extension: { name: "projects", sections: [projectSection], tasks: [anchorTask] } satisfies Extension,
		anchor: anchorTask,
	};
}
