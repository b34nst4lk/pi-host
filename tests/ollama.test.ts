// Tests for the four Ollama-facing room commands (/usage, /balance, /models,
// /embed): command parsing, the pure formatters, and the HTTP wrappers against
// a stub fetch.
//
// Fixtures are shaped from LIVE responses captured 2026-10-28, not from the docs:
//  - /api/usage reports `request_count` only on this plan (no usage_usd, no
//    token counts), and nests `groups` inside `totals` and every bucket — there
//    is no top-level `groups` and no `remainder`.
//  - /api/balance returns the LEGACY shape (included.session/weekly percents).
//  - local ollama has 6 chat models and no embedding model at all.
// The formatters must therefore treat every metric as optional.
import { describe, expect, it } from "vitest";
import { parseMatrixCommand } from "../src/core/steer.ts";
import {
	compactNumber,
	formatBalance,
	formatEmbed,
	formatModels,
	formatUsage,
	formatUsd,
	stamp,
} from "../src/core/ollama-format.ts";
import { createOllamaApi, NoEmbeddingModelError } from "../src/ollama_api.ts";

// --- fixtures: live shapes ---

/** What ollama.com actually returns today: request counts only, groups nested in totals. */
const usageLive = {
	range: "7d",
	scope: "self",
	granularity: "day",
	group_by: "model",
	from: "2026-10-22T00:00:00Z",
	until: "2026-10-29T02:44:37.281801024Z",
	totals: {
		request_count: 6130,
		groups: [
			{ model: "deepseek-v4.1-flash:1017", request_count: 3221 },
			{ model: "glm-5.3-flash", request_count: 1472 },
			{ model: "glm-5.3", request_count: 771 },
			{ model: "glm-5.2", request_count: 383 },
			{ model: "deepseek-v4-pro:0813", request_count: 136 },
			{ model: "web_fetch", request_count: 95 },
			{ model: "web_search", request_count: 52 },
		],
	},
	buckets: [
		{ from: "2026-10-22T00:00:00Z", until: "2026-10-23T00:00:00Z", request_count: 149 },
		{ from: "2026-10-23T00:00:00Z", until: "2026-10-24T00:00:00Z", request_count: 443 },
		{ from: "2026-10-29T00:00:00Z", until: "2026-10-29T02:44:43.478248535Z", partial: true, request_count: 154 },
	],
};

/** The documented metered shape: USD and tokens present. Kept so the formatter is ready for it. */
const usageMetered = {
	range: "24h",
	scope: "self",
	granularity: "hour",
	from: "2026-10-28T02:00:00Z",
	until: "2026-10-29T02:44:30.148788471Z",
	totals: {
		request_count: 942,
		usage_usd: 1.8342,
		input_tokens: 1570574,
		cached_input_tokens: 1200000,
		output_tokens: 756000,
	},
	buckets: [{ from: "2026-10-28T02:00:00Z", until: "2026-10-28T03:00:00Z", request_count: 17 }],
};

const balanceLegacy = {
	included: {
		session: { remaining_percent: 90.27, resets_at: "2026-10-29T05:00:00Z" },
		weekly: { remaining_percent: 33.97, resets_at: "2026-11-02T00:00:00Z" },
	},
	purchased: { balance_usd: 0 },
};

const balanceModern = {
	included: { balance_usd: 12.34, allowance_usd: 50, period: { from: "2026-10-01T00:00:00Z", until: "2026-11-01T00:00:00Z" } },
	purchased: { balance_usd: 3.5 },
};

const cloudTags = {
	models: [
		{ name: "mistral-large-4", capabilities: ["completion", "thinking", "tools", "vision"] },
		{ name: "clef:27b", capabilities: ["decision", "vision"] },
		{ name: "gpt-oss:20b", capabilities: ["completion", "tools", "thinking"] },
	],
};

const localTags = { models: [{ name: "qwen3.5:4b", capabilities: ["completion", "tools"] }] };
const localTagsWithEmbed = {
	models: [
		{ name: "gemma4:e4b", capabilities: ["completion"] },
		{ name: "embeddinggemma:latest", capabilities: ["embedding"] },
	],
};

