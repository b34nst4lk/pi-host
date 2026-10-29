// Thin wrappers over the Ollama APIs the room commands use. Kept apart from the
// formatters (src/core/ollama-format.ts) so the rendering rules stay pure and
// testable without a network, and apart from the daemon so dispatch stays
// readable.
//
// Endpoints, and why each is shaped the way it is:
//  - GET  {apiBase}/api/usage?range=…[&group_by=model]  — 10 req/min/user shared
//    across keys, 429 carries Retry-After. One call per command, never polled.
//  - GET  {apiBase}/api/balance                          — no query params at all;
//    any param is a 400.
//  - GET  {apiBase}/api/tags                             — public, no auth header.
//  - POST {embedBase}/api/embed                          — the LOCAL server:
//    ollama.com serves no embedding models (cloud /api/tags lists none and
//    /v1/embeddings 404s), so this deliberately defaults to 127.0.0.1:11434.
import type { BalanceReport, EmbedReport, TagsReport, UsageRange, UsageReport } from "./core/ollama-format.ts";

/** The provider base ends in /v1 (OpenAI-compatible); the native API root does not. */
export const DEFAULT_API_BASE_URL = "https://ollama.com";
/** Local by design — see the header note about cloud embeddings. */
export const DEFAULT_EMBED_BASE_URL = "http://127.0.0.1:11434";
/** Suggested pull for a machine that has no embedding model yet. */
export const SUGGESTED_EMBED_MODEL = "embeddinggemma";

/** The local server answered, but has no embedding model installed. Not an API failure. */
export class NoEmbeddingModelError extends Error {
	readonly baseUrl: string;
	readonly installed: readonly string[];

	constructor(baseUrl: string, installed: readonly string[]) {
		const list = installed.length === 0 ? "none installed" : installed.join(", ");
		super(`no embedding model on ${baseUrl} (chat models: ${list}) — run \`ollama pull ${SUGGESTED_EMBED_MODEL}\` first`);
		this.name = "NoEmbeddingModelError";
		this.baseUrl = baseUrl;
		this.installed = installed;
	}
}

export type OllamaApiOptions = {
	/** `OLLAMA_API_KEY`; sent as a bearer token on the account endpoints only. */
	readonly apiKey: string;
	/** `OLLAMA_BASE_URL` (e.g. `https://ollama.com/v1`); `/v1` and trailing slashes are stripped. */
	readonly baseUrl?: string;
	/** `OLLAMA_EMBED_BASE_URL`. */
	readonly embedBaseUrl?: string;
	/** `OLLAMA_EMBED_MODEL`; when set, the local catalogue is not listed. */
	readonly embedModel?: string;
	readonly fetchImpl?: typeof fetch;
	readonly timeoutMs?: number;
};

export type OllamaApi = {
	usage(range: UsageRange, groupByModel: boolean): Promise<UsageReport>;
	balance(): Promise<BalanceReport>;
	/** The public cloud catalogue. */
	tags(): Promise<TagsReport>;
	/** Model names installed on the local server. */
	localModels(): Promise<string[]>;
	embed(input: string): Promise<EmbedReport & { readonly model: string }>;
};

function trimBase(url: string): string {
	return url.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/** One JSON call: non-2xx becomes an Error carrying the status, the server text, and Retry-After. */
async function callJson<T>(
	fetchImpl: typeof fetch,
	url: string,
	init: RequestInit,
	label: string,
	timeoutMs: number,
): Promise<T> {
	let response: Response;
	try {
		response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		throw new Error(`${label}: request failed (${error instanceof Error ? error.message : String(error)})`);
	}
	const text = await response.text();
	let body: unknown;
	try {
		body = text === "" ? undefined : JSON.parse(text);
	} catch {
		body = undefined;
	}
	if (!response.ok) {
		const detail =
			typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
				? body.error
				: text.slice(0, 200).trim() || response.statusText;
		const retryAfter = response.headers.get("retry-after");
		const wait = retryAfter === null ? "" : ` (retry-after ${retryAfter}s)`;
		throw new Error(`${label}: HTTP ${response.status}${wait}: ${detail}`);
	}
	if (body === undefined) throw new Error(`${label}: empty or non-JSON response (HTTP ${response.status})`);
	return body as T;
}

export function createOllamaApi(options: OllamaApiOptions): OllamaApi {
	const apiBase = trimBase(options.baseUrl ?? DEFAULT_API_BASE_URL);
	const embedBase = trimBase(options.embedBaseUrl ?? DEFAULT_EMBED_BASE_URL);
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const authHeaders = { authorization: `Bearer ${options.apiKey}` };

	return {
		usage(range, groupByModel) {
			const query = groupByModel ? `?range=${range}&group_by=model` : `?range=${range}`;
			return callJson<UsageReport>(fetchImpl, `${apiBase}/api/usage${query}`, { headers: authHeaders }, "usage", timeoutMs);
		},
		balance() {
			return callJson<BalanceReport>(fetchImpl, `${apiBase}/api/balance`, { headers: authHeaders }, "balance", timeoutMs);
		},
		tags() {
			// Public catalogue: no bearer, so this call cannot leak the key to a
			// surface that does not need it.
			return callJson<TagsReport>(fetchImpl, `${apiBase}/api/tags`, {}, "models", timeoutMs);
		},
		async localModels() {
			const tags = await callJson<TagsReport>(fetchImpl, `${embedBase}/api/tags`, {}, "local models", timeoutMs);
			return (tags.models ?? []).map((model) => model.name);
		},
		async embed(input) {
			let model = options.embedModel;
			if (model === undefined || model === "") {
				const installed = await this.localModels();
				model = installed.find((name) => name.toLowerCase().includes("embed"));
				if (model === undefined) throw new NoEmbeddingModelError(embedBase, installed);
			}
			const report = await callJson<EmbedReport>(
				fetchImpl,
				`${embedBase}/api/embed`,
				{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, input }) },
				"embed",
				timeoutMs,
			);
			return { ...report, model: report.model ?? model };
		},
	};
}
