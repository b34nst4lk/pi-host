// The agent-state enum, and the report that gathers the facts it decides on.
//
// Two layers of proof. The table below pins the precedence on hand-built facts
// (no database at all), and the fixture after it proves the reader gathers the
// right facts from the real schema: conversations → anchors, tasks by kind,
// replayed `pi.inbox` / `pi.live`, and reporter tasks still in flight.

import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { type TaskFact, agentState, busyTasks, inboxItemCount, liveBusy, plainKind, reporterChild, stateLabel } from "../src/wall/agents.ts";
import { createLedger } from "../src/wall/ledger.ts";
import { agentsFixture, anchor, cleanupScratch, facts, json, projectsFixture, reader, runTask, serve, tempDir, wall, writeDocument } from "./wall-fixtures.ts";

/** Every scratch directory is removed after each test, pass or fail. */
afterEach(cleanupScratch);

describe("agent state enum", () => {
	it("prefers working over queued when a child is busy AND has inbox items", () => {
		expect(agentState(facts({ tasks: [runTask("running")], inbox_items: 3 }))).toBe("working");
		expect(agentState(facts({ tasks: [runTask("waiting")], inbox_items: 3 }))).toBe("working");
		expect(agentState(facts({ tasks: [runTask("running", '"pi.tool"')], inbox_items: 1 }))).toBe("working");
		expect(agentState(facts({ tasks: [runTask("running", "pi.compaction")] }))).toBe("working");
	});

	it("says queued when only the inbox has work", () => {
		expect(agentState(facts({ inbox_items: 2 }))).toBe("queued");
		expect(agentState(facts({ tasks: [runTask("terminal")], inbox_items: 2 }))).toBe("queued");
	});

	it("says reporting when the child is idle but its reporter is still running", () => {
		expect(agentState(facts({ reporter_pending: true }))).toBe("reporting");
		// ...unless the child itself is busy, which wins.
		expect(agentState(facts({ reporter_pending: true, tasks: [runTask("running")] }))).toBe("working");
	});

	it("says alive for a held anchor the registry names", () => {
		expect(agentState(facts({ anchor: anchor("running") }))).toBe("alive");
		expect(agentState(facts({ anchor: anchor("waiting") }))).toBe("alive");
	});

	it("says orphaned for a held anchor nothing names", () => {
		expect(agentState(facts({ anchor: anchor("running"), named: false }))).toBe("orphaned");
		// A busy orphan is still working: precedence is about the work, not the name.
		expect(agentState(facts({ anchor: anchor("running"), named: false, tasks: [runTask("running")] }))).toBe("working");
	});

	it("says retired for a terminal anchor", () => {
		expect(agentState(facts({ anchor: anchor("terminal") }))).toBe("retired");
		expect(agentState(facts({ anchor: anchor("terminal"), named: false }))).toBe("retired");
	});

	it("says unknown when it cannot read the ledger", () => {
		expect(agentState(facts({ readable: false, tasks: [runTask("running")] }))).toBe("unknown");
		expect(agentState(facts({ anchor: null, named: false }))).toBe("unknown");
	});

	it("trusts pi.live when there is no task row yet", () => {
		expect(agentState(facts({ live_busy: true }))).toBe("working");
		expect(agentState(facts({ live_busy: false }))).toBe("alive");
	});

	it("ignores anchor and reporter tasks when counting run work", () => {
		const tasks = [
			{ id: 1, kind: "subagent-anchor", status: "running", conversation: 1 },
			{ id: 2, kind: '"subagent-reporter"', status: "running", conversation: 1 },
		] as TaskFact[];
		expect(busyTasks(tasks)).toHaveLength(0);
		expect(agentState(facts({ tasks }))).toBe("alive");
	});

	it("reads the reporter's child from either record spelling", () => {
		expect(reporterChild({ input: { child: 2166 } })).toBe(2166);
		expect(reporterChild({ input: { conversationId: 2402 } })).toBe(2402);
		expect(reporterChild({ input: {} })).toBeNull();
		expect(reporterChild(null)).toBeNull();
	});

	it("counts inbox items and live runs defensively", () => {
		expect(inboxItemCount({ items: [{ id: 1 }, { id: 2 }] })).toBe(2);
		expect(inboxItemCount({ items: [] })).toBe(0);
		expect(inboxItemCount({})).toBeNull();
		expect(inboxItemCount(null)).toBeNull();
		expect(liveBusy({ run: { taskId: 1 } })).toBe(true);
		expect(liveBusy({ generation: { attempt: 1 } })).toBe(true);
		expect(liveBusy({})).toBe(false);
		expect(liveBusy(null)).toBeNull();
	});

	it("renders the orphan state as a prunable, unnamed agent", () => {
		expect(stateLabel("orphaned")).toBe("unnamed (prunable)");
		expect(stateLabel("working")).toBe("working");
	});

	it("unquotes ledger task kinds", () => {
		expect(plainKind('"pi.generation"')).toBe("pi.generation");
		expect(plainKind("pi.generation")).toBe("pi.generation");
		expect(plainKind("not json\"")).toBe('not json"');
		expect(plainKind(null)).toBe("");
	});
});

/** A ledger with four children in four states, one orphan and one retired anchor. */

