// `/usage`, `/balance`, `/models` and `/embed`: account spend, credit, the model
// catalogue, and local embeddings.
//
// Exactly one upstream call per command — `/api/usage` and `/api/balance` are
// limited to 10 req/min per user across keys, so these are never polled or retried
// in a loop. Rendering is pure (core/ollama-format.ts). A local server without an
// embedding model is a state to report plainly, not an API failure, so it answers
// without the ❌.
import { formatBalance, formatEmbed, formatModels, formatUsage, USAGE_RANGES } from "./core/ollama-format.ts";
import type { MatrixCommand } from "./core/steer.ts";
import { NoEmbeddingModelError, type OllamaApi } from "./ollama_api.ts";

export type CommandReply = (text: string) => Promise<void>;

export type OllamaCommandDeps = {
	readonly api: Pick<OllamaApi, "usage" | "balance" | "tags" | "embed">;
	/** Send one threaded control reply into the room the command came from. */
	readonly reply: CommandReply;
	readonly log: (message: string) => void;
};

/** Answer one Ollama query command; every failure is replied, never thrown. */
export async function answerOllamaCommand(command: MatrixCommand, deps: OllamaCommandDeps): Promise<void> {
	if (command.action === "usage-invalid") {
		await deps.reply(`unknown /usage argument "${command.text}" — /usage [${USAGE_RANGES.join("|")}] [models]`);
		return;
	}
	try {
		switch (command.action) {
			case "usage":
				await deps.reply(formatUsage(await deps.api.usage(command.range, command.groupByModel)).join("\n"));
				return;
			case "balance":
				await deps.reply(formatBalance(await deps.api.balance()));
				return;
			case "models":
				await deps.reply(formatModels(await deps.api.tags()).join("\n"));
				return;
			case "embed":
				await deps.reply(formatEmbed(await deps.api.embed(command.content), 1));
				return;
			default:
				return;
		}
	} catch (error) {
		if (error instanceof NoEmbeddingModelError) {
			await deps.reply(error.message);
			return;
		}
		const message = error instanceof Error ? error.message : String(error);
		deps.log(`${command.action} failed: ${message}`);
		await deps.reply(`❌ ${message}`);
	}
}
