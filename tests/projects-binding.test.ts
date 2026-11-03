// Binding and creating projects: a project becomes a conversation with a cwd,
// and the main room stops steering it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ProjectOutcome } from "../src/projects.ts";
import { ProjectDoc } from "../src/project-registry.ts";
import { type Setup, bound, context, setup } from "./projects-fixtures.ts";






// --- bind / new ------------------------------------------------------------

describe("bind", () => {
	it("binds an existing directory in ONE commit and stores pointers, not instructions", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "existing");
		mkdirSync(dir, { recursive: true });
		const outcome = await t.projects.bind("app", dir, "!proj:jacks.im", t.api);
		expect(outcome).toMatchObject({ ok: true, created: false });
		// The bind is honest about a directory with no instructions yet: it does not
		// invent one, it says so.
		expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
		if (outcome.ok) expect(outcome.note).toContain("does not exist yet");

		const registry = await t.api.projects();
		const record = registry.projects.app!;
		expect(record.room).toBe("!proj:jacks.im");
		expect(record.cwd).toBe(dir);
		expect(record.instructions_path).toBe(join(dir, "AGENTS.md"));
		expect(record.summary).toBe("");
		// pointers only: the record must not carry the file's content
		expect(Object.keys(record).sort()).toEqual([
			"conversation",
			"created",
			"cwd",
			"instructions_path",
			"push",
			"room",
			"summary",
		]);

		const child = await t.harness.conversation(record.conversation, context);
		expect(child).toBeDefined();
		const agent = await child!.agent(context);
		expect(agent.cwd).toBe(dir);
		expect(agent.instructions).toContain("app");
		expect(agent.instructions).toContain(join(dir, "AGENTS.md"));
		// a project is a steer agent in its own repository: the subagent tool stays (WS4)
		expect(agent.model).toEqual({ provider: "faux", modelId: "faux-1" });
	});

	it("takes the summary from AGENTS.md when there is one", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "docs");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "AGENTS.md"), "# Docs project\n\nlong form\n", { flag: "w" });
		const outcome = (await t.projects.bind("docs", dir, "!proj:jacks.im", t.api)) as ProjectOutcome & { ok: true };
		expect(outcome.ok).toBe(true);
		expect((await t.api.projects()).projects.docs!.summary).toBe("Docs project");
	});

	it("refuses to bind a room that already steers a different project", async () => {
		const t: Setup = await setup();
		const first = join(t.sandbox, "one");
		const second = join(t.sandbox, "two");
		mkdirSync(first, { recursive: true });
		mkdirSync(second, { recursive: true });
		expect((await t.projects.bind("one", first, "!proj:jacks.im", t.api)).ok).toBe(true);
		const clash = await t.projects.bind("two", second, "!proj:jacks.im", t.api);
		expect(clash.ok).toBe(false);
		if (!clash.ok) expect(clash.error).toContain("already bound to project one");
		expect(Object.keys((await t.api.projects()).projects)).toEqual(["one"]);
	});

	it("refuses a directory that is not there, and a name that is not safe", async () => {
		const t: Setup = await setup();
		const missing = await t.projects.bind("app", join(t.sandbox, "nope"), "!p:jacks.im", t.api);
		expect(missing.ok).toBe(false);
		if (!missing.ok) expect(missing.error).toContain("no such directory");
		const unsafe = await t.projects.bind("Bad Name", t.sandbox, "!p:jacks.im", t.api);
		expect(unsafe.ok).toBe(false);
		expect((await t.api.projects()).projects).toEqual({});
	});
});

