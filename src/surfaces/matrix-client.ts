// Thin Matrix client-server API (CS API) client for the steer-surface daemon.
// Raw HTTP against the homeserver, no SDK — the same shape the Hermes matrix
// adapter uses on the Python side (plugins/platforms/matrix/adapter.py):
// access-token auth, long-poll /sync, plain m.room.message sends.
//
// v0 deliberately has NO encryption support: join a non-encrypted room. E2EE
// (matrix-sdk-crypto-native bindings) is a later upgrade, per the pi-courier
// FAQ note that bot accounts without cross-signing fight encryption.
import type { TextEvent } from "../core/steer.ts";

/** Homeservers reject events above 4000 body chars; clamp well below with a marker. */
const MAX_BODY_CHARS = 3000;

export type MatrixClientOptions = {
	readonly homeserver: string;
	readonly accessToken: string;
	readonly fetchImpl?: typeof fetch;
};

type SyncEvent = {
	readonly event_id?: string;
	readonly type?: string;
	readonly sender?: string;
	readonly content?: { readonly msgtype?: string; readonly body?: unknown };
};

/** One sync batch: the cursor for the next call, plus fresh text events from joined rooms. */
export type SyncBatch = { readonly nextBatch: string; readonly textEvents: TextEvent[] };

export type MatrixClient = {
	/** Long-poll one sync batch. `since: ""` starts a new cursor. `timeoutMs: 0` returns immediately. */
	sync(since: string, timeoutMs: number, signal?: AbortSignal): Promise<SyncBatch>;
	/** Send one text message to a room; returns the event id. */
	sendText(roomId: string, text: string): Promise<string>;
	/** Join a room once (idempotent on the homeserver for a joined member). */
	joinRoom(roomIdOrAlias: string): Promise<string | undefined>;
};

export function createMatrixClient(options: MatrixClientOptions): MatrixClient {
	const base = options.homeserver.replace(/\/+$/, "");
	const doFetch = options.fetchImpl ?? fetch;
	const headers = { authorization: `Bearer ${options.accessToken}` };

	async function sync(since: string, timeoutMs: number, signal?: AbortSignal): Promise<SyncBatch> {
		const params = new URLSearchParams({ timeout: String(Math.max(0, timeoutMs | 0)) });
		if (since.length > 0) params.set("since", since);
		const response = await doFetch(`${base}/_matrix/client/v3/sync?${params.toString()}`, {
			method: "GET",
			headers,
			signal,
		});
		if (response.status === 401 || response.status === 404) {
			throw new Error(`matrix sync rejected: HTTP ${response.status} (check MATRIX_ACCESS_TOKEN / homeserver)`);
		}
		if (!response.ok) throw new Error(`matrix sync failed: HTTP ${response.status}`);
		const body = (await response.json()) as { next_batch?: string; rooms?: { join?: Record<string, { timeline?: { events?: SyncEvent[] } }> } };
		const textEvents: TextEvent[] = [];
		for (const room of Object.values(body.rooms?.join ?? {})) {
			for (const event of room.timeline?.events ?? []) {
				const id = event.event_id;
				const text = typeof event.content?.body === "string" ? event.content.body : undefined;
				if (id && text && event.type === "m.room.message" && event.content?.msgtype === "m.text" && event.sender) {
					textEvents.push({ id, sender: event.sender, text });
				}
			}
		}
		return { nextBatch: body.next_batch ?? since, textEvents };
	}

	async function sendText(roomId: string, text: string): Promise<string> {
		const clamped =
			text.length > MAX_BODY_CHARS
				? `${text.slice(0, MAX_BODY_CHARS)}\n…(clamped at ${MAX_BODY_CHARS} chars; homeserver limit is ~4000)`
				: text;
		const txn = `steer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const response = await doFetch(
			`${base}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txn)}`,
			{ method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ msgtype: "m.text", body: clamped }) },
		);
		if (!response.ok) throw new Error(`matrix send failed: HTTP ${response.status}`);
		const body = (await response.json()) as { event_id?: string };
		return body.event_id ?? "";
	}

	async function joinRoom(roomIdOrAlias: string): Promise<string | undefined> {
		const response = await doFetch(`${base}/_matrix/client/v3/join/${encodeURIComponent(roomIdOrAlias)}`, {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		if (response.ok) {
			const body = (await response.json()) as { room_id?: string };
			return body.room_id;
		}
		return undefined;
	}

	return { sync, sendText, joinRoom };
}