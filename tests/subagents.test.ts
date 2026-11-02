// Subagent system tests. RED first: written against the spec in
// docs/plan-and-lessons.md, then implemented in src/subagents.ts.
//
// What they pin down (each one is a failure mode we would otherwise ship):
// - names must be worktree-safe and branch-safe;
// - a spawn is ONE commit: anchor task + child conversation + configured agent;
//   a missing `git` binary fails LOUDLY before anything durable is created;
// - a report reaches BOTH surfaces exactly once — the main conversation as an
//   input and the room as a threaded post — and a restart never re-delivers;
// - `stop` aborts the child's live work without touching the main conversation;
// - the child's turn budget is recorded durably and enforced at request time.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import type { TranscriptContext } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, Harness, type ConversationId } from "@earendil-works/pi-durable";
import { MemoryStorage } from "@earendil-works/pi-durable/storage/memory";
import { describe, expect, it } from "vitest";
import type { GitRun, GitRunner } from "../src/git.ts";
import {
	applyTurnLimit,
	parseSubagentName,
	reportBody,
	subagentBranch,
	subagentInstructions,
} from "../src/subagent-messages.ts";
import { SubagentLimitsDoc, SubagentsDoc } from "../src/subagent-state.ts";
import { createSubagents } from "../src/subagents.ts";

const context = BACKGROUND_CONTEXT;

// --- helpers ---------------------------------------------------------------

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(options?: { storage?: MemoryStorage; git?: GitRunner; tokensPerSecond?: number }) {
	const faux = fauxProvider({ tokensPerSecond: options?.tokensPerSecond });
	const models = createModels();
	models.setProvider(faux.provider);
	const roomPosts: string[] = [];
	// The conversation that SPAWNED each subagent: the daemon turns it into a room.
	const posters: Array<ConversationId> = [];
	const gitCalls: string[][] = [];
	const git: GitRunner =
		options?.git ??
		(async (args) => {
			gitCalls.push([...args]);
			if (args[0] === "rev-parse") return { ok: true, stdout: "/repo\n", stderr: "" } satisfies GitRun;
			if (args[0] === "add") return { ok: true, stdout: "", stderr: "" } satisfies GitRun;
			return { ok: true, stdout: "", stderr: "" } satisfies GitRun;
		});
	const subagents = createSubagents({
		provider: "faux",
		model: "faux-1",
		maxTurns: 3,
		git,
		roomPost: async (text, conversation) => {
			roomPosts.push(text);
			posters.push(conversation);
		},
	});
	const storage = options?.storage ?? new MemoryStorage();
	const harness = await Harness.open(
		storage,
		{
			models,
			registry: registryFor(subagents),
			settings: { followUpMode: "all", steeringMode: "all" },
		},
		context,
	);
	const root = await harness.root(context, {
		agent: { model: { provider: "faux", modelId: "faux-1" }, extensions: [subagents.tools, subagents.limits] },
	});
	harness.resume();
	return { faux, harness, root, storage, roomPosts, posters, gitCalls, subagents };
}

function registryFor(subagents: ReturnType<typeof createSubagents>) {
	const registry = createRegistry();
	registry.install(subagents.tools);
	registry.install(subagents.limits);
	return registry;
}

/** All text in a conversation's model context, flattened oldest-first. */
async function transcriptText(harness: Harness, id: Parameters<Harness["conversation"]>[0]): Promise<string> {
	const view = await (await harness.conversation(id, context))!.context(context);
	return view.messages
		.map((message) =>
			typeof message.content === "string"
				? message.content
				: message.content.map((block) => (block.type === "text" ? block.text : "")).join(""),
		)
		.join("\n");
}

async function waitUntil(check: () => boolean | Promise<boolean>, ms = 4000): Promise<void> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`waitUntil timed out after ${ms}ms`);
}

/** Whether a request comes from a child: its system prompt carries the spawn instructions. */
function promptText(transcript: TranscriptContext): string {
	return transcript.messages
		.filter((message) => message.role === "system")
		.map((message) => {
			const typed = message as { content?: unknown; sections?: Record<string, string> };
			const content = typeof typed.content === "string" ? typed.content : "";
			return [content, ...Object.values(typed.sections ?? {})].join("\n");
		})
		.join("\n");
}

function isChild(transcript: TranscriptContext): boolean {
	return promptText(transcript).includes("You are the subagent");
}

/** A step that answers the child and the main agent differently, whatever order they ask in. */
const routed = (childText: string, mainText: string) => (transcript: TranscriptContext) =>
	fauxAssistantMessage(isChild(transcript) ? childText : mainText);


// --- pure helpers ----------------------------------------------------------

