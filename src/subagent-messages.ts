// A subagent in text: its name, its branch, the instructions it is configured
// with, how its answer appears in the room, and the turn budget it is held to.
//
// All of it is pure — a name in, a string out — so the wording can be tested
// without a harness. The turn-limit hook is here too: it rewrites a model context
// rather than a string, but it is the same concern (what the child is told).
import type { ContextView } from "@earendil-works/pi-durable";

/** One message of the model context: what the turn-limit hook rewrites. */
export type ChatMessage = ContextView["messages"][number];

/** Names end up in git branches and directory names, so they are narrow on purpose. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Marker the wrap-up instruction carries, so it is injected once. */
const TURN_LIMIT_MARKER = "Turn limit reached.";

/** Report text when a subagent finished without any prose. */
export const NO_ANSWER_TEXT = "(the subagent answered with no text)";

/** One-line reason from an error, for report text and outcomes. */
export function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** `null` when the name is not worktree-safe; otherwise the trimmed name. */
export function parseSubagentName(raw: string): string | null {
	const name = raw.trim();
	return NAME_PATTERN.test(name) ? name : null;
}

/** The branch a subagent works on: `worktree-<name>`. */
export function subagentBranch(name: string): string {
	return `worktree-${name}`;
}

/** How a subagent's answer appears in the room. */
export function reportBody(name: string, text: string): string {
	return `[subagent ${name}] ${text}`;
}

/** The child's instructions: who it is, where it works, and its budget. */
export function subagentInstructions(input: { name: string; maxTurns: number; worktree: string }): string {
	return [
		`You are the subagent "${input.name}", working on branch ${subagentBranch(input.name)} in the git worktree ${input.worktree}.`,
		"Work only inside that worktree. Your work is committed there when you finish; it is never merged for you — the main agent reads the diff and proposes the merge.",
		`Answer the message you are given and stop: you have at most ${input.maxTurns} model turns per message. Be terse and factual; no preamble.`,
		"If the work needs more than that, do the most valuable part and say what is left.",
	].join("\n");
}

/** Text of one model message, for scanning user messages. */
export function textOf(message: ChatMessage): string {
	const content = message.content as unknown;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			const typed = block as { type?: string; text?: string };
			return typed.type === "text" ? typed.text ?? "" : "";
		})
		.join("");
}

/**
 * The turn budget, enforced at request time: at the limit the model gets one
 * forced wrap-up turn instead of another tool round. Idempotent — a context
 * that already carries the instruction is returned unchanged; `maxTurns <= 0`
 * means "no limit" and returns the context untouched.
 */
export function applyTurnLimit(messages: readonly ChatMessage[], maxTurns: number): readonly ChatMessage[] {
	if (maxTurns <= 0) return messages;
	const turns = messages.filter((message) => message.role === "assistant").length;
	if (turns < maxTurns) return messages;
	if (messages.some((message) => message.role === "user" && textOf(message).includes(TURN_LIMIT_MARKER))) return messages;
	const wrapUp = {
		role: "user",
		content: [
			{
				type: "text",
				text: `${TURN_LIMIT_MARKER} You have used your ${maxTurns} turns. Do not call tools. Answer now with what you have and what is left.`,
			},
		],
	} as ChatMessage;
	return [...messages, wrapUp];
}
