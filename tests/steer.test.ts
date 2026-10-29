// Steer-surface tests for pi-host (matrix inbox daemon, phase 0).
// Covers: command mapping (pure), sync-event dedupe (pure), assistant-text
// extraction + the durable reply pump (pure + fake deps), the submit/steer/
// inbox flow against a real harness with the faux provider, the /stop flow,
// and the Matrix client against a stub fetch().
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, it } from "vitest";
import { createRegistry, Harness, InboxDoc, MemoryStorage, type Submission } from "@earendil-works/pi-durable";
import {
	classifySyncBatch,
	createReplyPump,
	extractAssistantTexts,
	forRoom,
	parseMatrixCommand,
	pickNewEvents,
	reactionContent,
	replyContent,
	submitMatrixCommand,
	SYNC_SEEN_CAP,
	withdrawSubmissions,
	type SyncState,
} from "../src/core/steer.ts";
import { createMatrixClient } from "../src/surfaces/matrix-client.ts";

const context = BACKGROUND_CONTEXT;

/** Build a faux-model harness where the first response waits until `release` is called. */
async function makeSteerHarness(): Promise<{ harness: Harness; release: () => void }> {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const slow: FauxResponseStep = async () => {
		await held;
		return fauxAssistantMessage("Answer to the first question.");
	};
	const faux = fauxProvider();
	faux.setResponses([slow, fauxAssistantMessage("Steered answer.")]);
	const models = createModels();
	models.setProvider(faux.provider);
	const harness = await Harness.open(
		new MemoryStorage(),
		{ models, registry: createRegistry(), settings: { followUpMode: "all", steeringMode: "all" } },
		context,
	);
	const root = await harness.root(context, { agent: { model: { provider: "faux", modelId: "faux-1" } } });
	return { harness, release };
}

describe("parseMatrixCommand", () => {
	it("maps plain text to an input", () => {
		expect(parseMatrixCommand("fix the flaky test")).toEqual({ action: "input", content: "fix the flaky test" });
	});
	it("ignores blank input", () => {
		expect(parseMatrixCommand("   ")).toBeNull();
	});
	it("maps known commands", () => {
		expect(parseMatrixCommand("/stop")).toEqual({ action: "stop" });
		expect(parseMatrixCommand("/status")).toEqual({ action: "status" });
		expect(parseMatrixCommand("/steer use pnpm")).toEqual({ action: "steer", content: "use pnpm" });
		expect(parseMatrixCommand("/note build started")).toEqual({ action: "note", content: "build started" });
	});
	it("ignores commands without content", () => {
		expect(parseMatrixCommand("/steer")).toBeNull();
		expect(parseMatrixCommand("/note ")).toBeNull();
	});
	it("treats unknown slash text as input content", () => {
		expect(parseMatrixCommand("/etc/hosts is wrong")).toEqual({ action: "input", content: "/etc/hosts is wrong" });
	});
	it("trims and takes only the first token as command", () => {
		expect(parseMatrixCommand("  /stop   ")).toEqual({ action: "stop" });
		expect(parseMatrixCommand("/steer   use   pnpm ")).toEqual({ action: "steer", content: "use   pnpm" });
	});
});

describe("pickNewEvents", () => {
	it("returns unseen events and grows the seen set", () => {
		const empty = new Set<string>();
		const first = pickNewEvents(empty, [
			{ id: "$a", text: "one", sender: "@jack:jacks.im", room: "!r:jacks.im" },
			{ id: "$b", text: "two", sender: "@jack:jacks.im", room: "!r:jacks.im" },
		]);
		expect(first.fresh).toEqual([
			{ id: "$a", text: "one", sender: "@jack:jacks.im", room: "!r:jacks.im" },
			{ id: "$b", text: "two", sender: "@jack:jacks.im", room: "!r:jacks.im" },
		]);
		const second = pickNewEvents(first.seen, [
			{ id: "$a", text: "one", sender: "@jack:jacks.im", room: "!r:jacks.im" },
			{ id: "$c", text: "three", sender: "@jack:jacks.im", room: "!r:jacks.im" },
		]);
		expect(second.fresh).toEqual([{ id: "$c", text: "three", sender: "@jack:jacks.im", room: "!r:jacks.im" }]);
	});
});

