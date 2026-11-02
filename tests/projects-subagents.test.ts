// A project agent is a SPAWNER (Q10 in docs/plan-and-lessons.md). Two things make
// that true, and each has a failure mode worth a test:
//
//  * the daemon stops stripping the subagent tool from project conversations
//    (`hideExtensions: []`), while a subagent stays a leaf: depth one, forever;
//  * a report travels with the conversation that spawned it, so a project's
//    subagent reports into that project's ROOM — not into the main room, where
//    nobody asked for it.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { TranscriptContext } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, it } from "vitest";
import { roomForConversation } from "../src/rooms.ts";
import { SubagentsDoc } from "../src/subagent-state.ts";
import { promptText, setup, waitUntil } from "./projects-fixtures.ts";

const context = BACKGROUND_CONTEXT;
const ROOM = "!app:jacks.im";

/** The system prompt says who is asking; that is how one faux script serves three agents. */
function isSubagent(prompt: string): boolean {
	return prompt.includes("You are the subagent");
}

function isProjectAgent(prompt: string): boolean {
	return prompt.includes('You are the agent of the project "app". Its working directory');
}

/**
 * One scripted answer per request, whatever order the three agents ask in. The
 * first request from `owner` spawns; later ones just report back.
 */
function spawner(owner: (prompt: string) => boolean, name: string, answer: string) {
	let asked = false;
	return (transcript: TranscriptContext) => {
		const prompt = promptText(transcript);
		if (isSubagent(prompt)) return fauxAssistantMessage(answer);
		if (!owner(prompt)) return fauxAssistantMessage("noted");
		if (asked) return fauxAssistantMessage("spawned");
		asked = true;
		return fauxAssistantMessage(fauxToolCall("subagent", { action: "spawn", name, task: "count the files" }), {
			stopReason: "toolUse",
		});
	};
}

describe("project agents spawn", () => {
	it("keeps the subagent tool in a project conversation, and the child stays a leaf", async () => {
		const t = await setup({ subagents: true });
		const bound = await t.projects.create("app", "", ROOM, t.api);
		expect(bound.ok).toBe(true);
		if (!bound.ok) return;

		const project = await t.harness.conversation(bound.conversation, context);
		const projectAgent = await project!.agent(context);
		expect(projectAgent.tools.map((tool) => tool.name)).toContain("subagent");

		// the child of a child is still forbidden: one level, never two
		t.faux.setResponses(Array.from({ length: 6 }, () => spawner(isProjectAgent, "probe", "four files")));
		await project!.submit({ type: "input", content: "spawn probe" }, context).then((s) => s.wait(context));
		await waitUntil(() => t.roomPosts.length === 1);

		const state = await t.api.projects();
		const entry = (await t.harness.snapshot(SubagentsDoc, bound.conversation, context))!;
		const child = await t.harness.conversation(entry.agents.probe!.conversationId, context);
		expect((await child!.agent(context)).tools.map((tool) => tool.name)).not.toContain("subagent");
		// and the child has no room of its own: nothing routes to a subagent
		expect(roomForConversation(state, entry.agents.probe!.conversationId)).toBeNull();
	});

	it("reports into the project's room when a project agent spawns", async () => {
		const t = await setup({ subagents: true });
		const bound = await t.projects.create("app", "", ROOM, t.api);
		expect(bound.ok).toBe(true);
		if (!bound.ok) return;

		t.faux.setResponses(Array.from({ length: 6 }, () => spawner(isProjectAgent, "probe", "four files")));
		const project = await t.harness.conversation(bound.conversation, context);
		await project!.submit({ type: "input", content: "spawn probe" }, context).then((s) => s.wait(context));
		await waitUntil(() => t.roomPosts.length === 1);

		expect(t.roomPosts[0]!.text).toBe("[subagent probe] four files");
		// the report carries the SPAWNER, and that is what the daemon resolves to a room
		expect(t.roomPosts[0]!.conversation).toBe(bound.conversation);
		expect(roomForConversation(await t.api.projects(), t.roomPosts[0]!.conversation)).toBe(ROOM);
	});

	it("leaves a main-agent report pointing at the main conversation, which has no project room", async () => {
		const t = await setup({ subagents: true });
		await t.projects.create("app", "", ROOM, t.api); // a project exists: it must not capture the report

		t.faux.setResponses(Array.from({ length: 6 }, () => spawner((prompt) => !isSubagent(prompt), "probe", "four files")));
		await t.root.submit({ type: "input", content: "spawn probe" }, context).then((s) => s.wait(context));
		await waitUntil(() => t.roomPosts.length === 1);

		expect(t.roomPosts[0]!.conversation).toBe(t.root.id);
		// null means "not a project": the daemon falls back to the configured room
		expect(roomForConversation(await t.api.projects(), t.root.id)).toBeNull();
	});
});
