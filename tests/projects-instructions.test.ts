// A project's instructions, its listing, and the reply pump that keeps every
// bound conversation talking to its own room.

import type { TranscriptContext } from "@earendil-works/pi-ai";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import { defineDoc, type ConversationId } from "@earendil-works/pi-durable";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReplyPump } from "../src/core/steer.ts";
import { EMPTY_PROJECTS, describeProjects } from "../src/projects.ts";
import { type Setup, capture, context, promptText, setup, submit, waitUntil } from "./projects-fixtures.ts";






// --- living instructions ---------------------------------------------------

describe("living instructions", () => {
	it("re-reads AGENTS.md on every request, so an edit changes the next prompt", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "live");
		mkdirSync(dir, { recursive: true });
		const file = join(dir, "AGENTS.md");
		writeFileSync(file, "# Live\n\nFIRST VERSION marker\n", { flag: "w" });
		const outcome = await t.projects.bind("live", dir, "!proj:jacks.im", t.api);
		expect(outcome.ok).toBe(true);
		const child = (await t.harness.conversation((await t.api.projects()).projects.live!.conversation, context))!;

		const cap = capture(t.faux);
		t.faux.setResponses([cap.step("ack one"), cap.step("ack two")]);
		await submit(child, "first message");
		writeFileSync(file, "# Live\n\nSECOND VERSION marker\n", { flag: "w" });
		await submit(child, "second message");

		expect(cap.prompts).toHaveLength(2);
		expect(cap.prompts[0]).toContain("FIRST VERSION marker");
		expect(cap.prompts[1]).toContain("SECOND VERSION marker");
		expect(cap.prompts[1]).not.toContain("FIRST VERSION marker");
		expect(cap.prompts[0]).toContain('project "live"');
	});

	it("says so, in the prompt, when the instructions file is gone", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "gone");
		mkdirSync(dir, { recursive: true });
		await t.projects.bind("gone", dir, "!proj:jacks.im", t.api);
		const child = (await t.harness.conversation((await t.api.projects()).projects.gone!.conversation, context))!;
		const cap = capture(t.faux);
		t.faux.setResponses([cap.step("ok")]);
		await submit(child, "hello");
		expect(cap.prompts[0]).toContain("cannot be read");
		expect(cap.prompts[0]).toContain(join(dir, "AGENTS.md"));
	});

	it("renders nothing in a conversation that is not a project", async () => {
		const t: Setup = await setup();
		const cap = capture(t.faux);
		t.faux.setResponses([cap.step("ok")]);
		await submit(t.root, "hello");
		expect(cap.prompts[0]).not.toContain("You are the agent of the project");
	});
});

// --- listing ---------------------------------------------------------------

describe("list", () => {
	it("says how to start when there is nothing to show", () => {
		expect(describeProjects(EMPTY_PROJECTS)).toContain("no projects yet");
	});

	it("lists every project with its room, conversation and directory", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "app");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "AGENTS.md"), "# App\n", { flag: "w" });
		await t.projects.bind("app", dir, "!app:jacks.im", t.api);
		mkdirSync(join(t.sandbox, "docs"), { recursive: true });
		await t.projects.bind("docs", join(t.sandbox, "docs"), "!docs:jacks.im", t.api);
		const listed = await t.projects.list(t.api);
		const lines = listed.split("\n");
		expect(lines[0]).toContain("app — room !app:jacks.im");
		expect(lines[0]).toContain(dir);
		expect(lines[1]).toContain("App"); // the summary, read live
		expect(listed).toContain("docs — room !docs:jacks.im");
	});

	it("reads the summary live, not from the bind", async () => {
		const t: Setup = await setup();
		const dir = join(t.sandbox, "app");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "AGENTS.md"), "# Old title\n", { flag: "w" });
		await t.projects.bind("app", dir, "!app:jacks.im", t.api);
		writeFileSync(join(dir, "AGENTS.md"), "# New title\n", { flag: "w" });
		expect(await t.projects.list(t.api)).toContain("New title");
		expect((await t.api.projects()).projects.app!.summary).toBe("Old title");
	});
});

// --- one pump per conversation ---------------------------------------------

describe("reply pumps", () => {
	/** The daemon's wiring, verbatim: one pump + one cursor doc per conversation. */
	const Cursor = defineDoc<{ ids: Array<string | number> }>({
		kind: "app.steer-cursor",
		version: 1,
		scope: "conversation",
		history: "latest",
		fork: "initial",
		initial: () => ({ ids: [] }),
	});

	async function pumpFor(t: Setup, conversation: ConversationId, room: string, sent: Array<{ room: string; text: string }>) {
		const handle = (await t.harness.conversation(conversation, context))!;
		const pump = createReplyPump({
			sendText: async (text) => {
				sent.push({ room, text });
				return "$sent";
			},
			replyTarget: () => null,
			loadCursor: async () => new Set((await t.harness.snapshot(Cursor, conversation, context))?.ids ?? []),
			saveCursor: async (ids) => {
				await handle.commit(async (tx) => {
					(await tx.doc(Cursor, conversation)).ids = [...ids];
				}, context);
			},
		});
		const watch = await handle.watch(context);
		watch.start(async (value) => {
			await pump(value.entries);
		});
		return watch;
	}

	it("carries each conversation's answer to its own room", async () => {
		const t: Setup = await setup();
		mkdirSync(join(t.sandbox, "app"), { recursive: true });
		expect((await t.projects.bind("app", join(t.sandbox, "app"), "!app:jacks.im", t.api)).ok).toBe(true);
		const project = (await t.api.projects()).projects.app!.conversation;
		const sent: Array<{ room: string; text: string }> = [];
		const watches = [await pumpFor(t, t.root.id, "!main:jacks.im", sent), await pumpFor(t, project, "!app:jacks.im", sent)];

		// One scripted answer per request: both conversations ask, so two steps.
		const answer = (transcript: TranscriptContext) => {
			// Which agent is being asked, taken from the prompt it was given.
			const asked = promptText(transcript);
			return fauxAssistantMessage(asked.includes("agent of the project") ? "answer from app" : "answer from spike");
		};
		t.faux.setResponses([answer, answer]);
		await submit(t.root, "ask spike");
		await waitUntil(() => sent.some((s) => s.text.includes("answer from spike")));
		await submit((await t.harness.conversation(project, context))!, "ask app");
		await waitUntil(() => sent.some((s) => s.text.includes("answer from app")));

		expect(sent).toEqual([
			{ room: "!main:jacks.im", text: "answer from spike" },
			{ room: "!app:jacks.im", text: "answer from app" },
		]);
		// separate cursors: replaying one conversation never replays the other
		const mainCursor = await t.harness.snapshot(Cursor, t.root.id, context);
		const appCursor = await t.harness.snapshot(Cursor, project, context);
		expect(mainCursor?.ids.length).toBeGreaterThan(0);
		expect(appCursor?.ids.length).toBeGreaterThan(0);
		expect(mainCursor?.ids).not.toEqual(appCursor?.ids);
		for (const watch of watches) await watch.stop();
	});
});