describe("subagent names", () => {
	it("accepts worktree-safe names and rejects everything else", () => {
		expect(parseSubagentName("research-1")).toBe("research-1");
		expect(parseSubagentName("a")).toBe("a");
		expect(parseSubagentName("")).toBeNull();
		expect(parseSubagentName("Bad Name")).toBeNull();
		expect(parseSubagentName("../etc")).toBeNull();
		expect(parseSubagentName("a/b")).toBeNull();
		expect(parseSubagentName("-leading")).toBeNull();
		expect(parseSubagentName("x".repeat(41))).toBeNull();
	});

	it("names the branch and the room post from the subagent name", () => {
		expect(subagentBranch("research")).toBe("worktree-research");
		expect(reportBody("research", "done")).toBe("[subagent research] done");
	});

	it("tells the child its name, branch, worktree and turn budget", () => {
		const text = subagentInstructions({ name: "research", maxTurns: 7, worktree: "/repo/worktrees/research" });
		expect(text).toContain("research");
		expect(text).toContain("worktree-research");
		expect(text).toContain("/repo/worktrees/research");
		expect(text).toContain("7");
	});
});

describe("turn limit", () => {
	const user = { role: "user" as const, timestamp: 0, content: [{ type: "text" as const, text: "go" }] } as never;
	const assistant = { role: "assistant" as const, timestamp: 0, content: [{ type: "text" as const, text: "working" }] } as never;

	it("leaves the context alone below the limit", () => {
		const messages = [user, assistant];
		expect(applyTurnLimit(messages, 3)).toBe(messages);
	});

	it("injects one wrap-up instruction at the limit and never twice", () => {
		const messages = [user, assistant, assistant, assistant];
		const limited = applyTurnLimit(messages, 3);
		expect(limited.length).toBe(messages.length + 1);
		const last = limited[limited.length - 1] as { role: string; content: Array<{ text?: string }> };
		expect(last.role).toBe("user");
		expect(last.content.map((block) => block.text).join("")).toMatch(/turn limit/i);
		expect(applyTurnLimit(limited, 3)).toBe(limited);
	});

	it("does nothing at a zero or negative limit", () => {
		const messages = [user, assistant, assistant];
		expect(applyTurnLimit(messages, 0)).toBe(messages);
	});
});

// --- spawn -----------------------------------------------------------------

