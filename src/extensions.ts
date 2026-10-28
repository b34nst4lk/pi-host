// The host's extension wiring: registry + the steer agent's system prompt
// section + built-in coding tools. pi-durable extensions bundle tools,
// sections, hooks, and tasks; this registry is handed to Harness.open.
// (pi CLI extensions/skills/MCP do NOT flow into durable conversations —
// surface tools here instead.)
import { createRegistry, defineExtension, section } from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";

export function createSteerRegistry() {
	const registry = createRegistry();
	registry.install(CodingTools); // read, write, edit, bash — run through the Harness env (src/env.ts)
	registry.install(
		defineExtension({
			name: "steer",
			sections: [
				section(
					"preamble",
					() =>
						"You are a persistent build-steer agent in a durable harness, steered from a Matrix room. " +
						"You have read, write, edit, and bash tools; they run inside your workspace directory, " +
						"and a crash never loses your work. Keep all files and commands inside your workspace. " +
						"Answer tersely.",
					{ tag: false },
				),
			],
		}),
	);
	return registry;
}