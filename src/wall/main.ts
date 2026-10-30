// Process entry point: read the environment, build the three pieces, listen.
//
// Nothing here is clever. The container runs this as `node src/wall/main.ts`, so the
// defaults must work inside the compose service with only `WALL_*` set, and SIGTERM
// from `docker stop` must exit 0 promptly (the service is `restart: unless-stopped`,
// so a hung process is a hung deploy).
import { createLedger } from "./ledger.ts";
import { createSpend } from "./spend.ts";
import { createWallServer } from "./server.ts";

export type WallConfig = {
	port: number;
	host: string;
	dbPath: string;
	logPath: string;
	assetsDir: string;
	apiBase: string;
	keyFile: string | null;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): WallConfig {
	return {
		port: numberOr(env.WALL_PORT, 8091),
		host: env.WALL_HOST ?? "0.0.0.0",
		dbPath: env.WALL_DB ?? env.PI_HOST_DB ?? "storage/session.sqlite",
		logPath: env.WALL_LOG ?? env.PI_HOST_LOG ?? "storage/daemon.log",
		assetsDir: env.WALL_ASSETS ?? "wall/assets",
		apiBase: env.OLLAMA_API_BASE ?? "https://ollama.com",
		// The key is a mounted secret: never logged, never in argv. The env var is the
		// escape hatch for local runs; the file is the container's path.
		keyFile: env.WALL_OLLAMA_KEY_FILE ?? "/run/secrets/ollama_key",
	};
}

function numberOr(raw: string | undefined, fallback: number): number {
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function startWall(config: WallConfig = readConfig()): ReturnType<typeof createWallServer> {
	const ledger = createLedger({ dbPath: config.dbPath, logPath: config.logPath });
	const spend = createSpend({
		apiBase: config.apiBase,
		apiKey: process.env.OLLAMA_API_KEY ?? null,
		keyFile: config.keyFile ?? undefined,
	});
	const server = createWallServer({ ledger, spend, assetsDir: config.assetsDir });
	server.listen(config.port, config.host, () => {
		// One line, no key material: the only thing an operator needs from the log.
		console.log(
			`pi-wall listening on ${config.host}:${config.port} db=${config.dbPath} assets=${config.assetsDir}`,
		);
	});
	return server;
}

if (import.meta.main) {
	const server = startWall();
	const shutdown = (signal: string) => {
		console.log(`pi-wall ${signal}: closing`);
		server.close(() => process.exit(0));
		// A wedged keep-alive socket must not keep the container alive.
		setTimeout(() => process.exit(0), 3000).unref();
	};
	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}
