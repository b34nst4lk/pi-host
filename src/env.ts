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
//
// The one permission the env carries is push (`pushShellEnv`): a project whose
// registry flag is on gets `GH_CONFIG_DIR`, everything else inherits the plain
// process env and finds no credential.
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

/**
 * Permission to push, as the tool env sees it: a `gh` config dir whose credential
 * helper carries the host's token. `undefined` means "cannot push", and it is the
 * only value a conversation without the project's push flag ever gets — the token
 * stays central and never enters a project directory or the registry.
 *
 * KNOWN EXPOSURE (deliberate, v1): the grant is a DIRECTORY, and `gh` keeps the
 * token in `<configDir>/hosts.yml`. Mode `0600` does not help — tool execs run as
 * the same uid as the daemon, so a granted agent's `cat "$GH_CONFIG_DIR/hosts.yml"`
 * reads it, and the PAT is fine-grained over five repos, not one: a grant given to
 * one project reaches the other four too. The flag gates which CONVERSATION inherits
 * the credential, not what the credential can reach, and revoking the grant does not
 * un-leak a token that was already read — only rotating the PAT does. Containment
 * options, in order of cost: one fine-grained token per project; the daemon pushing
 * on the agent's behalf so no credential is ever handed out; or accept this for a
 * trusted agent on a scoped token (today's choice). `NodeExecutionEnv` is not a
 * sandbox, so nothing in this module can close it.
 */
export type GitPush = { readonly configDir: string };

/**
 * The shell env for one tool exec. Granted: `GH_CONFIG_DIR` names the host's authed
 * config dir and gh/git can authenticate. Not granted: `GH_CONFIG_DIR=""`, an
 * explicit empty value rather than an absent one — the SDK merges `process.env`
 * UNDER this object, so only an explicit value can revoke an inherited one, and
 * `gh` with an empty config dir reports "not logged in" (measured, not assumed).
 * Pure, so the permission seam is a fixture instead of a probe.
 */
export function pushShellEnv(gitPush: GitPush | undefined, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return { ...base, GH_CONFIG_DIR: gitPush?.configDir ?? "" };
}

/**
 * The permission rule, in one place: a project marker that grants push plus a
 * host config dir to point at. Anything else — no marker, `push: false`, a host
 * with no `GH_CONFIG_DIR` — yields `undefined`, i.e. no credential.
 */
export function gitPushFor(marker: { readonly push?: boolean } | undefined, configDir: string): GitPush | undefined {
	return marker?.push === true && configDir.length > 0 ? { configDir } : undefined;
}

/** Build the execution env for one env target (HarnessOptions.env calls this per use). */
export function createAgentEnv(
	target: Pick<EnvTarget, "cwd">,
	sandbox: string,
	options: { readonly defaultTimeoutMs?: number; readonly gitPush?: GitPush } = {},
): ExecutionEnv {
	return new TimeoutEnv({
		cwd: resolveAgentSandbox(target, sandbox),
		defaultTimeoutMs: options.defaultTimeoutMs ?? bashDefaultTimeoutMs(),
		shellEnv: pushShellEnv(options.gitPush),
	});
}