describe("agents report", () => {
	it("derives every state from the ledger, in precedence order", () => {
		const { dbPath, logPath } = agentsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;

		expect(agents.ok).toBe(true);
		expect(agents.spike).toEqual({ kind: "main", state: "working", conversation: 1 });
		// One list, three kinds: the PROJECTS view is this list filtered.
		expect(agents.named.every((card) => card.kind === "subagent")).toBe(true);
		expect(agents.named.every((card) => card.room === null && card.cwd === null)).toBe(true);
		const byName = Object.fromEntries(agents.named.map((card) => [card.name, card]));
		expect(byName.reader).toMatchObject({ state: "working", conversation: 2166, anchor: 2165, last_reply: 2393 });
		expect(byName["wall-ui"]).toMatchObject({ state: "reporting", conversation: 2402, anchor: 2401 });
		expect(byName.probe).toMatchObject({ state: "queued", conversation: 2775, anchor: 2774, last_reply: 2782 });
		expect(agents.named.map((card) => card.name)).toEqual(["probe", "reader", "wall-ui"]);
	});

	it("keeps held-but-unnamed anchors visible and terminal ones out of the cards", () => {
		const { dbPath, logPath } = agentsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;

		expect(agents.orphans).toEqual([{ anchor: 2899, conversation: 2900 }]);
		expect(agents.retired).toBe(1);
		expect(agents.named.some((card) => card.anchor === 2999)).toBe(false);
	});

	it("counts work in the main conversation: in flight and queued", () => {
		const { dbPath, logPath } = agentsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;
		// One live pi.generation in the main conversation: anchors and the reporter
		// are not work. Queued counts the replayed inbox, and it does not change
		// the spike state — working still wins.
		expect(agents.work).toEqual({ in_flight: 1, queued: 2 });
		expect(agents.spike.state).toBe("working");
	});

	it("falls back to the anchor's name when conversations is unreadable", () => {
		const { dbPath, logPath } = agentsFixture();
		const db = new DatabaseSync(dbPath);
		db.exec("DROP TABLE conversations");
		db.close();

		const agents = createLedger({ dbPath, logPath }).state().agents;
		expect(agents.ok).toBe(true);
		const byName = Object.fromEntries(agents.named.map((card) => [card.name, card]));
		// Anchors are matched by `input.name`, so the cards survive the loss.
		expect(byName.reader).toMatchObject({ state: "working", anchor: 2165 });
		expect(agents.orphans.map((orphan) => orphan.anchor)).toContain(2899);
	});

	it("reports states as unknown rather than alive when the ledger is gone", () => {
		const dir = tempDir();
		const ledger = createLedger({ dbPath: path.join(dir, "missing.sqlite"), logPath: path.join(dir, "daemon.log") });
		const agents = ledger.state().agents;
		expect(agents.ok).toBe(false);
		expect(agents.error).toBeTruthy();
		expect(agents.spike.state).toBe("unknown");
		expect(agents.work).toEqual({ in_flight: null, queued: null });
		expect(agents.retired).toBeNull();
	});

	it("gives a project a card of its own kind, with its room, cwd and entry count", () => {
		const { dbPath, logPath } = projectsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;
		const projects = agents.named.filter((card) => card.kind === "project");
		expect(projects.map((card) => card.name)).toEqual(["app", "docs"]);

		const app = projects.find((card) => card.name === "app")!;
		expect(app.state).toBe("working");
		expect(app.room).toBe("!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU");
		expect(app.cwd).toBe("/work/projects/app");
		expect(app.summary).toBe("the wall");
		expect(app.conversation).toBe(3100);
		expect(app.anchor).toBe(3099);
		expect(app.entries).toBe(2);
		// a project is not a worktree agent: no branch, no worktree, no reply entry
		expect(app.branch).toBe("");
		expect(app.worktree).toBeNull();
		expect(app.last_reply).toBeNull();
	});

	it("retires a project whose anchor reached terminal, and never calls its anchor an orphan", () => {
		const { dbPath, logPath } = projectsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;
		const docs = agents.named.find((card) => card.name === "docs")!;
		expect(docs.state).toBe("retired");
		expect(agents.orphans.map((orphan) => orphan.anchor)).not.toContain(3199);
		// the subagents are untouched by the second registry
		expect(agents.named.filter((card) => card.kind === "subagent").map((card) => card.name)).toEqual([
			"probe",
			"reader",
			"wall-ui",
		]);
	});

	it("titles a project space by its project name in the picker", () => {
		const { dbPath, logPath } = projectsFixture();
		const list = createLedger({ dbPath, logPath }).conversations();
		const titles = Object.fromEntries(list.conversations.map((conversation) => [conversation.id, conversation.title]));
		expect(titles[3100]).toBe("app");
		expect(titles[3200]).toBe("docs");
	});

	it("names no project when the registry document is missing or unreadable", () => {
		const { dbPath, logPath } = agentsFixture();
		const agents = createLedger({ dbPath, logPath }).state().agents;
		expect(agents.named.some((card) => card.kind === "project")).toBe(false);

		const db = new DatabaseSync(dbPath);
		writeDocument(db, 60, "app.projects", { projects: "not an object" }, []);
		db.close();
		const broken = createLedger({ dbPath, logPath }).state().agents;
		expect(broken.ok).toBe(true);
		expect(broken.named.some((card) => card.kind === "project")).toBe(false);
	});

	it("serves the agents block on /api/state", async () => {
		const { handler } = wall(agentsFixture());
		const { server, base } = await serve(handler);
		try {
			const body = (await (await fetch(`${base}/api/state`)).json()) as {
				agents: { spike: { state: string }; named: { name: string }[]; orphans: unknown[]; work: { in_flight: number } };
			};
			expect(body.agents.spike.state).toBe("working");
			expect(body.agents.named.map((card) => card.name)).toEqual(["probe", "reader", "wall-ui"]);
			expect(body.agents.orphans).toHaveLength(1);
			expect(body.agents.work.in_flight).toBe(1);
		} finally {
			server.close();
		}
	});
});

