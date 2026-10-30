// The agent's execution environment: where its tools (read/write/edit/bash)
// actually run. v1 posture (decided, see docs/plan-and-lessons.md §2):
// NodeExecutionEnv scoped by cwd convention — no hard sandbox — allowlist-
// scoped (only MATRIX_ALLOWED_USERS can trigger tool calls). Hardening later:
// dedicated low-priv user for the daemon, or container-per-conversation.
//
// One deliberate addition: a default exec timeout. A single tool call with no
// timeout of its own once hung for 30 minutes and took the whole conversation with
// it — the model did ask for a timeout, but the harness only passes one when the
// model asked, and the model often does not. So every command gets a default, and
// an explicit `options.timeout` always wins.
import { type Context } from "@earendil-works/chord";
import type { EnvTarget } from "@earendil-works/pi-durable";
import {
	type ExecutionEnv,
	type ExecutionError,
	type Result,
	type ShellExecOptions,
	type ShellExecResult,
} from "@earendil-works/pi-durable/env";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";

/** 15 minutes: longer than any legitimate build, shorter than a lost afternoon. */
export const DEFAULT_BASH_TIMEOUT_MS = 900_000;

export type TimeoutEnvOptions = {
	readonly cwd: string;
	/**
	 * Kill a command that runs longer than this, in milliseconds (the env var's
	 * unit). The SDK's `ShellExecOptions.timeout` is in SECONDS, so the conversion
	 * happens at the one boundary in `exec` — passing a "15 minute" default through
	 * unchanged would make it 15 seconds.
	 *
	 * `0` disables the default entirely.
	 */
	readonly defaultTimeoutMs?: number;
	readonly shellPath?: string;
	readonly shellEnv?: NodeJS.ProcessEnv;
};

/**
 * `NodeExecutionEnv` that supplies a default exec timeout. Everything else is
 * inherited untouched — the filesystem tools have their own semantics and no
 * business being wrapped.
 */
export class TimeoutEnv extends NodeExecutionEnv {
	private readonly defaultTimeoutMs: number;

	constructor(options: TimeoutEnvOptions) {
		super({ cwd: options.cwd, shellPath: options.shellPath, shellEnv: options.shellEnv });
		this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;
	}

	override exec(
		command: string | readonly string[],
		options: ShellExecOptions | undefined,
		context: Context,
	): Promise<Result<ShellExecResult, ExecutionError>> {
		// The model's own timeout is never overridden, and `0`/absent default means
		// the operator asked for unbounded commands.
		if (this.defaultTimeoutMs <= 0 || options?.timeout !== undefined) {
			return super.exec(command, options, context);
		}
		return super.exec(command, { ...options, timeout: this.defaultTimeoutMs / 1000 }, context);
	}
}

/** `BASH_DEFAULT_TIMEOUT_MS`, read once per env; junk keeps the conservative default. */
export function bashDefaultTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
	const raw = env.BASH_DEFAULT_TIMEOUT_MS;
	if (raw === undefined || raw.trim().length === 0) return DEFAULT_BASH_TIMEOUT_MS;
	const value = Number(raw);
	if (!Number.isFinite(value)) return DEFAULT_BASH_TIMEOUT_MS;
	return Math.max(0, Math.trunc(value));
}

/** Resolve where a conversation's agent works: its agent cwd, else the sandbox. */
export function resolveAgentSandbox(target: Pick<EnvTarget, "cwd">, fallback: string): string {
	return target.cwd ?? fallback;
}

/** Build the execution env for one env target (HarnessOptions.env calls this per use). */
export function createAgentEnv(
	target: Pick<EnvTarget, "cwd">,
	sandbox: string,
	options: { readonly defaultTimeoutMs?: number } = {},
): ExecutionEnv {
	return new TimeoutEnv({
		cwd: resolveAgentSandbox(target, sandbox),
		defaultTimeoutMs: options.defaultTimeoutMs ?? bashDefaultTimeoutMs(),
	});
}
