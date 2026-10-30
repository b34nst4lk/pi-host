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
	defineDoc,
	defineExtension,
	defineTask,
	defineTool,
	GenerationTask,
	hook,
	type ContextView,
	type ConversationId,
	type EntryId,
	type Extension,
	type JsonObject,
	type TaskId,
	type TaskRuntime,
	type ToolExecutionApi,
} from "@earendil-works/pi-durable";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";
import { defineAnchorTask } from "./anchor.ts";

/** Extension that offers the `subagent` tool; a child subagent never selects it. */
export const SUBAGENT_TOOLS_EXTENSION = "subagents";
/** Extension that enforces each child's turn budget. */
export const SUBAGENT_LIMITS_EXTENSION = "subagent-limits";
/** Default child model: fast and cheap; the parent decides the hard parts. */
export const SUBAGENT_DEFAULT_MODEL = "glm-5.3-flash";
/** Default turn budget for one child message. */
export const SUBAGENT_DEFAULT_MAX_TURNS = 40;

/** One message of the model context: what the turn-limit hook rewrites. */
type ChatMessage = ContextView["messages"][number];

/** Names end up in git branches and directory names, so they are narrow on purpose. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Marker the wrap-up instruction carries, so it is injected once. */
const TURN_LIMIT_MARKER = "Turn limit reached.";

/** Report text when a subagent finished without any prose. */
const NO_ANSWER_TEXT = "(the subagent answered with no text)";

/** `null` when the name is not worktree-safe; otherwise the trimmed name. */
export function parseSubagentName(raw: string): string | null {
	const name = raw.trim();
	return NAME_PATTERN.test(name) ? name : null;
}

/** The branch a subagent works on: `worktree-<name>`. */
export function subagentBranch(name: string): string {
	return `worktree-${name}`;
}

/** How a subagent's answer appears in the room. */
export function reportBody(name: string, text: string): string {
	return `[subagent ${name}] ${text}`;
}

/** The child's instructions: who it is, where it works, and its budget. */
export function subagentInstructions(input: { name: string; maxTurns: number; worktree: string }): string {
	return [
		`You are the subagent "${input.name}", working on branch ${subagentBranch(input.name)} in the git worktree ${input.worktree}.`,
		"Work only inside that worktree. Your work is committed there when you finish; it is never merged for you — the main agent reads the diff and proposes the merge.",
		`Answer the message you are given and stop: you have at most ${input.maxTurns} model turns per message. Be terse and factual; no preamble.`,
		"If the work needs more than that, do the most valuable part and say what is left.",
	].join("\n");
}

/** Text of one model message, for scanning user messages. */
function textOf(message: ChatMessage): string {
	const content = message.content as unknown;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			const typed = block as { type?: string; text?: string };
			return typed.type === "text" ? typed.text ?? "" : "";
		})
		.join("");
}

/**
 * The turn budget, enforced at request time: at the limit the model gets one
 * forced wrap-up turn instead of another tool round. Idempotent — a context
 * that already carries the instruction is returned unchanged; `maxTurns <= 0`
 * means "no limit" and returns the context untouched.
 */
export function applyTurnLimit(messages: readonly ChatMessage[], maxTurns: number): readonly ChatMessage[] {
	if (maxTurns <= 0) return messages;
	const turns = messages.filter((message) => message.role === "assistant").length;
	if (turns < maxTurns) return messages;
	if (messages.some((message) => message.role === "user" && textOf(message).includes(TURN_LIMIT_MARKER))) return messages;
	const wrapUp = {
		role: "user",
		content: [
			{
				type: "text",
				text: `${TURN_LIMIT_MARKER} You have used your ${maxTurns} turns. Do not call tools. Answer now with what you have and what is left.`,
			},
		],
	} as ChatMessage;
	return [...messages, wrapUp];
}

// --- durable state ---------------------------------------------------------

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
const EMPTY_SUBAGENTS: SubagentsState = { agents: {}, reporters: {} };

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

// --- git -------------------------------------------------------------------

/** Outcome of one git invocation, reduced to what the subagent flow needs. */
export type GitRun = {
	readonly ok: boolean;
	readonly stdout: string;
	readonly stderr: string;
	/** True when git is not installed at all, as opposed to a command that failed. */
	readonly missing?: boolean;
};

/** Runs git somewhere inside the agent's environment; injectable so tests need no git. */
export type GitRunner = (
	args: readonly string[],
	cwd: string | undefined,
	env: ExecutionEnv | undefined,
	context: Context,
) => Promise<GitRun>;

