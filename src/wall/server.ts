// The wall's HTTP surface: seven JSON endpoints and the built UI, on one port.
//
// Rules the rest of the system relies on (wall/CONTRACT.md):
//  * `/api/*` is always JSON, even on failure — `{"v":1,"ok":false,"error":"…"}`;
//  * `/api/*` is `cache-control: no-store` (it is a live view, and the UI polls);
//  * static paths are resolved inside the assets directory only — `..` and absolute
//    escapes are a 404, never a filesystem read;
//  * nothing is ever written, and a request never throws: a failing ledger or a
//    slow upstream degrades to a field, not a 500.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
	oneLine,
	type ConversationsReport,
	type HealthReport,
	type LogsReport,
	type SearchReport,
	type SpillReport,
	type StateReport,
	VERSION,
	failure,
	isoNow,
} from "./contract.ts";
import { type Ledger } from "./ledger.ts";
import { DEFAULT_SPILL_ROOTS, parseLogsQuery, parseSearchQuery, readSpill } from "./logs.ts";
import type { SpendReader } from "./spend.ts";

export type WallServerOptions = {
	readonly ledger: Ledger;
	readonly spend: SpendReader;
	readonly assetsDir: string;
	/** Roots `/api/spill` may serve from; defaults to `/opt/pi-host` (see logs.ts). */
	readonly spillRoots?: readonly string[];
	readonly now?: () => number;
	readonly startedAt?: number;
};

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
	".map": "application/json; charset=utf-8",
};

export function createHandler(options: WallServerOptions) {
	const now = options.now ?? Date.now;
	const startedAt = options.startedAt ?? now();
	const assetsRoot = path.resolve(options.assetsDir);

	return async function handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
		const method = request.method ?? "GET";
		try {
			if (method !== "GET" && method !== "HEAD") {
				sendJson(response, 405, failure("method not allowed"), method === "HEAD");
				return;
			}
			const url = new URL(request.url ?? "/", "http://wall.local");
			switch (url.pathname) {
				case "/api/health": {
					const health = options.ledger.health();
					const report: HealthReport = {
						v: VERSION,
						ok: true,
						generated_at: isoNow(now()),
						uptime_s: Math.round((now() - startedAt) / 1000),
						ledger_ok: health.ledger_ok,
					};
					sendJson(response, 200, report, method === "HEAD");
					return;
				}
				case "/api/state": {
					const snapshot = options.ledger.state();
					const report: StateReport = {
						v: VERSION,
						ok: true,
						generated_at: isoNow(now()),
						...snapshot,
					};
					sendJson(response, 200, report, method === "HEAD");
					return;
				}
				case "/api/spend": {
					const report = await options.spend.report();
					// 200 even when `ok:false`: the UI renders `error` in a banner.
					sendJson(response, 200, report, method === "HEAD");
					return;
				}
				case "/api/logs": {
					// Additive in v1: `/api/state` and `/api/spend` do not change. Junk params
					// are clamped, never rejected — the tail must keep working while someone
					// fiddles with the URL by hand. The one exception is a conversation id the
					// ledger does not have: that is a client mistake, and an empty page would
					// look like an empty conversation.
					const query = parseLogsQuery(url.searchParams);
					if (query.conversation !== null && options.ledger.conversationExists(query.conversation) === false) {
						sendJson(
							response,
							400,
							failure(`no such conversation ${query.conversation}`),
							method === "HEAD",
						);
						return;
					}
					const page = options.ledger.logs(query);
					const report: LogsReport = {
						v: VERSION,
						ok: page.error === null,
						error: page.error,
						generated_at: isoNow(now()),
						entries: page.entries,
					};
					if (page.next_before !== null) report.next_before = page.next_before;
					sendJson(response, 200, report, method === "HEAD");
					return;
				}
				case "/api/conversations": {
					// The picker's data: one row per space, carrying the same state enum the
					// dashboard's AGENTS card uses. 200 even when `ok:false` — the tab shows the
					// error above an empty rail rather than failing to load.
					const result = options.ledger.conversations();
					const report: ConversationsReport = {
						v: VERSION,
						ok: result.error === null,
						error: result.error,
						generated_at: isoNow(now()),
						conversations: result.conversations,
					};
					sendJson(response, 200, report, method === "HEAD");
					return;
				}
				case "/api/search": {
					// Cross-conversation, one page, no cursor. An empty `q` is the one
					// rejection: "search for nothing" is not a query, and answering it with
					// every entry in the ledger would misreport the result count.
					const query = parseSearchQuery(url.searchParams);
					if (query.q.length === 0) {
						sendJson(response, 400, failure("q is required"), method === "HEAD");
						return;
					}
					const result = options.ledger.search(query);
					const report: SearchReport = {
						v: VERSION,
						ok: result.error === null,
						error: result.error,
						generated_at: isoNow(now()),
						hits: result.hits,
						limit: query.limit,
						q: query.q,
					};
					sendJson(response, 200, report, method === "HEAD");
					return;
				}
				case "/api/spill": {
					const result = readSpill(url.searchParams.get("path"), {
						roots: options.spillRoots ?? DEFAULT_SPILL_ROOTS,
					});
					const report: SpillReport = result.ok
						? {
								v: VERSION,
								ok: true,
								error: null,
								generated_at: isoNow(now()),
								path: result.path,
								bytes: result.bytes,
								truncated: result.truncated,
								text: result.text,
							}
						: {
								v: VERSION,
								ok: false,
								error: result.error,
								generated_at: isoNow(now()),
								path: null,
								bytes: null,
								truncated: false,
								text: null,
							};
					// A rejected path is a client mistake (400), a missing file a 404 — both
					// JSON with `ok:false`, because `/api/*` is never HTML.
					const status = result.ok ? 200 : result.error === "no such file" ? 404 : 400;
					sendJson(response, status, report, method === "HEAD");
					return;
				}
				default: {
					if (url.pathname.startsWith("/api/")) {
						sendJson(response, 404, failure(`unknown endpoint ${url.pathname}`), method === "HEAD");
						return;
					}
					sendStatic(request, response, url.pathname, assetsRoot, method === "HEAD");
				}
			}
		} catch (error) {
			// Last resort: still JSON for /api, still a page for the UI.
			sendJson(response, 500, failure(oneLine(error)), false);
		}
	};
}