describe("rebind", () => {
	// `/project bind <existing-name> <path>` is an UPSERT: it moves the project
	// to a new directory (and the room the command is typed in), reconfigures the
	// existing child conversation, and keeps the conversation id + history. This
	// is the operation the HANDOFF called "rebind = same command from the right
	// room" but the code never implemented — it threw "unbinding is not implemented".
	it("updates cwd and room and re-reads the summary, keeping the conversation id", async () => {
		const t: Setup = await setup();
		const dir1 = join(t.sandbox, "first");
		const dir2 = join(t.sandbox, "second");
		mkdirSync(dir1, { recursive: true });
		mkdirSync(dir2, { recursive: true });
		writeFileSync(join(dir2, "AGENTS.md"), "# Second home\n", { flag: "w" });
		expect((await t.projects.bind("app", dir1, "!room1:jacks.im", t.api)).ok).toBe(true);
		const firstConv = (await t.api.projects()).projects.app!.conversation;

		const reb = (await t.projects.bind("app", dir2, "!room2:jacks.im", t.api)) as ProjectOutcome & { ok: true };
		expect(reb.ok).toBe(true);
		expect(reb.created).toBe(false);

		const record = (await t.api.projects()).projects.app!;
		expect(record.cwd).toBe(dir2);
		expect(record.room).toBe("!room2:jacks.im");
		expect(record.conversation).toBe(firstConv); // the conversation survives
		expect(record.summary).toBe("Second home"); // re-read from the new AGENTS.md

		// the child conversation's agent was reconfigured to the new cwd
		const child = await t.harness.conversation(record.conversation, context);
		const agent = await child!.agent(context);
		expect(agent.cwd).toBe(dir2);
		expect(agent.instructions).toContain(join(dir2, "AGENTS.md"));
	});

	it("refuses to rebind onto a room owned by a different project", async () => {
		const t: Setup = await setup();
		const d1 = join(t.sandbox, "one");
		const d2 = join(t.sandbox, "two");
		const d3 = join(t.sandbox, "three");
		mkdirSync(d1, { recursive: true });
		mkdirSync(d2, { recursive: true });
		mkdirSync(d3, { recursive: true });
		await t.projects.bind("one", d1, "!room1:jacks.im", t.api);
		await t.projects.bind("two", d2, "!room2:jacks.im", t.api);

		const clash = await t.projects.bind("one", d3, "!room2:jacks.im", t.api);
		expect(clash.ok).toBe(false);
		if (!clash.ok) expect(clash.error).toContain("already bound to project two");
		// nothing moved
		expect((await t.api.projects()).projects.one!.room).toBe("!room1:jacks.im");
		expect((await t.api.projects()).projects.one!.cwd).toBe(d1);
	});
});

describe("new", () => {
	it("scaffolds the default directory: mkdir, git init, starter AGENTS.md, then bind", async () => {
		const t: Setup = await setup();
		const outcome = await t.projects.create("app", "", "!proj:jacks.im", t.api);
		expect(outcome.ok).toBe(true);
		const dir = join(t.projectsDir, "app");
		expect(t.gitCalls.map((call) => call.slice(0, 2))).toEqual([[dir, "init"]]);
		const starter = readFileSync(join(dir, "AGENTS.md"), "utf8");
		expect(starter).toContain("# app");
		expect(starter).toContain("How to work here");
		const record = (await t.api.projects()).projects.app!;
		expect(record.cwd).toBe(dir);
		expect(record.summary).toBe("app");
		if (outcome.ok) expect(outcome.created).toBe(true);
	});

	it("honours a path argument and keeps an existing AGENTS.md", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "custom dir");
		mkdirSync(dir, { recursive: true });
		const first = await t.projects.create("app", dir, "!proj:jacks.im", t.api);
		expect(first.ok).toBe(true);
		expect(t.gitCalls[0]).toEqual([dir, "init"]);
		expect((await t.api.projects()).projects.app!.cwd).toBe(dir);
	});

	it("keeps the file it found instead of overwriting it", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "kept");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "AGENTS.md"), "# Mine\n", { flag: "w" });
		await t.projects.create("kept", dir, "!proj:jacks.im", t.api);
		expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("# Mine\n");
	});

	it("fails loudly and binds nothing when git is missing", async () => {
		const t: Setup = await setup({
			git: async () => ({ ok: false, stdout: "", stderr: "spawn git ENOENT", missing: true }),
		});
		const outcome = await t.projects.create("app", "", "!p:jacks.im", t.api);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.error).toContain("git is not available");
		expect((await t.api.projects()).projects).toEqual({});
	});

	it("refuses a second project with the same name", async () => {
		const t: Setup = await setup();
		expect((await t.projects.create("app", "", "!a:jacks.im", t.api)).ok).toBe(true);
		const again = await t.projects.create("app", "", "!b:jacks.im", t.api);
		expect(again.ok).toBe(false);
		if (!again.ok) expect(again.error).toContain("already exists");
		expect(Object.keys((await t.api.projects()).projects)).toEqual(["app"]);
	});
});


