// Ollama Cloud provider factory for pi-host — param-ized version of the
// spike's ollama_driver.ts factory (that artifact stays untouched as evidence;
// see blog audit 2 for the lessons it encodes: the auth resolver must sit
// under provider.auth.apiKey, and openAICompletionsApi must come from the
// lazy module).
import { createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

export type OllamaCloudOptions = {
	/** Ollama Cloud API key (env-staged by the caller; never a file or argv here). */
	readonly apiKey: string;
	readonly model: string;
	readonly baseUrl: string;
	readonly contextWindow: number;
	readonly maxTokens: number;
};

export function ollamaCloudProvider(options: OllamaCloudOptions) {
	return createProvider<"openai-completions">({
		id: "ollama-cloud",
		name: "Ollama Cloud",
		baseUrl: options.baseUrl,
		auth: {
			apiKey: {
				name: "Ollama Cloud API key",
				login: async () => {
					throw new Error("pi-host expects OLLAMA_API_KEY in the environment");
				},
				resolve: async () =>
					options.apiKey
						? { auth: { apiKey: options.apiKey }, source: "OLLAMA_API_KEY env" }
						: undefined,
			},
		},
		models: [
			{
				id: options.model,
				name: options.model,
				api: "openai-completions",
				provider: "ollama-cloud",
				baseUrl: options.baseUrl,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: options.contextWindow,
				maxTokens: options.maxTokens,
			},
		],
		api: openAICompletionsApi(),
	});
}