const embedReply = {
	model: "embeddinggemma:latest",
	embeddings: [[0.0123456, -0.0456789, 0.0789012, -0.0012345, 0.5, 0.25]],
	total_duration: 1234567,
	load_duration: 1000,
	prompt_eval_count: 5,
};

// --- parsing ---

describe("parseMatrixCommand: the Ollama commands", () => {
	it("defaults /usage to 24h without model grouping", () => {
		expect(parseMatrixCommand("/usage")).toEqual({ action: "usage", range: "24h", groupByModel: false });
	});

	it("takes every valid range, in any order with the models flag", () => {
		expect(parseMatrixCommand("/usage 7d")).toEqual({ action: "usage", range: "7d", groupByModel: false });
		expect(parseMatrixCommand("/usage 30d models")).toEqual({ action: "usage", range: "30d", groupByModel: true });
		expect(parseMatrixCommand("/usage models 7d")).toEqual({ action: "usage", range: "7d", groupByModel: true });
	});

	it("refuses to guess at a bad range", () => {
		expect(parseMatrixCommand("/usage 12h")).toEqual({ action: "usage-invalid", text: "12h" });
		expect(parseMatrixCommand("/usage 7d yesterday")).toEqual({ action: "usage-invalid", text: "yesterday" });
	});

	it("maps /balance and /models", () => {
		expect(parseMatrixCommand("/balance")).toEqual({ action: "balance" });
		expect(parseMatrixCommand("/models")).toEqual({ action: "models" });
	});

	it("keeps the whole /embed argument, and ignores an empty one", () => {
		expect(parseMatrixCommand("/embed hello world")).toEqual({ action: "embed", content: "hello world" });
		expect(parseMatrixCommand("/embed   ")).toBeNull();
	});

	it("still treats unknown slash text as literal input", () => {
		expect(parseMatrixCommand("/usr/bin/env")).toEqual({ action: "input", content: "/usr/bin/env" });
	});
});

// --- formatters ---

describe("compactNumber / formatUsd / stamp", () => {
	it("compacts the same way the room reports tokens", () => {
		expect(compactNumber(0)).toEqual("0");
		expect(compactNumber(999)).toEqual("999");
		expect(compactNumber(1000)).toEqual("1.0K");
		expect(compactNumber(756000)).toEqual("756.0K");
		expect(compactNumber(1570574)).toEqual("1.6M");
		expect(compactNumber(2500000000)).toEqual("2.5B");
	});

	it("formats sub-cent spend without pretending it is zero", () => {
		expect(formatUsd(1.8342)).toEqual("$1.83");
		expect(formatUsd(0)).toEqual("$0.00");
		expect(formatUsd(0.004)).toEqual("<$0.01");
	});

	it("stamps an ISO instant without seconds or fractional digits", () => {
		expect(stamp("2026-10-29T02:44:43.478248535Z")).toEqual("2026-10-29T02:44");
		expect(stamp("2026-10-22T00:00:00Z")).toEqual("2026-10-22T00:00");
	});
});