export function createWallServer(options: WallServerOptions): http.Server {
	const handle = createHandler(options);
	return http.createServer((request, response) => {
		void handle(request, response);
	});
}

// --- static ---------------------------------------------------------------

function sendStatic(
	request: http.IncomingMessage,
	response: http.ServerResponse,
	pathname: string,
	assetsRoot: string,
	headOnly: boolean,
): void {
	const decoded = safeDecode(pathname);
	if (decoded === null) {
		sendText(response, 404, "not found");
		return;
	}
	const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
	const resolved = path.resolve(assetsRoot, relative);
	// The only containment check that matters: the resolved path must stay under
	// the assets root, so `..`, absolute paths and symlinked escapes all fail here.
	if (resolved !== assetsRoot && !resolved.startsWith(assetsRoot + path.sep)) {
		sendText(response, 404, "not found");
		return;
	}
	const contentType = CONTENT_TYPES[path.extname(resolved).toLowerCase()];
	if (contentType === undefined) {
		sendText(response, 404, "not found");
		return;
	}
	let body: Buffer;
	try {
		const stat = fs.statSync(resolved);
		if (!stat.isFile()) throw new Error("not a file");
		body = fs.readFileSync(resolved);
	} catch {
		sendText(response, 404, "not found");
		return;
	}
	response.writeHead(200, {
		"content-type": contentType,
		"content-length": String(body.length),
		// The bundle is rebuilt on deploy, and the wall is one small page: no store
		// beats a stale dashboard that lies about its own code.
		"cache-control": "no-cache",
	});
	if (headOnly) response.end();
	else response.end(body);
}

function safeDecode(pathname: string): string | null {
	try {
		const decoded = decodeURIComponent(pathname);
		if (decoded.includes("\0")) return null;
		return decoded;
	} catch {
		return null;
	}
}

// --- responses ------------------------------------------------------------

function sendJson(
	response: http.ServerResponse,
	status: number,
	body: unknown,
	headOnly: boolean,
): void {
	const payload = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(payload.length),
		"cache-control": "no-store",
	});
	if (headOnly) response.end();
	else response.end(payload);
}

function sendText(response: http.ServerResponse, status: number, text: string): void {
	const payload = Buffer.from(text, "utf8");
	response.writeHead(status, {
		"content-type": "text/plain; charset=utf-8",
		"content-length": String(payload.length),
		"cache-control": "no-store",
	});
	response.end(payload);
}
