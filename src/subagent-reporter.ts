// The reporter: one durable task per message sent to a subagent, owned by the
// main conversation. It submits into the child, waits for the answer across
// restarts, then delivers the report TWICE — as `input` in the main conversation
// (a follow-up) and as a threaded room post `[subagent <name>] <answer>` — and
// commits the answer entry id into `reported[]` in the same commit.
//
// Every request id derives from the reporter's own task id, so a rerun after a
// crash re-attaches to the same submission instead of submitting twice, and a
// committed report is never delivered again.
import type { Context } from "@earendil-works/chord";
import { defineTask, type ConversationId, type EntryId, type TaskRuntime } from "@earendil-works/pi-durable";
import type { GitRunner } from "./git.ts";
import { NO_ANSWER_TEXT, reasonOf, reportBody, textOf, type ChatMessage } from "./subagent-messages.ts";
import { SubagentsDoc } from "./subagent-state.ts";

export type ReporterInput = {
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

type ReporterRuntime = TaskRuntime<ReporterInput, ReporterState, ReporterOutcome, object>;

/** What the reporter needs from the daemon: git, the room, and a log line. */
export type ReporterHost = {
	/** Runs git; `envGit` in production. */
	readonly git: GitRunner;
	/**
	 * Posts to the room, threaded onto the newest inbound message, read at send time.
	 * `conversation` is the one that SPAWNED the subagent: a project's agent spawns
	 * from its own conversation, and its report belongs in the project's room.
	 */
	readonly roomPost: (text: string, conversation: ConversationId) => Promise<unknown>;
	/** One-line logger. */
	readonly log?: (message: string) => void;
};

/** The reporter task, under the durable kind `subagent-reporter`. */
export function defineReporterTask(host: ReporterHost) {
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
			await host.roomPost(body, runtime.conversationId);
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

	return defineTask<ReporterInput, ReporterState, ReporterOutcome, object>({
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
}
