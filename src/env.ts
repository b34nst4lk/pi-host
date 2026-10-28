// The agent's execution environment: where its tools (read/write/edit/bash)
// actually run. v1 posture (decided, see docs/plan-and-lessons.md §2):
// NodeExecutionEnv scoped by cwd convention — no hard sandbox — allowlist-
// scoped (only MATRIX_ALLOWED_USERS can trigger tool calls). Hardening later:
// dedicated low-priv user for the daemon, or container-per-conversation.
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import type { EnvTarget } from "@earendil-works/pi-durable";

/** Resolve where a conversation's agent works: its agent cwd, else the sandbox. */
export function resolveAgentSandbox(target: Pick<EnvTarget, "cwd">, fallback: string): string {
	return target.cwd ?? fallback;
}

/** Build the execution env for one env target (HarnessOptions.env calls this per use). */
export function createAgentEnv(target: Pick<EnvTarget, "cwd">, sandbox: string): NodeExecutionEnv {
	return new NodeExecutionEnv({ cwd: resolveAgentSandbox(target, sandbox) });
}