describe("formatUsage", () => {
	it("reports live request counts without inventing USD or token numbers", () => {
		const lines = formatUsage(usageLive);
		expect(lines[0]).toEqual("usage 7d · 2026-10-22→2026-10-29 · day · 6130 req");
		expect(lines.some((line) => line.includes("$"))).toEqual(false);
		expect(lines.some((line) => line.includes("tokens in") || line.includes(" in "))).toEqual(false);
	});

	it("lists the top five model groups, ranked, and nothing more", () => {
		const lines = formatUsage(usageLive);
		const groups = lines.filter((line) => /^#\d /.test(line));
		expect(groups.length).toEqual(5);
		expect(groups[0]).toEqual("#1 deepseek-v4.1-flash:1017 · 3221 req");
		expect(groups[4]).toEqual("#5 deepseek-v4-pro:0813 · 136 req");
	});

	it("ends with the current bucket, marked partial when the window is still open", () => {
		const lines = formatUsage(usageLive);
		expect(lines[lines.length - 1]).toEqual("latest 2026-10-29T00:00 (partial) · 154 req");
	});

	it("uses the metered metrics when the plan reports them", () => {
		const lines = formatUsage(usageMetered);
		expect(lines[0]).toEqual("usage 24h · 2026-10-28T02:00→2026-10-29T02:44 · hour · 942 req · $1.83");
		expect(lines[1]).toEqual("tokens 1.6M in (1.2M cached) · 756.0K out");
		expect(lines[lines.length - 1]).toEqual("latest 2026-10-28T02:00 · 17 req");
	});

	it("survives an empty report without groups or buckets", () => {
		const lines = formatUsage({ range: "7d", totals: { request_count: 0 }, buckets: [] });
		expect(lines).toEqual(["usage 7d · 0 req"]);
	});

	it("survives a report with no totals at all", () => {
		expect(formatUsage({ range: "30d" })).toEqual(["usage 30d · 0 req"]);
	});
});

describe("formatBalance", () => {
	it("renders the legacy percent shape this account actually returns", () => {
		expect(formatBalance(balanceLegacy)).toEqual(
			"balance · session 90.3% left (resets 2026-10-29T05:00) · weekly 34.0% left (resets 2026-11-02T00:00) · purchased $0.00",
		);
	});

	it("renders the metered shape with its allowance period", () => {
		expect(formatBalance(balanceModern)).toEqual(
			"balance · included $12.34 of $50.00 · 2026-10-01→2026-11-01 · purchased $3.50",
		);
	});

	it("does not invent fields the response omits", () => {
		expect(formatBalance({ purchased: { balance_usd: 0 } })).toEqual("balance · purchased $0.00");
		expect(formatBalance({})).toEqual("balance · no balance reported");
	});
});

describe("formatModels", () => {
	it("lists name plus capabilities and notes the total", () => {
		const lines = formatModels(cloudTags);
		expect(lines[0]).toEqual("models 3");
		expect(lines[1]).toEqual("mistral-large-4 [completion thinking tools vision]");
		expect(lines[2]).toEqual("clef:27b [decision vision]");
	});

	it("caps the listing and says so", () => {
		const many = { models: Array.from({ length: 23 }, (_, index) => ({ name: `m${index}`, capabilities: ["completion"] })) };
		const lines = formatModels(many, 20);
		expect(lines[0]).toEqual("models 23 (showing 20)");
		expect(lines.length).toEqual(21);
	});

	it("shows a model with no capabilities as an empty bracket, not a crash", () => {
		expect(formatModels({ models: [{ name: "bare" }] })[1]).toEqual("bare []");
	});

	it("handles an empty list", () => {
		expect(formatModels({ models: [] })).toEqual(["models 0"]);
	});
});

describe("formatEmbed", () => {
	it("reports model, dims, input count and only the first four values", () => {
		expect(formatEmbed(embedReply, 1)).toEqual(
			"embed embeddinggemma:latest · 6 dims · 1 input · eval 5 · [0.0123, -0.0457, 0.0789, -0.0012] (first 4 of 6)",
		);
	});

	it("drops the truncation note when the vector is short enough to show whole", () => {
		const short = { model: "m", embeddings: [[0.5, -0.25]], prompt_eval_count: 2 };
		expect(formatEmbed(short, 1)).toEqual("embed m · 2 dims · 1 input · eval 2 · [0.5000, -0.2500]");
	});

	it("omits eval when the response does not report it", () => {
		expect(formatEmbed({ model: "m", embeddings: [[1, 0, 0]] }, 1)).toEqual("embed m · 3 dims · 1 input · [1.0000, 0.0000, 0.0000]");
	});
});

// --- HTTP wrappers against a stub fetch ---

type Call = { url: string; init?: RequestInit };

function stubFetch(respond: (call: Call) => Response | Promise<Response>, calls: Call[]): typeof fetch {
	return (async (url: string | URL | Request, init?: RequestInit) => {
		const call = { url: String(url), init };
		calls.push(call);
		return respond(call);
	}) as typeof fetch;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("createOllamaApi", () => {
	it("calls /api/usage with the range and an optional group_by, authorized", async () => {
		const calls: Call[] = [];
		const api = createOllamaApi({
			apiKey: "key-123",
			baseUrl: "https://ollama.com/v1", // the provider base; the API root is derived by stripping /v1
			fetchImpl: stubFetch(() => json(usageLive), calls),
		});
		await api.usage("7d", false);
		await api.usage("30d", true);
		expect(calls[0].url).toEqual("https://ollama.com/api/usage?range=7d");
		expect(calls[1].url).toEqual("https://ollama.com/api/usage?range=30d&group_by=model");
		expect(JSON.stringify(calls[0].init?.headers)).toContain("Bearer key-123");
	});

	it("calls /api/balance with no query parameters", async () => {
		const calls: Call[] = [];
		const api = createOllamaApi({ apiKey: "key-123", fetchImpl: stubFetch(() => json(balanceLegacy), calls) });
		const report = await api.balance();
		expect(calls[0].url).toEqual("https://ollama.com/api/balance");
		expect(report).toEqual(balanceLegacy);
	});

	it("surfaces the server error text and the status", async () => {
		const api = createOllamaApi({
			apiKey: "key-123",
			fetchImpl: stubFetch(() => json({ error: "invalid range" }, 400), []),
		});
		await expect(api.usage("7d", false)).rejects.toThrow(/HTTP 400.*invalid range/);
	});

	it("tells the room how long to wait when rate limited", async () => {
		const api = createOllamaApi({
			apiKey: "key-123",
			fetchImpl: stubFetch(() => json({ error: "rate limited" }, 429, { "retry-after": "30" }), []),
		});
		await expect(api.usage("7d", false)).rejects.toThrow(/HTTP 429.*retry-after 30s/);
	});

	it("fetches /api/tags without an auth header (the cloud catalogue is public)", async () => {
		const calls: Call[] = [];
		const api = createOllamaApi({ apiKey: "key-123", fetchImpl: stubFetch(() => json(cloudTags), calls) });
		const tags = await api.tags();
		expect(calls[0].url).toEqual("https://ollama.com/api/tags");
		expect(JSON.stringify(calls[0].init?.headers ?? {})).not.toContain("Bearer");
		expect(tags.models?.length).toEqual(3);
	});

	it("embeds against the local server, autodetecting an *embed* model", async () => {
		const calls: Call[] = [];
		const api = createOllamaApi({
			apiKey: "key-123",
			embedBaseUrl: "http://127.0.0.1:11434",
			fetchImpl: stubFetch((call) => (call.url.includes("/api/tags") ? json(localTagsWithEmbed) : json(embedReply)), calls),
		});
		const result = await api.embed("hello");
		expect(result.model).toEqual("embeddinggemma:latest");
		const post = calls.find((call) => call.url.includes("/api/embed"));
		expect(post?.url).toEqual("http://127.0.0.1:11434/api/embed");
		expect(post?.init?.method).toEqual("POST");
		expect(JSON.parse(String(post?.init?.body))).toEqual({ model: "embeddinggemma:latest", input: "hello" });
	});

	it("honours an explicit embedding model without listing the local catalogue", async () => {
		const calls: Call[] = [];
		const api = createOllamaApi({
			apiKey: "key-123",
			embedModel: "nomic-embed-text",
			fetchImpl: stubFetch(() => json({ ...embedReply, model: "nomic-embed-text" }), calls),
		});
		const result = await api.embed("hello");
		expect(result.model).toEqual("nomic-embed-text");
		expect(calls.length).toEqual(1);
		expect(JSON.parse(String(calls[0].init?.body)).model).toEqual("nomic-embed-text");
	});

	it("says so plainly when the local server has no embedding model", async () => {
		const api = createOllamaApi({ apiKey: "key-123", fetchImpl: stubFetch(() => json(localTags), []) });
		await expect(api.embed("hello")).rejects.toBeInstanceOf(NoEmbeddingModelError);
		await expect(api.embed("hello")).rejects.toThrow(/ollama pull embeddinggemma/);
	});
});