describe("extractAssistantTexts", () => {
	it("extracts unseen assistant entries as {id, text}, joining text blocks", () => {
		const entries = [
			{ id: "1", kind: "pi.user" },
			{
				id: "2",
				kind: "pi.assistant",
				model: [{ role: "assistant", content: [{ type: "text", text: "Answer one." }] }],
			},
			{ id: "3", kind: "pi.tool-result" },
			{
				id: "4",
				kind: "pi.assistant",
				model: [
					{
						role: "assistant",
						content: [
							{ type: "text", text: "Answer two." },
							{ type: "text", text: "\nAnswer two continued." },
						],
					},
				],
			},
		];
		const first = extractAssistantTexts(new Set(), entries);
		expect(first.items).toEqual([
			{ id: "2", text: "Answer one." },
			{ id: "4", text: "Answer two.\nAnswer two continued." },
		]);
		const second = extractAssistantTexts(first.seen, [...entries, ...entries]);
		expect(second.items).toEqual([]);
	});
	it("skips assistant entries without text blocks", () => {
		const entries = [{ id: "5", kind: "pi.assistant", model: [{ role: "assistant", content: [] }] }];
		expect(extractAssistantTexts(new Set(), entries).items).toEqual([]);
	});
});

describe("reply pump", () => {
	it("delivers each new assistant entry once; a fresh pump instance does not resend (durable cursor)", async () => {
		const sent: string[] = [];
		const saved: ReadonlySet<string>[] = [];
		const deps = {
			sendText: async (text: string) => {
				sent.push(text);
			},
			loadCursor: async () => (saved.length === 0 ? new Set<string>() : saved[saved.length - 1]),
			saveCursor: async (ids: ReadonlySet<string>) => {
				saved.push(ids);
			},
		};
		const entries = [{ id: "a", kind: "pi.assistant", model: [{ role: "assistant", content: [{ type: "text", text: "first answer" }] }] }];
		await createReplyPump(deps)(entries);
		expect(sent).toEqual(["first answer"]);
		// a second pump instance (daemon rebooted; cursor reloaded from storage) must not resend
		await createReplyPump(deps)(entries);
		expect(sent).toEqual(["first answer"]);
		expect(saved.length).toEqual(1);
		expect([...saved[0]]).toEqual(["a"]);
	});

	it("delivers two answers across ticks without ever re-sending the first (replace-vs-union regression)", async () => {
		const sent: string[] = [];
		const saved: ReadonlySet<string>[] = [];
		const deps = {
			sendText: async (text: string) => {
				sent.push(text);
			},
			loadCursor: async () => (saved.length === 0 ? new Set<string>() : saved[saved.length - 1]),
			saveCursor: async (ids: ReadonlySet<string>) => {
				saved.push(ids);
			},
		};
		const pump = createReplyPump(deps);
		const answerA = [{ id: "a", kind: "pi.assistant", model: [{ role: "assistant", content: [{ type: "text", text: "answer A" }] }] }];
		const answerB = [{ id: "b", kind: "pi.assistant", model: [{ role: "assistant", content: [{ type: "text", text: "answer B" }] }] }];
		await pump(answerA); // delivers A
		expect(sent).toEqual(["answer A"]);
		await pump([...answerA, ...answerB]); // delivers B; A must NOT re-send
		expect(sent).toEqual(["answer A", "answer B"]);
		await pump([...answerA, ...answerB]); // idle tick: nothing re-sends
		expect(sent).toEqual(["answer A", "answer B"]);
		// the persisted cursor must be the UNION (A survives B's save)
		expect([...saved[saved.length - 1]].sort()).toEqual(["a", "b"]);
	});

	it("leaves a failed delivery outside the cursor; the next tick retries it", async () => {
		const log: string[] = [];
		const sent: string[] = [];
		const saved: ReadonlySet<string>[] = [];
		let deliveries = 0;
		const deps = {
			sendText: async (text: string) => {
				deliveries += 1;
				if (deliveries === 1) throw new Error("room refused");
				sent.push(text);
			},
			loadCursor: async () => (saved.length === 0 ? new Set<string>() : saved[saved.length - 1]),
			saveCursor: async (ids: ReadonlySet<string>) => {
				saved.push(ids);
			},
			log: (message: string) => {
				log.push(message);
			},
		};
		const pump = createReplyPump(deps);
		const entries = [{ id: "x", kind: "pi.assistant", model: [{ role: "assistant", content: [{ type: "text", text: "important" }] }] }];
		await pump(entries); // send fails
		expect(log.length).toEqual(1);
		expect(saved.length).toEqual(0); // nothing delivered → nothing advanced
		await pump(entries); // retry succeeds
		expect(sent).toEqual(["important"]);
		expect(saved.length).toEqual(1);
		expect([...saved[0]]).toEqual(["x"]);
	});
});

