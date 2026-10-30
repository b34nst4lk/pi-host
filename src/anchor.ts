// The anchor task: what a persistent child conversation hangs from.
//
// A subagent and a project are the same durable shape — a child conversation
// owned by a task that does nothing but hold. `background` is the whole point:
// an ordinary abort, a `/stop` in the main conversation, or an idle wait stops
// at this task, so a child never blocks the room that started it. The task
// sleeps and re-parks; it owns no work itself.
//
// One definition, two names (`subagent-anchor`, `project-anchor`): the names are
// durable kind strings that already exist in the ledger, so they stay distinct,
// while the behaviour lives here once.
import { defineTask } from "@earendil-works/pi-durable";

/** How long one anchor invocation sleeps before it re-parks. */
export const ANCHOR_HOLD_MS = 60 * 60 * 1000;

export type AnchorInput = { name: string };
export type AnchorState = { phase: "hold"; wakes: number };
export type AnchorOutcome = { done: true };

/** One anchor task under the durable kind `name`. */
export function defineAnchorTask(name: string) {
	return defineTask<AnchorInput, AnchorState, AnchorOutcome, object>({
		name,
		version: 1,
		initial: () => ({ phase: "hold", wakes: 0 }),
		phases: {
			hold: async (task, runtime, context) => {
				try {
					await runtime.sleep(runtime.now() + ANCHOR_HOLD_MS, context);
				} catch {
					// Invocation cancelled (shutdown, restart, abort): the task stays live and
					// a fresh invocation re-enters this phase.
					return;
				}
				await runtime.commit(
					() => ({ status: "running", checkpoint: { phase: "hold", wakes: task.state.checkpoint.wakes + 1 } }),
					context,
				);
			},
		},
		abort: async (_task, runtime, context) => {
			await runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: { done: true } } }), context);
		},
	});
}
