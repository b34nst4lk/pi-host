// The agent-state enum, as pure code.
//
// Six states, decided by precedence, highest first:
//
//   1. working   — this conversation has run tasks (generation/tool/compaction)
//                  that are in flight, or `pi.live` says a run has it
//   2. queued    — nothing in flight, but its inbox holds accepted, unplaced work
//   3. reporting — idle, but a `subagent-reporter` task for it is still running
//                  in the main conversation (the child's last word is on its way)
//   4. alive     — its anchor holds and the registry names it
//   5. orphaned  — its anchor holds but nothing names it ("unnamed (prunable)")
//   6. retired   — its anchor is terminal (counted, never a card)
//
// `unknown` is the seventh, for "the ledger could not be read" — a state the wall
// must be able to say out loud instead of pretending an agent is fine.
//
// Everything here is a pure function of facts the reader gathered, so the tests
// are fixtures rather than databases, and the precedence is readable in one place.
export type AgentState = "working" | "queued" | "reporting" | "alive" | "orphaned" | "retired" | "unknown";

/** Task kinds that mean "an agent conversation is doing model or tool work". */
export const RUN_TASK_KINDS = ["pi.generation", "pi.tool", "pi.compaction"] as const;

/** Statuses that mean "in flight": running and waiting are live, completing is finishing. */
export const RUNNING_STATUSES = ["running", "waiting", "completing"] as const;

/**
 * Every task kind that owns a persistent child conversation. A subagent anchor is
 * retirable, a project anchor is long-lived; the reader must see both, or a
 * retired project reads as alive. One list, so a third kind is one edit.
 */
export const ANCHOR_KINDS = ["subagent-anchor", "project-anchor"] as const;
export const REPORTER_KIND = "subagent-reporter";

/** The main conversation: pi-spike itself. One root per ledger. */
export const ROOT_CONVERSATION = 1;

export type TaskFact = {
	readonly id: number;
	readonly kind: string;
	readonly status: string;
	readonly conversation: number | null;
};

export type AnchorFact = {
	readonly id: number;
	readonly status: string;
	readonly conversation: number | null;
	readonly name: string | null;
};

export type AgentFacts = {
	/** This conversation's task rows. */
	readonly tasks: readonly TaskFact[];
	/** Replayed `pi.inbox.items.length`, or null when the document is unreadable. */
	readonly inbox_items: number | null;
	/** Replayed `pi.live`: a run or a generation is present. */
	readonly live_busy: boolean | null;
	/** A reporter task for this conversation is still running in the main conversation. */
	readonly reporter_pending: boolean;
	/** The anchor task that owns this conversation, or null for the root (pi-spike). */
	readonly anchor: AnchorFact | null;
	/** The registry (`app.subagents`) names this conversation. */
	readonly named: boolean;
	/** False when the ledger could not be read at all. */
	readonly readable: boolean;
};

/** The enum. Precedence, not a state machine: first match wins. */
export function agentState(facts: AgentFacts): AgentState {
	if (!facts.readable) return "unknown";
	if (isWorking(facts)) return "working";
	if ((facts.inbox_items ?? 0) > 0) return "queued";
	if (facts.reporter_pending) return "reporting";
	const anchor = facts.anchor;
	if (anchor === null) return facts.named ? "alive" : "unknown";
	if (anchor.status === "terminal") return "retired";
	return facts.named ? "alive" : "orphaned";
}

/** In-flight run work: a live task row, or a live run in the conversation document. */
export function isWorking(facts: AgentFacts): boolean {
	return busyTasks(facts.tasks).length > 0 || facts.live_busy === true;
}

/** Run tasks that are in flight, ignoring anchors, reporters and settled work. */
export function busyTasks(tasks: readonly TaskFact[]): TaskFact[] {
	return tasks.filter((task) => isRunKind(task.kind) && isRunningStatus(task.status));
}

export function isRunKind(kind: string): boolean {
	const plain = plainKind(kind);
	return (RUN_TASK_KINDS as readonly string[]).includes(plain);
}

export function isRunningStatus(status: string): boolean {
	return (RUNNING_STATUSES as readonly string[]).includes(status);
}

/** The ledger stores task kinds JSON-quoted (`"pi.generation"`); accept both. */
export function plainKind(kind: unknown): string {
	if (typeof kind !== "string") return "";
	const trimmed = kind.trim();
	if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed === "string") return parsed;
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}

/** `{"items":[…]}` → how many; anything else is "we cannot tell" (null). */
export function inboxItemCount(state: unknown): number | null {
	if (state === null || typeof state !== "object") return null;
	const items = (state as Record<string, unknown>).items;
	return Array.isArray(items) ? items.length : null;
}

/** `pi.live` has a run or a generation when work is actually happening. */
export function liveBusy(state: unknown): boolean | null {
	if (state === null || typeof state !== "object") return null;
	const live = state as Record<string, unknown>;
	return live.run !== undefined || live.generation !== undefined;
}

/**
 * The child conversation a reporter task is reporting for. Newer records carry
 * `input.child`; older ones carried `input.conversationId`. Both are accepted.
 */
export function reporterChild(record: Record<string, unknown> | null): number | null {
	const input = record ? record.input : null;
	if (!input || typeof input !== "object") return null;
	const facts = input as Record<string, unknown>;
	const child = facts.child ?? facts.conversationId;
	return typeof child === "number" && Number.isFinite(child) ? child : null;
}

export type AnchorDetail = { name: string | null; phase: string | null };

/** `{input:{name},state:{checkpoint:{phase}}}`, defensively. */
export function anchorDetail(record: Record<string, unknown> | null): AnchorDetail {
	if (!record) return { name: null, phase: null };
	const input = record.input;
	const name =
		input && typeof input === "object" && typeof (input as Record<string, unknown>).name === "string"
			? ((input as Record<string, unknown>).name as string)
			: null;
	const state = record.state;
	const checkpoint =
		state && typeof state === "object" ? (state as Record<string, unknown>).checkpoint : null;
	const phase =
		checkpoint && typeof checkpoint === "object" && typeof (checkpoint as Record<string, unknown>).phase === "string"
			? ((checkpoint as Record<string, unknown>).phase as string)
			: null;
	return { name, phase };
}

/** A badge label the wall can render verbatim. */
export function stateLabel(state: AgentState): string {
	switch (state) {
		case "working":
			return "working";
		case "queued":
			return "queued";
		case "reporting":
			return "reporting";
		case "alive":
			return "alive";
		case "orphaned":
			return "unnamed (prunable)";
		case "retired":
			return "retired";
		default:
			return "unknown";
	}
}