describe("steer flow against a real harness", () => {
	it("queues a follow-up and places a steer while busy; the inbox reflects both", async () => {
		const { harness, release } = await makeSteerHarness();
		const root = await harness.root(context);
		const first = await submitMatrixCommand(root, { action: "input", content: "First question" }, context);
		const steer = await submitMatrixCommand(root, { action: "steer", content: "Use pnpm" }, context);
		const followUp = await submitMatrixCommand(root, { action: "input", content: "Also run the tests" }, context);
		const note = await submitMatrixCommand(root, { action: "note", content: "noted from matrix" }, context);

		const inbox = await harness.snapshot(InboxDoc, root.id, context);
		const modes = (inbox?.items.map((item) => (item as { mode?: string }).mode ?? "?") ?? []).sort();
		expect(modes).toEqual(["followUp", "steer"].sort());
		for (const submission of [first, steer, followUp, note] as Submission[]) {
			expect(submission.id).toBeTruthy();
		}

		// the note (write of kind+data only) is appended at once, even mid-run
		const page = await root.entries({}, 50, undefined, context);
		const kinds = [...page.items].reverse().map((entry) => entry.kind);
		expect(kinds).toContain("app.matrix-note");

		release();
		await first.wait(context);
		await steer.wait(context);
		await followUp.wait(context);
		await note.wait(context);
		await harness.close(context);
	});

	it("withdraws a queued submission with submission.abort", async () => {
		const { harness, release } = await makeSteerHarness();
		const root = await harness.root(context);
		await submitMatrixCommand(root, { action: "input", content: "First question" }, context);
		const queued = await submitMatrixCommand(root, { action: "input", content: "Never mind" }, context);
		expect(await queued.abort(context)).toEqual("aborted");
		release();
		await harness.close(context);
	});

	it("sweeps tracked submissions on /stop, classifying each outcome", async () => {
		const { harness, release } = await makeSteerHarness();
		const root = await harness.root(context);
		const running = await submitMatrixCommand(root, { action: "input", content: "First question" }, context);
		const queued = await submitMatrixCommand(root, { action: "input", content: "Never mind" }, context);
		const result = await withdrawSubmissions([queued, running], context);
		// the queued one aborts; the placed one reports already_placed (still live until it settles)
		expect(result.aborted).toEqual(1);
		expect(result.alreadyPlaced).toEqual(1);
		expect(result.settled).toEqual(0);
		release();
		await running.wait(context);
		await harness.close(context);
	});
});

describe("forRoom (pi-spike as a plain user elsewhere must not steer)", () => {
	it("accepts only events from the configured room forms", () => {
		const accepted = new Set(["!room:jacks.im"]);
		expect(forRoom({ id: "$1", sender: "@jacksim:jacks.im", text: "hi", room: "!room:jacks.im" }, accepted)).toBe(true);
		expect(forRoom({ id: "$2", sender: "@jacksim:jacks.im", text: "hi", room: "!other:jacks.im" }, accepted)).toBe(false);
	});
});

