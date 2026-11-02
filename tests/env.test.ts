// Agent environment tests: the sandbox resolution + NodeExecutionEnv factory
// that give the steering agent its hands (read/write/edit/bash in a workspace).
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_BASH_TIMEOUT_MS,
	bashDefaultTimeoutMs,
	createAgentEnv,
	gitPushFor,
	pushShellEnv,
	resolveAgentSandbox,
} from "../src/env.ts";
import { ghConfigDirFrom } from "../src/daemon-env.ts";

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
// --- the default exec timeout (the 30-minute-hang lesson) -------------------

describe("TimeoutEnv", () => {
	it("kills a command with no timeout of its own inside the default", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-host-env-"));
		const env = createAgentEnv({ cwd: dir }, "/fallback/ws", { defaultTimeoutMs: 300 });
		const started = Date.now();
		const result = await env.exec("sleep 5", undefined, BACKGROUND_CONTEXT);
		const elapsed = Date.now() - started;

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("timeout");
		expect(elapsed).toBeLessThan(3_000);
	});

	it("lets the model's own timeout win", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-host-env-"));
		const env = createAgentEnv({ cwd: dir }, "/fallback/ws", { defaultTimeoutMs: 300 });
		// 300 ms would kill this; the model's own 10 s must be the one that applies.
		// `options.timeout` is seconds; the env default is ms.
		const result = await env.exec("sleep 0.6", { timeout: 10 }, BACKGROUND_CONTEXT);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.exitCode).toBe(0);

		const short = await env.exec("sleep 5", { timeout: 0.2 }, BACKGROUND_CONTEXT);
		expect(short.ok).toBe(false);
		if (!short.ok) expect(short.error.code).toBe("timeout");
	});

	it("converts the millisecond default into the SDK's seconds", async () => {
		expect(bashDefaultTimeoutMs({})).toBe(DEFAULT_BASH_TIMEOUT_MS);
		expect(bashDefaultTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: "250" })).toBe(250);
		expect(bashDefaultTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: "0" })).toBe(0);
		expect(bashDefaultTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: "-5" })).toBe(0);
		expect(bashDefaultTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: "soon" })).toBe(DEFAULT_BASH_TIMEOUT_MS);
		expect(bashDefaultTimeoutMs({ BASH_DEFAULT_TIMEOUT_MS: "" })).toBe(DEFAULT_BASH_TIMEOUT_MS);
		expect(DEFAULT_BASH_TIMEOUT_MS).toBe(900_000);
	});

	it("takes the default from the environment, as the daemon wires it", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-host-env-"));
		const previous = process.env.BASH_DEFAULT_TIMEOUT_MS;
		process.env.BASH_DEFAULT_TIMEOUT_MS = "300";
		try {
			const env = createAgentEnv({ cwd: dir }, "/fallback/ws");
			const result = await env.exec("sleep 5", undefined, BACKGROUND_CONTEXT);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error.code).toBe("timeout");
		} finally {
			if (previous === undefined) delete process.env.BASH_DEFAULT_TIMEOUT_MS;
			else process.env.BASH_DEFAULT_TIMEOUT_MS = previous;
		}
	});

	it("leaves every other env method delegating to NodeExecutionEnv", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-host-env-"));
		const env = createAgentEnv({ cwd: dir }, "/fallback/ws");

		const written = await env.writeFile("note.txt", "hello\n", BACKGROUND_CONTEXT);
		expect(written.ok).toBe(true);
		const read = await env.readTextFile("note.txt", BACKGROUND_CONTEXT);
		expect(read.ok).toBe(true);
		if (read.ok) expect(read.value).toBe("hello\n");
		expect(await env.exists("note.txt", BACKGROUND_CONTEXT)).toMatchObject({ ok: true, value: true });
		const listed = await env.listDir(".", BACKGROUND_CONTEXT);
		expect(listed.ok).toBe(true);
		if (listed.ok) expect(listed.value.map((info) => info.name)).toContain("note.txt");
	});
});

// --- push permission (WS2): GH_CONFIG_DIR only where it was granted ---------

describe("pushShellEnv", () => {
	it("names the granted config dir, and never mutates the base", () => {
		const base = { PATH: "/usr/bin" };
		const env = pushShellEnv({ configDir: "/opt/pi-host/.gh" }, base);
		expect(env).toEqual({ PATH: "/usr/bin", GH_CONFIG_DIR: "/opt/pi-host/.gh" });
		expect(base).toEqual({ PATH: "/usr/bin" });
	});

	it("revokes an inherited GH_CONFIG_DIR with an explicit empty value when push was not granted", () => {
		// The SDK spreads process.env UNDER the env we pass, so an absent key would
		// inherit; `GH_CONFIG_DIR=""` makes gh report "not logged in" (measured).
		expect(pushShellEnv(undefined, { PATH: "/usr/bin", GH_CONFIG_DIR: "/opt/pi-host/.gh" })).toEqual({
			PATH: "/usr/bin",
			GH_CONFIG_DIR: "",
		});
	});
});

describe("ghConfigDirFrom", () => {
	it("reads PI_HOST_GH_CONFIG_DIR only, because tool execs inherit the daemon's env", () => {
		expect(ghConfigDirFrom({ PI_HOST_GH_CONFIG_DIR: "/opt/pi-host/.gh" })).toBe("/opt/pi-host/.gh");
		expect(ghConfigDirFrom({ GH_CONFIG_DIR: "/opt/pi-host/.gh" })).toBe("");
		expect(ghConfigDirFrom({})).toBe("");
	});
});

describe("createAgentEnv with push", () => {
	it("hands the tool exec the granted gh config dir", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-host-env-"));
		const env = createAgentEnv({ cwd: dir }, "/fallback/ws", { gitPush: { configDir: "/gh" } });
		const chunks: string[] = [];
		const result = await env.exec(
			"printenv GH_CONFIG_DIR",
			{ onOutput: (text) => chunks.push(text) },
			BACKGROUND_CONTEXT,
		);
		expect(result.ok).toBe(true);
		expect(chunks.join("").trim()).toBe("/gh");
	});

	it("does not leave the credential reachable for a conversation that was not granted push", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-host-env-"));
		// The daemon's own env may carry GH_CONFIG_DIR (whatever the host exports); a
		// tool exec that was not granted push must still find no config dir.
		const previous = process.env.GH_CONFIG_DIR;
		process.env.GH_CONFIG_DIR = "/opt/pi-host/.gh";
		try {
			const env = createAgentEnv({ cwd: dir }, "/fallback/ws");
			const chunks: string[] = [];
			await env.exec("printenv GH_CONFIG_DIR", { onOutput: (text) => chunks.push(text) }, BACKGROUND_CONTEXT);
			expect(chunks.join("").trim()).toBe("");
		} finally {
			if (previous === undefined) delete process.env.GH_CONFIG_DIR;
			else process.env.GH_CONFIG_DIR = previous;
		}
	});
});

describe("gitPushFor", () => {
	it("grants only a project marker that says push, and only when the host has a config dir", () => {
		expect(gitPushFor({ push: true }, "/opt/pi-host/.gh")).toEqual({ configDir: "/opt/pi-host/.gh" });
		expect(gitPushFor({ push: false }, "/opt/pi-host/.gh")).toBeUndefined();
		expect(gitPushFor(undefined, "/opt/pi-host/.gh")).toBeUndefined();
		// a host with no gh config dir cannot grant push whoever asks
		expect(gitPushFor({ push: true }, "")).toBeUndefined();
	});
});
