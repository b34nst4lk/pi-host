// Subagent system: NAMED, PERSISTENT subagents that work in their own git
// worktree while the main agent keeps answering the room.
//
// Shape (one commit per spawn/send):
//   spawn → anchor task (background: the boundary an Esc or an idle wait stops
//           at) + child conversation owned by it + agent configured for the
//           worktree + a reporter task that carries the first message;
//   send  → another reporter task on the same child conversation;
//   report→ the reporter submits, waits for the answer, then delivers it TWICE:
//           as `input` in the main conversation (a follow-up) and as a threaded
//           room post `[subagent <name>] <answer>`. The answer entry id lands
//           in `reported[]` in the same commit, so a committed answer is never
//           delivered again, not even across a restart.
//
// Durable state lives in two documents: `SubagentsDoc` in the main conversation
// (which subagents exist, where their children live, what was already reported)
// and `SubagentLimitsDoc` in each child (the turn budget it was spawned with).
import type { Context } from "@earendil-works/chord";
import { Type } from "@earendil-works/pi-ai";
import {
	configure,
	defineExtension,
	defineTool,
	GenerationTask,
	hook,
	type ConversationId,
	type Extension,
	type JsonObject,
	type ToolExecutionApi,
} from "@earendil-works/pi-durable";
import { defineAnchorTask } from "./anchor.ts";
import { GIT_MISSING, type GitRunner } from "./git.ts";
import { applyTurnLimit, parseSubagentName, reasonOf, subagentBranch, subagentInstructions } from "./subagent-messages.ts";
import { defineReporterTask } from "./subagent-reporter.ts";
import { EMPTY_SUBAGENTS, SubagentLimitsDoc, SubagentsDoc } from "./subagent-state.ts";


/** Extension that offers the `subagent` tool; a child subagent never selects it. */
export const SUBAGENT_TOOLS_EXTENSION = "subagents";
/** Extension that enforces each child's turn budget. */
export const SUBAGENT_LIMITS_EXTENSION = "subagent-limits";
/** Default child model: fast and cheap; the parent decides the hard parts. */
export const SUBAGENT_DEFAULT_MODEL = "glm-5.3-flash";
/** Default turn budget for one child message. */
export const SUBAGENT_DEFAULT_MAX_TURNS = 40;

// --- the host surface ------------------------------------------------------

/** Everything the subagent system needs from the daemon. */
export type SubagentHost = {
	/** Provider of the child's model (the daemon's own). */
	readonly provider: string;
	/** Model id of the child's model. */
	readonly model: string;
	/** Turn budget for one child message. */
	readonly maxTurns: number;
	/** Runs git; `envGit` in production. */
	readonly git: GitRunner;
	/**
	 * Posts to the room, threaded onto the newest inbound message, read at send time.
	 * `conversation` is the spawner: a project's agent spawns from its own
	 * conversation, so its report belongs in that project's room.
	 */
	readonly roomPost: (text: string, conversation: ConversationId) => Promise<unknown>;
	/** One-line logger. */
	readonly log?: (message: string) => void;
};

/** A tool result the model reads as a refusal. */
/** Tool result content for one line of text. */
const text = (value: string) => [{ type: "text" as const, text: value }];

function failure(message: string) {
	return { output: text(message), isError: true, details: { ok: false, reason: message } };
}

/**
 * Build the two extensions of the subagent system: `subagents` (the tool and
 * its tasks) and `subagent-limits` (the turn budget hook). A child selects
 * everything except `subagents`, so it cannot spawn grandchildren.
 *
 * The tasks close over `host`, which is why they are built here rather than at
 * module scope: a task definition is per-daemon configuration.
 */