/** The real runner: git through the harness environment, whose absence is loud. */
export const envGit: GitRunner = async (args, cwd, env, context) => {
	if (env === undefined) {
		return { ok: false, stdout: "", stderr: "no execution environment for git", missing: true };
	}
	let output = "";
	const result = await env.exec(["git", ...args], { cwd, onOutput: (text) => { output += text; } }, context);
	if (!result.ok) {
		const error = result.error as { code?: string; message?: string };
		return { ok: false, stdout: output, stderr: error.message ?? "git failed", missing: error.code === "spawn_error" };
	}
	return { ok: result.value.exitCode === 0, stdout: output, stderr: output };
};

/** What every failing git path says when the runtime has no git binary. */
const GIT_MISSING =
	"git not available in runtime — cutover image pending: nothing was spawned (no worktree, no conversation). " +
	"The subagent system needs the git-equipped image to cut over.";

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
	/** Posts to the room, threaded onto the newest inbound message, read at send time. */
	readonly roomPost: (text: string) => Promise<unknown>;
	/** One-line logger. */
	readonly log?: (message: string) => void;
};

/** A tool result the model reads as a refusal. */
/** Tool result content for one line of text. */
const text = (value: string) => [{ type: "text" as const, text: value }];

function failure(message: string) {
	return { output: text(message), isError: true, details: { ok: false, reason: message } };
}

/** One-line reason from an error, for report text and outcomes. */
function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

type ReporterInput = {
	/** Which subagent this report belongs to. */
	name: string;
	/** The child conversation to submit into. */
	child: ConversationId;
	/** The worktree, for the completion commit. */
	worktree: string;
	/** The message to submit. */
	message: string;
	/** `true`: queue behind the child's current work; `false`: steer it. */
	followUp: boolean;
};
type ReporterState = { phase: "report"; attempt: number };
type ReporterOutcome =
	| { status: "delivered"; answer: EntryId }
	| { status: "already_reported"; answer: EntryId }
	| { status: "stopped" }
	| { status: "failed"; reason: string };

/**
 * Build the two extensions of the subagent system: `subagents` (the tool and
 * its tasks) and `subagent-limits` (the turn budget hook). A child selects
 * everything except `subagents`, so it cannot spawn grandchildren.
 *
 * The tasks close over `host`, which is why they are built here rather than at
 * module scope: a task definition is per-daemon configuration.
 */
