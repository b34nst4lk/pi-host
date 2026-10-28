// The host's extension wiring: registry + the steer agent's system prompt
// section. pi-durable extensions bundle tasks, tools, sections, and hooks;
// this registry is handed to Harness.open. (pi CLI extensions/skills/MCP do
// NOT flow into durable conversations — surface your tools here instead.)
import { createRegistry, defineExtension, section } from "@earendil-works/pi-durable";

export function createSteerRegistry() {
	const registry = createRegistry();
	registry.install(
		defineExtension({
			name: "steer",
			sections: [section("preamble", () => "You are a build-steer agent in a durable harness. Answer tersely.", { tag: false })],
		}),
	);
	return registry;
}