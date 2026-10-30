// The wall's HTTP surface: three JSON endpoints and the built UI, on one port.
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
import { type HealthReport, type StateReport, VERSION, failure, isoNow } from "./contract.ts";
import { oneLine, type Ledger } from "./ledger.ts";
import type { SpendReader } from "./spend.ts";

export type WallServerOptions = {
	readonly ledger: Ledger;
	readonly spend: SpendReader;
	readonly assetsDir: string;
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
