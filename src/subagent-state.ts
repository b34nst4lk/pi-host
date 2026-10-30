// The durable state of the subagent system: two documents, one per scope.
//
// `app.subagents` lives in the main conversation and is the registry the wall
// reads: which subagents exist, which child conversation each one submits into,
// which answer entries were already delivered, and the newest reporter task per
// name. `reported[]` is the report truth (entry ids); `reporters` holds TASK ids
// and means something else — the status of the last reporter to run.
//
// `app.subagent-limits` lives in each child and carries the budget it was spawned
// with, so the turn-limit hook needs no lookup on the parent.
import { defineDoc, type ConversationId, type EntryId, type TaskId } from "@earendil-works/pi-durable";

/** One known subagent, as recorded in the main conversation. */
export type SubagentRecord = {
	/** The child conversation this name submits into. */
	conversationId: ConversationId;
	/** Answer entry ids already delivered; never reported twice. */
	reported: EntryId[];
	/** The worktree the child works in. */
	worktree: string;
};

/** The subagent registry, kept in the main conversation. */
export type SubagentsState = {
	agents: Record<string, SubagentRecord>;
	/** Newest reporter task per name, for `status`. */
	reporters: Record<string, TaskId>;
};

/** Empty registry, for a conversation that never spawned anything. */
export const EMPTY_SUBAGENTS: SubagentsState = { agents: {}, reporters: {} };

export const SubagentsDoc = defineDoc<SubagentsState>({
	kind: "app.subagents",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ agents: {}, reporters: {} }),
});

/** The run limits a child was spawned with, kept in the child conversation. */
export type SubagentLimitsState = {
	/** 0 means "no limit": a conversation that is not a subagent never sets one. */
	maxTurns: number;
	name: string;
	model: string;
};

export const SubagentLimitsDoc = defineDoc<SubagentLimitsState>({
	kind: "app.subagent-limits",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ maxTurns: 0, name: "", model: "" }),
});