describe("classifySyncBatch (durable sync cursor + first-boot skip)", () => {
	const ev = (id: string, room = "!r:jacks.im") => ({ id, sender: "@jack:jacks.im", text: "hi", room });

	it("first boot (batch null): flags the backlog for skipping, marks it durably seen", () => {
		const out = classifySyncBatch({ batch: null, seen: [] }, new Set(), [ev("$1"), ev("$2")]);
		expect(out.skipBacklog).toBe(true);
		expect(out.fresh.map((e) => e.id)).toEqual(["$1", "$2"]);
		expect(out.durableSeen).toEqual(["$1", "$2"]);
	});

	it("resume boot (batch set): processes only unseen events, grows the durable seen list", () => {
		const state = { batch: "b1", seen: ["$1"] };
		const out = classifySyncBatch(state, new Set(), [ev("$1"), ev("$2"), ev("$3")]);
		expect(out.skipBacklog).toBe(false);
		expect(out.fresh.map((e) => e.id)).toEqual(["$2", "$3"]);
		expect(out.durableSeen).toEqual(["$1", "$2", "$3"]);
	});

	it("a server replay of durably-seen events never resubmits (capped memory is not the only guard)", () => {
		const out = classifySyncBatch({ batch: "b2", seen: ["$1"] }, new Set(), [ev("$1")]);
		expect(out.fresh).toEqual([]);
		expect(out.durableSeen).toEqual(["$1"]);
	});

	it("caps the durable seen list at SYNC_SEEN_CAP, keeping the newest ids", () => {
		const ids = Array.from({ length: SYNC_SEEN_CAP + 30 }, (_, i) => `$e${i}`);
		const out = classifySyncBatch({ batch: "b", seen: [] }, new Set(), ids.map((id) => ev(id)));
		expect(out.durableSeen.length).toBe(SYNC_SEEN_CAP);
		expect(out.durableSeen[0]).toBe("$e30"); // oldest dropped
		expect(out.durableSeen[SYNC_SEEN_CAP - 1]).toBe(`$e${SYNC_SEEN_CAP + 29}`);
	});

	it("events seen by this process are neither fresh nor re-added", () => {
		const memory = new Set<string>(["$1"]);
		const out = classifySyncBatch({ batch: "b", seen: [] }, memory, [ev("$1"), ev("$2")]);
		expect(out.fresh.map((e) => e.id)).toEqual(["$2"]);
		expect(out.durableSeen).toEqual(["$2"]);
	});
});

describe("sync watchdog (hung cloudflared long-poll must not stall the daemon)", () => {
	it("rejects when the fetch hangs past the watchdog deadline", async () => {
		const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) =>
			// stub with undici-like abort behavior: the (watchdog) signal rejection must surface
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new Error("aborted by watchdog")));
			})) as unknown as typeof fetch; // hangs forever
		const client = createMatrixClient({
			homeserver: "http://conduit:6167",
			accessToken: "t",
			watchdogSlackMs: 100,
			fetchImpl,
		});
		const started = Date.now();
		await expect(client.sync("", 0)).rejects.toThrow();
		expect(Date.now() - started).toBeLessThan(5000);
	});
});

