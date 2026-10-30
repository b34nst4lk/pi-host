// git, through the harness's execution environment.
//
// A subagent works in a real git worktree, so the daemon needs to run git in the
// same environment the child runs in — and it needs to tell "git is not installed
// in this image" (a cutover problem, said loudly) apart from "git said no" (an
// ordinary failure). The runner is injectable so every test runs without git.
import type { Context } from "@earendil-works/chord";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";

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
export const GIT_MISSING =
	"git not available in runtime — cutover image pending: nothing was spawned (no worktree, no conversation). " +
	"The subagent system needs the git-equipped image to cut over.";