// --- push permission (WS2): off by default, granted by a command ------------

describe("push", () => {
	async function bindApp(t: Setup) {
		const dir = join(t.sandbox, "pushy");
		mkdirSync(dir, { recursive: true });
		await t.projects.bind("app", dir, "!pushy:jacks.im", t.api);
		const record = (await t.api.projects()).projects.app!;
		return { dir, conversation: record.conversation };
	}

	it("starts off, and one command flips the registry row and the marker together", async () => {
		const t: Setup = await setup();
		const { conversation } = await bindApp(t);
		expect((await t.api.projects()).projects.app!.push).toBe(false);
		expect((await t.harness.snapshot(ProjectDoc, conversation, context))!.push).toBe(false);

		expect(await t.projects.push("app", true, t.api)).toContain("push on");
		expect((await t.api.projects()).projects.app!.push).toBe(true);
		// the marker is what the env factory reads, so it must agree in the same commit
		expect((await t.harness.snapshot(ProjectDoc, conversation, context))!.push).toBe(true);
		expect(await t.projects.list(t.api)).toContain("— push");

		expect(await t.projects.push("app", false, t.api)).toContain("push off");
		expect((await t.api.projects()).projects.app!.push).toBe(false);
		expect((await t.harness.snapshot(ProjectDoc, conversation, context))!.push).toBe(false);
		expect(await t.projects.list(t.api)).not.toContain("— push");
	});

	it("keeps the permission across a rebind (the conversation, and so the grant, survives)", async () => {
		const t: Setup = await setup();
		await bindApp(t);
		await t.projects.push("app", true, t.api);
		const moved = join(t.sandbox, "moved");
		mkdirSync(moved, { recursive: true });
		expect((await t.projects.bind("app", moved, "!pushy:jacks.im", t.api)).ok).toBe(true);
		const record = (await t.api.projects()).projects.app!;
		expect(record.cwd).toBe(moved);
		expect(record.push).toBe(true);
	});

	it("grants the project agent the host's gh config dir, and nobody else", async () => {
		const t: Setup = await setup();
		const { dir, conversation } = await bindApp(t);
		const target = { conversationId: conversation, cwd: dir, read: t.harness };
		const chunks: string[] = [];
		const probe = async () => {
			chunks.length = 0;
			const env = await t.agentEnv(target, context);
			await env.exec("printenv GH_CONFIG_DIR", { onOutput: (text) => chunks.push(text) }, context);
			return chunks.join("").trim();
		};
		expect(await probe()).toBe("");
		await t.projects.push("app", true, t.api);
		expect(await probe()).toBe(t.ghConfigDir);
		// the main conversation carries no project marker, so the factory can only
		// grant it nothing (the rule itself is pinned in tests/env.test.ts)
		const mainEnv = await t.agentEnv({ conversationId: t.root.id, cwd: t.sandbox, read: t.harness }, context);
		expect(mainEnv.cwd).toBe(t.sandbox);
	});

	it("refuses a project that does not exist", async () => {
		const t: Setup = await setup();
		const line = await t.projects.push("nope", true, t.api);
		expect(line).toContain("no such project");
	});

	it("refuses to grant push on a host with no gh config dir, instead of granting nothing", async () => {
		const t: Setup = await setup({ canPush: false });
		await bindApp(t);
		const line = await t.projects.push("app", true, t.api);
		expect(line).toContain("no gh config dir");
		expect((await t.api.projects()).projects.app!.push).toBe(false);
	});
});
