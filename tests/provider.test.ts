// Provider factory tests — the regression suite for the 2026-10-28 no_model
// incident: a whole-env object passed as OllamaCloudOptions built a provider
// whose model id was undefined, and every generation failed "no_model".
import { describe, expect, it } from "vitest";
import { createModels } from "@earendil-works/pi-ai/models";
import { ollamaCloudProvider } from "../src/provider.ts";

const full = { apiKey: "k", model: "deepseek-v4.1-flash", baseUrl: "https://ollama.com/v1", contextWindow: 32768, maxTokens: 4096 };

describe("ollamaCloudProvider", () => {
	it("registers a model that getModel resolves (the no_model regression)", () => {
		const models = createModels();
		models.setProvider(ollamaCloudProvider(full));
		const found = (models as unknown as { getModel: (p: string, m: string) => unknown }).getModel("ollama-cloud", "deepseek-v4.1-flash");
		expect(found).not.toBeUndefined();
	});
	it("fails fast on missing or empty options instead of building a broken provider", () => {
		expect(() => ollamaCloudProvider({ ...full, model: "" })).toThrow(/missing or empty option\(s\): model/);
		expect(() => ollamaCloudProvider({ ...full, apiKey: "" })).toThrow(/apiKey/);
		expect(() => ollamaCloudProvider({ ...full, baseUrl: undefined as unknown as string })).toThrow(/baseUrl/);
		expect(() => ollamaCloudProvider({ ...full, extraModels: ["  "] })).toThrow(/extraModels/);
	});

	it("registers extra models too, so a subagent model is never `no_model`", () => {
		const models = createModels();
		models.setProvider(ollamaCloudProvider({ ...full, extraModels: ["glm-5.3-flash", "deepseek-v4.1-flash"] }));
		const getModel = (p: string, m: string): unknown =>
			(models as unknown as { getModel: (p: string, m: string) => unknown }).getModel(p, m);
		expect(getModel("ollama-cloud", "deepseek-v4.1-flash")).not.toBeUndefined();
		expect(getModel("ollama-cloud", "glm-5.3-flash")).not.toBeUndefined();
	});
});