// Rooms: which Matrix room steers what.
//
// Round 5 makes the daemon multi-project. One `/sync` long-poll already returns
// every joined room's events, so the routing decision is the whole problem: a
// BOUND room (a project's room) submits into that project's conversation, the
// configured room submits into pi-spike, and every other joined room — the bot
// is a plain user of the wider setup and gets invited everywhere — steers
// nothing at all. That last rule is the original one, and it still has to hold:
// a daemon that listens to every room it idles in submits household chatter to
// the durable agent.
//
// Two things stay outside this module on purpose:
//
//  * the `/sync` cursor and its durable seen list (one cursor covers every room,
//    because Matrix event ids are `$`-global);
//  * the reply pumps (one per watched conversation), which src/daemon.ts starts
//    at boot and again on every successful bind.
//
// Everything here is a decision, not I/O: `routeRoom` is pure, and the router is
// a function of injected calls, so the multi-room tests run against fakes.
import type { ConversationId } from "@earendil-works/pi-durable";
import { parseMatrixCommand, pickNewEvents, roomShort, type EventId, type MatrixCommand, type TextEvent } from "./core/steer.ts";
import { projectHint, type ProjectsState } from "./projects.ts";

/** Ollama-answered commands: one upstream call each, never in the sync loop's path. */
const OLLAMA_ACTIONS = new Set(["usage", "usage-invalid", "balance", "models", "embed"]);

/** Where one room's messages go. */
export type RoomRoute =
	| { readonly kind: "main" }
	| { readonly kind: "project"; readonly name: string; readonly conversation: ConversationId }
	| { readonly kind: "unbound" };

/**
 * The route table, derived from the registry on every event (a bind changes it
 * mid-run, and a stale cache would send one message to the wrong project).
 *
 * A bound room wins over the configured one: binding the configured room to a
 * project is an explicit act, so it means what it says.
 */
export function routeRoom(state: ProjectsState, mainRooms: ReadonlySet<string>, room: string): RoomRoute {
	for (const [name, record] of Object.entries(state.projects ?? {})) {
		if (record.room === room) return { kind: "project", name, conversation: record.conversation };
	}
	return mainRooms.has(room) ? { kind: "main" } : { kind: "unbound" };
}

/** The room that reads one conversation's answers, or `null` (a subagent child). */
export function roomForConversation(state: ProjectsState, conversation: ConversationId): string | null {
	for (const record of Object.values(state.projects ?? {})) {
		if (record.conversation === conversation) return record.room;
	}
	return null;
}

/** True for the commands that must work in a room nothing is bound to yet. */
export function isProjectCommand(command: MatrixCommand | null): boolean {
	return command !== null && command.action.startsWith("project-");
}

export type RoomClient = {
	sendText(room: string, text: string, replyTo?: EventId | null): Promise<string>;
	sendReaction(room: string, eventId: EventId, key?: string): Promise<string>;
};

/** Everything the router needs; all of it injected, so the tests are fakes. */
export type RoomRouterDeps = {
	readonly client: RoomClient;
	/** Accept one pending invite (mid-run /project flows deliver invites while the daemon lives). */
	readonly joinRoom: (roomIdOrAlias: string) => Promise<string | undefined>;
	/** The configured room, in every form it is known by (literal and resolved id). */
	readonly mainRooms: ReadonlySet<string>;
	/** The root conversation (pi-spike). */
	readonly mainConversation: ConversationId;
	/** The registry, read fresh per event. */
	readonly registry: () => Promise<ProjectsState>;
	readonly allowed: (sender: string) => boolean;
	/** Place an input/steer/note in one conversation. */
	readonly submit: (conversation: ConversationId, command: MatrixCommand) => Promise<void>;
	/** Abort one conversation; returns the line to reply with. */
	readonly abort: (conversation: ConversationId) => Promise<string>;
	/** The status line for one conversation. */
	readonly status: (conversation: ConversationId) => Promise<string>;
	/** Answer an Ollama query command; never awaited, never throws. */
	readonly ollama: (command: MatrixCommand, replyTo: EventId, room: string) => void;
	/** The `/project` handlers: scaffold, bind, list. */
	readonly project: {
		create: (name: string, path: string, room: string) => Promise<string>;
		bind: (name: string, path: string, room: string) => Promise<string>;
		list: () => Promise<string>;
	};
	/** Ingested event ids: Matrix ids are `$`-global, so one set spans every room. */
	readonly seen: Set<string>;
	/** Newest accepted inbound message per room: what a reply threads onto. */
	readonly lastInbound: Map<string, EventId>;
	readonly log?: (line: string) => void;
};

