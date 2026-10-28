// Agent environment tests: the sandbox resolution + NodeExecutionEnv factory
// that give the steering agent its hands (read/write/edit/bash in a workspace).
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { describe, expect, it } from "vitest";
import { createAgentEnv, resolveAgentSandbox } from "../src/env.ts";

describe("resolveAgentSandbox", () => {
	it("prefers the conversation's agent cwd when set", () => {
		expect(resolveAgentSandbox({ cwd: "/srv/project" }, "/fallback/ws")).toBe("/srv/project");
	});
	it("falls back to the configured sandbox when the agent has no cwd", () => {
		expect(resolveAgentSandbox({}, "/fallback/ws")).toBe("/fallback/ws");
	});
});

describe("createAgentEnv", () => {
	it("builds an env rooted at the resolved sandbox", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-host-env-"));
		const env = createAgentEnv({ cwd: dir }, "/fallback/ws");
		expect(env.cwd).toBe(dir);
		const withoutCwd = createAgentEnv({}, "/fallback/ws");
		expect(withoutCwd.cwd).toBe("/fallback/ws");
	});

	it("exec runs inside the sandbox (the hands actually work)", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-host-env-"));
		const env = createAgentEnv({ cwd: dir }, "/fallback/ws");
		const result = await env.exec("pwd", undefined, BACKGROUND_CONTEXT);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.exitCode).toBe(0);
	});
});