export function createSubagents(host: SubagentHost): { tools: Extension; limits: Extension } {
	/** The anchor of one subagent: the task the child conversation hangs from. */
	const anchorTask = defineAnchorTask("subagent-anchor");
	/** The reporter: one durable task per message sent to a subagent. */
	const reporterTask = defineReporterTask(host);

	/** Spawn: worktree first (loud when git is missing), then ONE commit. */
	const spawn = async (
		name: string,
		firstMessage: string,
		maxTurnsOverride: number | undefined,
		api: ToolExecutionApi,
		context: Context,
	) => {
		const existing = (await api.snapshot(SubagentsDoc, api.conversationId, context))?.agents[name];
		if (existing !== undefined) {
			return failure(`subagent ${name} already exists (child conversation ${existing.conversationId})`);
		}

		const agent = await api.agent(context);
		const env = api.env;
		const repo = await host.git(["rev-parse", "--show-toplevel"], agent.cwd, env, context);
		if (!repo.ok) {
			if (repo.missing === true) return failure(GIT_MISSING);
			return failure(`git rev-parse --show-toplevel failed in ${agent.cwd ?? "the workspace"}: ${repo.stderr.trim()}`);
		}
		const root = repo.stdout.trim().split("\n").filter(Boolean).pop();
		if (root === undefined) return failure("could not resolve the repository root: git printed no path");
		const worktree = `${root}/worktrees/${name}`;
		const branch = subagentBranch(name);
		const added = await host.git(["worktree", "add", worktree, "-b", branch], root, env, context);
		if (!added.ok) {
			if (added.missing === true) return failure(GIT_MISSING);
			return failure(`git worktree add ${worktree} failed: ${added.stderr.trim()}`);
		}

		const maxTurns =
			maxTurnsOverride !== undefined && maxTurnsOverride > 0 ? Math.floor(maxTurnsOverride) : host.maxTurns;
		const instructions = subagentInstructions({ name, maxTurns, worktree });
		try {
			const created = await api.commit(async (tx) => {
				const doc = await tx.doc(SubagentsDoc, api.conversationId);
				if (doc.agents[name] !== undefined) throw new Error(`subagent ${name} already exists`);
				const anchor = await tx.createTask(
					anchorTask,
					{ name },
					{ ownership: { kind: "conversation" }, conversationId: api.conversationId, background: true },
				);
				const child = await tx.createConversation({ ownership: { kind: "task", taskId: anchor } });
				await configure(tx, child.id, {
					extensions: { remove: [toolsExtension] },
					instructions,
					model: { provider: host.provider, modelId: host.model },
					cwd: worktree,
				});
				const limits = await tx.doc(SubagentLimitsDoc, child.id);
				limits.maxTurns = maxTurns;
				limits.name = name;
				limits.model = host.model;
				const reporter = await tx.createTask(
					reporterTask,
					{ name, child: child.id, worktree, message: firstMessage, followUp: true },
					{ ownership: { kind: "conversation" }, conversationId: api.conversationId, background: true },
				);
				doc.agents[name] = { conversationId: child.id, reported: [], worktree };
				doc.reporters[name] = reporter;
				return { child: child.id, reporter };
			}, context);
			host.log?.(`subagent ${name} spawned: child ${created.child}, reporter ${created.reporter}, worktree ${worktree}`);
			return {
				output: text(
					`spawned subagent ${name}: branch ${branch}, worktree ${worktree}, child conversation ${created.child}. Its answer will arrive as a message and as a room post.`,
				),
				details: {
					ok: true,
					action: "spawn",
					name,
					worktree,
					branch,
					child: String(created.child),
					reporter: String(created.reporter),
				},
			};
		} catch (error) {
			return failure(`spawn of ${name} failed: ${reasonOf(error)}`);
		}
	};

	/** Send: one more reporter task on the same child conversation. */
	const send = async (name: string, message: string, followUp: boolean, api: ToolExecutionApi, context: Context) => {
		const record = (await api.snapshot(SubagentsDoc, api.conversationId, context))?.agents[name];
		if (record === undefined) return failure(`no subagent named ${name}; spawn it first`);
		const reporter = await api.commit(async (tx) => {
			const doc = await tx.doc(SubagentsDoc, api.conversationId);
			const current = doc.agents[name];
			if (current === undefined) throw new Error(`no subagent named ${name}`);
			const created = await tx.createTask(
				reporterTask,
				{ name, child: current.conversationId, worktree: current.worktree, message, followUp },
				{ ownership: { kind: "conversation" }, conversationId: api.conversationId, background: true },
			);
			doc.reporters[name] = created;
			return created;
		}, context);
		return {
			output: text(
				`sent to subagent ${name} (${followUp ? "queued behind its current work" : "steering its current work"}); reporter ${reporter}. Its answer will arrive as a message and as a room post.`,
			),
			details: { ok: true, action: "send", name, reporter: String(reporter) },
		};
	};

	/** Stop: abort the child's current work; nothing is reported for it. */
	const stop = async (name: string, api: ToolExecutionApi, context: Context) => {
		const record = (await api.snapshot(SubagentsDoc, api.conversationId, context))?.agents[name];
		if (record === undefined) return failure(`no subagent named ${name}`);
		const child = await api.conversation(record.conversationId, context);
		if (child === undefined) return failure(`subagent ${name}: conversation ${record.conversationId} is gone`);
		await child.abort(context, { background: true });
		return {
			output: text(
				`stopped subagent ${name}: its current work was aborted; nothing will be reported for it. Its worktree ${record.worktree} stays as it is.`,
			),
			details: { ok: true, action: "stop", name },
		};
	};

	/** Status: the durable doc, plus each newest reporter's state. */
	const status = async (api: ToolExecutionApi, context: Context) => {
		const doc = (await api.snapshot(SubagentsDoc, api.conversationId, context)) ?? EMPTY_SUBAGENTS;
		const names = Object.keys(doc.agents).sort();
		if (names.length === 0) {
			return {
				output: text("no subagents yet; use `subagent` action `spawn` to start one"),
				details: { ok: true, action: "status", agents: [] },
			};
		}
		const lines: string[] = [];
		const agents: JsonObject[] = [];
		for (const name of names) {
			const record = doc.agents[name]!;
			const reporterId = doc.reporters[name];
			let reporterText = "no reporter";
			if (reporterId !== undefined) {
				const task = await api.getTask(reporterId, context);
				reporterText =
					task === undefined ? `reporter ${reporterId} (gone)` : `reporter ${reporterId} (${task.state.status})`;
			}
			lines.push(
				`${name}: branch ${subagentBranch(name)}, worktree ${record.worktree}, child ${record.conversationId}, reported ${record.reported.length}, ${reporterText}`,
			);
			agents.push({ name, ...record, reporter: reporterId ?? null });
		}
		return { output: text(lines.join("\n")), details: { ok: true, action: "status", agents } };
	};

	const tool = defineTool({
		name: "subagent",
		description:
			"Run work in a NAMED, PERSISTENT subagent that works in its own git worktree while you keep answering the room. " +
			"`spawn` starts one in one commit: it gets branch `worktree-<name>`, the worktree `worktrees/<name>`, and its own conversation; " +
			"its answer comes back to you as a message and lands in the room as `[subagent <name>] ...`. " +
			"`send` gives the same subagent another message (queued behind its current work unless `followUp` is false). " +
			"`stop` aborts its current work and reports nothing for it. `status` lists every subagent with its newest reporter. " +
			"A subagent's work is auto-committed in its worktree when it finishes, and the worktree is NEVER removed for you; " +
			"merging is explicit — read the diff first (`git -C worktrees/<name> diff main`), propose it, and act only when the user says so.",
		replay: "unsafe",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("spawn"), Type.Literal("send"), Type.Literal("stop"), Type.Literal("status")]),
			name: Type.Optional(Type.String({ description: "subagent name: lower-case letters, digits, dashes (spawn, send, stop)" })),
			task: Type.Optional(Type.String({ description: "spawn: the first message, i.e. the work to start on" })),
			message: Type.Optional(Type.String({ description: "send: the next message for an existing subagent" })),
			followUp: Type.Optional(
				Type.Boolean({ description: "send: queue behind its current work (default true); false steers it" }),
			),
			maxTurns: Type.Optional(Type.Number({ description: "spawn: override the turn budget for one message" })),
		}),
		execute: async (args, api, context) => {
			if (args.action === "spawn") {
				const name = parseSubagentName(args.name ?? "");
				if (name === null) {
					return failure(`invalid subagent name '${args.name ?? ""}': use lower-case letters, digits, dashes (max 40)`);
				}
				const firstMessage = (args.task ?? "").trim();
				if (firstMessage.length === 0) return failure("spawn needs `task`: the first message for the subagent");
				return spawn(name, firstMessage, args.maxTurns, api, context);
			}
			if (args.action === "send") {
				const name = parseSubagentName(args.name ?? "");
				if (name === null) return failure(`invalid subagent name '${args.name ?? ""}'`);
				const message = (args.message ?? "").trim();
				if (message.length === 0) return failure("send needs `message`");
				return send(name, message, args.followUp !== false, api, context);
			}
			if (args.action === "stop") {
				const name = parseSubagentName(args.name ?? "");
				if (name === null) return failure(`invalid subagent name '${args.name ?? ""}'`);
				return stop(name, api, context);
			}
			return status(api, context);
		},
	});

	const toolsExtension = defineExtension({
		name: SUBAGENT_TOOLS_EXTENSION,
		tools: [tool],
		tasks: [anchorTask, reporterTask],
	});
	const limitsExtension = defineExtension({
			name: SUBAGENT_LIMITS_EXTENSION,
			hooks: [
				hook(GenerationTask, {
					beforeRequest: async (request, api, context) => {
						const limits = await api.snapshot(SubagentLimitsDoc, api.conversationId, context);
						if (limits === undefined || limits.maxTurns <= 0) return undefined;
						return { messages: applyTurnLimit(request.messages, limits.maxTurns) };
					},
				}),
			],
	});
	return { tools: toolsExtension, limits: limitsExtension };
}