export function createRoomRouter(deps: RoomRouterDeps) {
	const muted = new Set<string>();

	function log(line: string): void {
		deps.log?.(line);
	}

	/** One line per room, not per message: silence for other rooms is normal, not news. */
	function logMuted(room: string, line: string): void {
		if (muted.has(line)) return;
		muted.add(line);
		log(`${roomShort(room)}: ${line}`);
	}

	async function replyIn(room: string, text: string, replyTo: EventId): Promise<void> {
		try {
			await deps.client.sendText(room, text, replyTo);
		} catch (error) {
			log(`reply in ${roomShort(room)} failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** 👀 as soon as the message is accepted, in the room it came from. */
	async function ack(room: string, eventId: EventId): Promise<void> {
		try {
			await deps.client.sendReaction(room, eventId);
		} catch (error) {
			log(`ack reaction failed (message still steers): ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * One inbound event. Returns without a word for a room that steers nothing
	 * (except `/project`, which is exactly what binds one) and for senders outside
	 * MATRIX_ALLOWED_USERS.
	 */
	async function handleEvent(event: TextEvent): Promise<void> {
		const state = await deps.registry();
		const route = routeRoom(state, deps.mainRooms, event.room);
		const command = parseMatrixCommand(event.text);
		if (route.kind === "unbound" && !isProjectCommand(command)) {
			logMuted(event.room, "this room steers nothing (only /project commands are read here)");
			return;
		}
		const { fresh } = pickNewEvents(deps.seen, [event]);
		if (fresh.length === 0) return; // the homeserver redelivered it
		// Remembered before the sender check: an event this process has seen stays
		// seen, whoever sent it (the daemon marks every ingested id the same way).
		deps.seen.add(event.id);
		if (!deps.allowed(event.sender)) {
			logMuted(event.room, `ignored: ${event.sender} is not in MATRIX_ALLOWED_USERS`);
			return;
		}
		if (command === null) return; // an empty message: nothing to do, nothing to ack
		deps.lastInbound.set(event.room, event.id);
		await ack(event.room, event.id);

		const target = route.kind === "project" ? route.conversation : deps.mainConversation;
		const label = route.kind === "project" ? `project ${route.name}` : "pi-spike";

		switch (command.action) {
			case "project-new":
				await replyIn(event.room, await deps.project.create(command.name, command.path, event.room), event.id);
				return;
			case "project-bind":
				await replyIn(event.room, await deps.project.bind(command.name, command.path, event.room), event.id);
				return;
			case "project-list":
				await replyIn(event.room, await deps.project.list(), event.id);
				return;
			case "project-invalid":
				await replyIn(
					event.room,
					[
						command.text.length > 0 ? `unknown project command "${command.text}"` : "project command needs arguments",
						projectHint(),
					].join("\n"),
					event.id,
				);
				return;
			case "stop":
				await replyIn(event.room, await deps.abort(target), event.id);
				return;
			case "status":
				await replyIn(event.room, await deps.status(target), event.id);
				return;
			default:
				break;
		}
		if (OLLAMA_ACTIONS.has(command.action)) {
			// Not awaited: an upstream timeout must never stall the sync loop.
			deps.ollama(command, event.id, event.room);
			return;
		}
		try {
			await deps.submit(target, command);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			log(`${label}: submit failed: ${reason}`);
			await replyIn(event.room, `❌ ${label}: ${reason}`, event.id);
		}
	}

	/** The inbound event a reply in `room` should quote, or `null` before any. */
	function replyTarget(room: string): EventId | null {
		return deps.lastInbound.get(room) ?? null;
	}

	return { handleEvent, replyTarget };
}