describe("Matrix client against a stub fetch", () => {
	it("sends a message with the auth token and syncs with a since cursor", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
			const href = String(url);
			calls.push({ url: href, init });
			if (href.includes("/_matrix/client/v3/sync")) {
				return new Response(
					JSON.stringify({
						next_batch: "batch-2",
						rooms: {
							join: {
								"!room:jacks.im": {
									timeline: {
										events: [
											{ event_id: "$e1", type: "m.room.message", sender: "@jack:jacks.im", content: { msgtype: "m.text", body: "hello bot" } },
											{ event_id: "$e2", type: "m.room.message", sender: "@jack:jacks.im", content: { msgtype: "m.text", body: "again" } },
										],
									},
								},
								"!other:jacks.im": {
									timeline: {
										events: [
											{ event_id: "$e3", type: "m.room.message", sender: "@jacksim:jacks.im", content: { msgtype: "m.text", body: "chat in another room" } },
										],
									},
								},
							},
						},
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			return new Response(JSON.stringify({ event_id: "$out1" }), { status: 200, headers: { "content-type": "application/json" } });
		}) as typeof fetch;
		const client = createMatrixClient({
			homeserver: "http://conduit:6167",
			accessToken: "syt_token",
			fetchImpl,
		});
		const batch = await client.sync("", 0);
		expect(batch.nextBatch).toEqual("batch-2");
		expect(batch.textEvents).toEqual([
			{ id: "$e1", text: "hello bot", sender: "@jack:jacks.im", room: "!room:jacks.im" },
			{ id: "$e2", text: "again", sender: "@jack:jacks.im", room: "!room:jacks.im" },
			{ id: "$e3", text: "chat in another room", sender: "@jacksim:jacks.im", room: "!other:jacks.im" },
		]);
		await client.sendText("!room:jacks.im", "hello back");
		const sendCall = calls.find((call) => String(call.url).includes("/send/m.room.message"));
		expect(sendCall?.init?.method).toEqual("PUT");
		expect(JSON.stringify(sendCall?.init?.body)).toContain("hello back");
		expect(JSON.stringify(sendCall?.init?.headers)).toContain("Bearer syt_token");
		expect(JSON.stringify(sendCall?.init?.headers)).toContain("pi-host/0.1"); // CF rejects UA-less clients
	});
});
describe("ack reaction (👀 receipt) and reply threading", () => {
	it("emotes 👀 onto the message it received", () => {
		expect(reactionContent("$e1")).toEqual({
			"m.relates_to": { rel_type: "m.annotation", event_id: "$e1", key: "👀" },
		});
	});

	it("threads a reply onto the answered message", () => {
		expect(replyContent("working on it", "$ask")).toEqual({
			msgtype: "m.text",
			body: "working on it",
			"m.relates_to": { "m.in_reply_to": { event_id: "$ask" } },
		});
	});

	it("sends a bare message when there is nothing to quote", () => {
		expect(replyContent("working on it", null)).toEqual({ msgtype: "m.text", body: "working on it" });
	});
});

describe("reply pump: every answer quotes the message being answered", () => {
	const assistant = (id: string, text: string) => ({ id, kind: "pi.assistant", model: [{ role: "assistant", content: [{ type: "text", text }] }] });

	it("reads the target per delivery, so a late answer quotes the newest message", async () => {
		const sent: Array<{ text: string; replyTo: string | null }> = [];
		let target: string | null = "$first";
		let cursor = new Set<string>();
		const pump = createReplyPump({
			sendText: async (text, replyTo) => {
				sent.push({ text, replyTo });
			},
			replyTarget: () => target,
			loadCursor: async () => cursor,
			saveCursor: async (ids) => {
				cursor = new Set(ids) as Set<string>;
			},
		});
		await pump([assistant("a", "answer A")]);
		target = "$second";
		await pump([assistant("a", "answer A"), assistant("b", "answer B")]);
		expect(sent).toEqual([
			{ text: "answer A", replyTo: "$first" },
			{ text: "answer B", replyTo: "$second" },
		]);
	});

	it("delivers unthreaded when no target has been recorded", async () => {
		const sent: Array<string | null> = [];
		const pump = createReplyPump({
			sendText: async (_text, replyTo) => {
				sent.push(replyTo);
			},
			loadCursor: async () => new Set<string>(),
			saveCursor: async () => {},
		});
		await pump([assistant("a", "answer A")]);
		expect(sent).toEqual([null]);
	});
});

describe("Matrix client: reactions and threaded sends", () => {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return new Response(JSON.stringify({ event_id: "$out" }), { status: 200, headers: { "content-type": "application/json" } });
	}) as typeof fetch;

	it("reactions go to /send/m.reaction with an m.annotation relation", async () => {
		const client = createMatrixClient({ homeserver: "http://conduit:6167", accessToken: "syt_token", fetchImpl });
		await client.sendReaction("!room:jacks.im", "$e1");
		const call = calls.find((entry) => entry.url.includes("/send/m.reaction"));
		expect(call?.init?.method).toEqual("PUT");
		expect(JSON.parse(String(call?.init?.body))).toEqual({
			"m.relates_to": { rel_type: "m.annotation", event_id: "$e1", key: "👀" },
		});
	});

	it("a threaded send carries m.in_reply_to; an unthreaded one does not", async () => {
		const client = createMatrixClient({ homeserver: "http://conduit:6167", accessToken: "syt_token", fetchImpl });
		await client.sendText("!room:jacks.im", "quoted", "$e1");
		await client.sendText("!room:jacks.im", "plain");
		const sends = calls.filter((entry) => entry.url.includes("/send/m.room.message"));
		expect(JSON.parse(String(sends[0]?.init?.body))).toEqual({
			msgtype: "m.text",
			body: "quoted",
			"m.relates_to": { "m.in_reply_to": { event_id: "$e1" } },
		});
		expect(JSON.parse(String(sends[1]?.init?.body))).toEqual({ msgtype: "m.text", body: "plain" });
	});
});
