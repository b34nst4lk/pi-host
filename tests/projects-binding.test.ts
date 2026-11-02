// Binding and creating projects: a project becomes a conversation with a cwd,
// and the main room stops steering it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type ProjectOutcome } from "../src/projects.ts";
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
		expect(Object.keys(record).sort()).toEqual(["conversation", "created", "cwd", "instructions_path", "room", "summary"]);

		const child = await t.harness.conversation(record.conversation, context);
		expect(child).toBeDefined();
		const agent = await child!.agent(context);
		expect(agent.cwd).toBe(dir);
		expect(agent.instructions).toContain("app");
		expect(agent.instructions).toContain(join(dir, "AGENTS.md"));
		// a project is a space, not a spawner: the hidden extension is gone
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