describe("spawn", () => {
	it("creates anchor, child and configured agent in one commit, with a worktree", async () => {
		const t: Setup = await setup();
		t.faux.setResponses([
			fauxAssistantMessage(fauxToolCall("subagent", { action: "spawn", name: "research", task: "read the ledger code" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("spawned"),
		]);
		await t.root.submit({ type: "input", content: "spawn research" }, context).then((s) => s.wait(context));
		await waitUntil(async () => Object.keys((await t.harness.snapshot(SubagentsDoc, t.root.id, context))?.agents ?? {}).length === 1);

		const doc = await t.harness.snapshot(SubagentsDoc, t.root.id, context);
		const entry = doc!.agents.research!;
		expect(entry.conversationId).toBeTruthy();
		expect(entry.reported).toEqual([]);
		expect(doc!.reporters.research).toBeTruthy();

		// the worktree: rev-parse for the repo root, then `worktree add` on its own branch
		expect(t.gitCalls[0]).toEqual(["rev-parse", "--show-toplevel"]);
		expect(t.gitCalls[1]).toEqual(["worktree", "add", "/repo/worktrees/research", "-b", "worktree-research"]);

		const child = (await t.harness.conversation(entry.conversationId, context))!;
		const agent = await child.agent(context);
		expect(agent.model).toEqual({ provider: "faux", modelId: "faux-1" });
		expect(agent.cwd).toBe("/repo/worktrees/research");
		expect(agent.instructions).toContain("research");
		// the child must not be able to spawn grandchildren
		expect(agent.tools.map((tool) => tool.name)).not.toContain("subagent");

		const limits = await t.harness.snapshot(SubagentLimitsDoc, entry.conversationId, context);
		expect(limits?.maxTurns).toBe(3);
		expect(limits?.name).toBe("research");
	});

	it("fails loudly and creates nothing when git is not available", async () => {
		const t: Setup = await setup({
			git: async () => ({ ok: false, stdout: "", stderr: "spawn git ENOENT", missing: true }),
		});
		t.faux.setResponses([
			fauxAssistantMessage(fauxToolCall("subagent", { action: "spawn", name: "research", task: "go" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("could not spawn"),
		]);
		await t.root.submit({ type: "input", content: "spawn research" }, context).then((s) => s.wait(context));

		const doc = await t.harness.snapshot(SubagentsDoc, t.root.id, context);
		expect(doc?.agents ?? {}).toEqual({});
		const text = await transcriptText(t.harness, t.root.id);
		expect(text).toMatch(/git not available in runtime/);
		expect(text).toMatch(/cutover image pending/);
	});

	it("rejects a second subagent with the same name", async () => {
		const t: Setup = await setup();
		t.faux.setResponses([
			fauxAssistantMessage(fauxToolCall("subagent", { action: "spawn", name: "research", task: "one" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("spawned"),
		]);
		await t.root.submit({ type: "input", content: "spawn" }, context).then((s) => s.wait(context));
		await waitUntil(async () => Object.keys((await t.harness.snapshot(SubagentsDoc, t.root.id, context))?.agents ?? {}).length === 1);

		t.faux.appendResponses([
			fauxAssistantMessage(fauxToolCall("subagent", { action: "spawn", name: "research", task: "two" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("refused"),
		]);
		await t.root.submit({ type: "input", content: "spawn again" }, context).then((s) => s.wait(context));
		const text = await transcriptText(t.harness, t.root.id);
		expect(text).toMatch(/already exists/);
	});
});

// --- reports ---------------------------------------------------------------

/** Memory storage that outlives a harness close, so one line can be reopened in-process. */
class ReopenableStorage extends MemoryStorage {
	override async close(): Promise<void> {}
}

describe("reports", () => {
	it("delivers the answer to the main conversation and the room, threaded on the newest inbound", async () => {
		const t: Setup = await setup();
		t.faux.setResponses([
			fauxAssistantMessage(fauxToolCall("subagent", { action: "spawn", name: "research", task: "count the files" }), { stopReason: "toolUse" }),
			routed("There are four files.", "spawned"),
			routed("There are four files.", "noted"),
			routed("There are four files.", "noted"),
			routed("There are four files.", "noted"),
		]);
		await t.root.submit({ type: "input", content: "spawn research" }, context).then((s) => s.wait(context));

		await waitUntil(() => t.roomPosts.length === 1);
		expect(t.roomPosts[0]).toBe("[subagent research] There are four files.");
		// the spawner travels with the report: the daemon picks the room from it
		expect(t.posters).toEqual([t.root.id]);

		// the same answer arrives as ordinary input in the main conversation
		await waitUntil(async () => (await transcriptText(t.harness, t.root.id)).includes("[subagent research] There are four files."));

		const doc = await t.harness.snapshot(SubagentsDoc, t.root.id, context);
		expect(doc!.agents.research!.reported.length).toBe(1);
	});

	it("never re-delivers a committed report across a restart", async () => {
		const storage = new ReopenableStorage();
		const t: Setup = await setup({ storage });
		t.faux.setResponses([
			fauxAssistantMessage(fauxToolCall("subagent", { action: "spawn", name: "research", task: "count the files" }), { stopReason: "toolUse" }),
			routed("There are four files.", "spawned"),
			routed("There are four files.", "noted"),
			routed("There are four files.", "noted"),
			routed("There are four files.", "noted"),
		]);
		await t.root.submit({ type: "input", content: "spawn research" }, context).then((s) => s.wait(context));
		await waitUntil(() => t.roomPosts.length === 1);

		await t.harness.close(context);

		// same storage, fresh harness: the report is durable, the delivery is not repeated
		const again = await setup({ storage });
		again.faux.appendResponses([fauxAssistantMessage("noted")]);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(again.roomPosts).toEqual([]);
		const doc = await again.harness.snapshot(SubagentsDoc, again.root.id, context);
		expect(doc!.agents.research!.reported.length).toBe(1);
		const text = await transcriptText(again.harness, again.root.id);
		expect(text.match(/\[subagent research\] There are four files\./g)?.length).toBe(1);
		await again.harness.close(context);
	});
});

// --- stop / status ---------------------------------------------------------

describe("stop and status", () => {
	it("aborts the child's live work and reports it in status", async () => {
		// a slow stream: the child is still answering when the stop arrives
		const t: Setup = await setup({ tokensPerSecond: 200 });
		t.faux.setResponses([
			fauxAssistantMessage(fauxToolCall("subagent", { action: "spawn", name: "research", task: "long job" }), { stopReason: "toolUse" }),
			routed(`${"working on it. ".repeat(200)}done`, "spawned"),
			routed("never", "noted"),
		]);
		await t.root.submit({ type: "input", content: "spawn research" }, context).then((s) => s.wait(context));
		await waitUntil(async () => Object.keys((await t.harness.snapshot(SubagentsDoc, t.root.id, context))?.agents ?? {}).length === 1);

		t.faux.appendResponses([fauxAssistantMessage(fauxToolCall("subagent", { action: "stop", name: "research" }), { stopReason: "toolUse" }), fauxAssistantMessage("stopped")]);
		await t.root.submit({ type: "input", content: "stop it" }, context).then((s) => s.wait(context));
		const text = await transcriptText(t.harness, t.root.id);
		expect(text).toMatch(/stopped subagent research/);

		t.faux.appendResponses([fauxAssistantMessage(fauxToolCall("subagent", { action: "status" }), { stopReason: "toolUse" }), fauxAssistantMessage("listed")]);
		await t.root.submit({ type: "input", content: "status" }, context).then((s) => s.wait(context));
		const listed = await transcriptText(t.harness, t.root.id);
		expect(listed).toMatch(/research/);
	});
});