export function createSubagents(host: SubagentHost): { tools: Extension; limits: Extension } {
	type ReporterRuntime = TaskRuntime<ReporterInput, ReporterState, ReporterOutcome, object>;

	/** The anchor of one subagent: the task the child conversation hangs from. */
	const anchorTask = defineAnchorTask("subagent-anchor");

	/** Deliver one report on both surfaces: main conversation input, then the room. */
	const deliver = async (runtime: ReporterRuntime, context: Context, name: string, text: string): Promise<void> => {
		const body = reportBody(name, text);
		const main = await runtime.conversation(runtime.conversationId, context);
		// Same request id on a rerun: the durable submission, not a second report.
		await main?.submit(
			{ type: "input", content: body, whenBusy: "followUp", requestId: `subagent-report:${runtime.taskId}` },
			context,
		);
		try {
			await host.roomPost(body);
		} catch (error) {
			runtime.report(error);
		}
	};

	/** `git add -A` plus an identity-carrying commit inside the worktree; never fatal. */
	const commitWorktree = async (
		runtime: ReporterRuntime,
		context: Context,
		worktree: string,
		name: string,
		text: string,
	): Promise<void> => {
		if (worktree.length === 0) return;
		try {
			const env = await runtime.env(context);
			const staged = await host.git(["add", "-A"], worktree, env, context);
			if (!staged.ok) {
				host.log?.(`subagent ${name}: git add -A failed: ${staged.stderr.trim()}`);
				return;
			}
			const subject = text.split("\n")[0]?.slice(0, 72) ?? "finished";
			const committed = await host.git(
				["-c", "user.name=pi-host", "-c", "user.email=pi-host@localhost", "commit", "-m", `subagent ${name}: ${subject}`],
				worktree,
				env,
				context,
			);
			if (!committed.ok && !/nothing to commit|no changes added/i.test(committed.stderr)) {
				host.log?.(`subagent ${name}: commit failed: ${committed.stderr.trim()}`);
			}
		} catch (error) {
			host.log?.(`subagent ${name}: commit skipped: ${reasonOf(error)}`);
		}
	};

	/** The answer entry's text, as the room will see it. */
	const answerText = async (
		runtime: ReporterRuntime,
		context: Context,
		child: ConversationId,
		answerId: EntryId,
	): Promise<string> => {
		const view = await runtime.context(child, context);
		const index = view.entries.findIndex((record) => record.id === answerId);
		const exact = index >= 0 ? view.contributions[index] : undefined;
		const fallback = [...view.contributions].reverse().find((messages) => messages.some((m) => m.role === "assistant"));
		const text = (exact ?? fallback ?? [])
			.map((message) => textOf(message as ChatMessage))
			.join("")
			.trim();
		return text.length > 0 ? text : NO_ANSWER_TEXT;
	};

	/**
	 * The reporter: one task per message sent to a subagent, owned by the main
	 * conversation. It submits, waits for the answer across restarts, and
	 * delivers the report on both surfaces. Its request ids derive from its own
	 * task id, so a rerun after a crash re-attaches to the same submission
	 * instead of submitting twice, and a delivered report stays delivered.
	 */
	const reporterTask = defineTask<ReporterInput, ReporterState, ReporterOutcome, object>({
		name: "subagent-reporter",
		version: 1,
		initial: () => ({ phase: "report", attempt: 0 }),
		phases: {
			report: async (task, runtime, context) => {
				const { name, child: childId, worktree, message, followUp } = task.input;
				const attempt = task.state.checkpoint.attempt;
				const childHandle = await runtime.conversation(childId, context);
				if (childHandle === undefined) {
					await deliver(runtime, context, name, `failed: its conversation ${childId} is gone`);
					await runtime.commit(
						() => ({
							status: "terminal",
							outcome: { status: "failed", error: { message: `conversation ${childId} is gone` } },
						}),
						context,
					);
					return;
				}

				let settled;
				try {
					const submission = await childHandle.submit(
						{
							type: "input",
							content: message,
							whenBusy: followUp ? "followUp" : "steer",
							requestId: `subagent:${runtime.taskId}`,
						},
						context,
					);
					settled = await submission.wait(context);
				} catch (error) {
					// Interrupted (shutdown, restart, abort): bump the checkpoint so the run
					// resumes instead of faulting as "no durable progress".
					const aborted = runtime.signal.aborted || context.abortSignal?.aborted === true;
					await runtime
						.commit(() => ({ status: "running", checkpoint: { phase: "report", attempt: attempt + 1 } }), context)
						.catch(() => undefined);
					if (aborted) return;
					const reason = reasonOf(error);
					await deliver(runtime, context, name, `failed: ${reason}`);
					await runtime.commit(
						() => ({ status: "terminal", outcome: { status: "failed", error: { message: reason } } }),
						context,
					);
					return;
				}

				if (settled.status !== "done" || settled.answer === undefined) {
					// Stopped or withdrawn: nothing is delivered (the spec's `stopped`
					// case); `status` shows what the reporter settled as.
					await runtime.commit(
						() => ({ status: "terminal", outcome: { status: "aborted", reason: settled.status } }),
						context,
					);
					return;
				}

				const answerId = settled.answer;
				const recorded =
					(await runtime.snapshot(SubagentsDoc, runtime.conversationId, context))?.agents[name]?.reported ?? [];
				if (recorded.includes(answerId)) {
					// A previous invocation committed this report: never deliver twice.
					await runtime.commit(
						() => ({
							status: "terminal",
							outcome: { status: "completed", result: { status: "already_reported", answer: answerId } },
						}),
						context,
					);
					return;
				}

				const text = await answerText(runtime, context, childId, settled.answer);
				// The child finished its work: commit the worktree so the diff is reviewable.
				await commitWorktree(runtime, context, worktree, name, text);
				await deliver(runtime, context, name, text);

				// ONE commit decides the report: the answer id lands in `reported[]`.
				await runtime.commit(async (tx) => {
					const doc = await tx.doc(SubagentsDoc, runtime.conversationId);
					const agent = doc.agents[name] ?? { conversationId: childId, reported: [], worktree };
					if (!agent.reported.includes(answerId)) agent.reported = [...agent.reported, answerId];
					doc.agents[name] = agent;
					return {
						status: "terminal",
						outcome: { status: "completed", result: { status: "delivered", answer: answerId } },
					};
				}, context);
			},
		},
		abort: async (_task, runtime, context) => {
			// A reporter is cancelled by `/stop` or a restart: nothing was delivered.
			await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted", reason: "cancelled" } }), context);
		},
	});

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
