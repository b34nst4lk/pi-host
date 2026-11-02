// The project registry: the two durable documents a project lives in, and nothing
// else. Split out of `projects.ts` because the docs are the part OTHER modules
// read (the daemon's env factory reads the marker per tool call, the wall and the
// fixtures read the registry) while the rest of that file is the behaviour.
//
// The registry lives in the MAIN conversation and stores POINTERS — room,
// conversation, cwd, instructions path, summary, push flag — never a copy of the
// instructions. A project's instructions are its own `AGENTS.md`, re-read on every
// request; editing the file changes the next prompt with no command and no restart.
import { defineDoc, type ConversationId } from "@earendil-works/pi-durable";

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
	/**
	 * May this project's agent push? PERMISSION only — the token stays central
	 * (`GH_CONFIG_DIR`), never in the registry and never in the project directory.
	 * Off unless a `/project push <name> on` turned it on.
	 */
	push: boolean;
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
 * project it is or where its instructions live. The env factory reads it too: the
 * push permission has to be answerable for a conversation, not for a room.
 */
export type ProjectMarker = {
	name: string;
	cwd: string;
	instructions_path: string;
	/** The push permission, mirrored here because the env factory reads THIS conversation's docs. */
	push: boolean;
};

export const ProjectDoc = defineDoc<ProjectMarker>({
	kind: "app.project",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ name: "", cwd: "", instructions_path: "", push: false }),
});
