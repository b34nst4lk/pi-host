// The process's configuration and its two logs, read once at boot.
//
// `env` is the whole of what the daemon takes from the environment, with the
// defaults spelled out; `preflight` turns a missing secret into ONE line naming
// every missing piece and exit code 2, rather than a crash hours later on the
// first message. `log` goes to stdout; `journal` appends a timestamped line to
// `PI_HOST_LOG` (the wall's health card reads that file), so a transport event
// survives a daemon started by hand with nobody watching stdout.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const log = (...parts: unknown[]): void => console.log("[pi-host]", ...parts);

/** One line of an error, for the journal. */
export const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const journalPath = process.env.PI_HOST_LOG ?? "./storage/daemon.log";

/** Append one timestamped transport line. A journal that cannot be written never throws. */
export function journal(line: string): void {
	try {
		appendFileSync(journalPath, `${new Date().toISOString()} pi-host transport ${line}\n`);
	} catch {
		// A journal that cannot be written must never take the daemon down.
	}
}

/**
 * The push config dir, read from `PI_HOST_GH_CONFIG_DIR` ONLY. Never from the
 * daemon's own `GH_CONFIG_DIR`: a tool exec inherits the daemon's process env, so
 * a `GH_CONFIG_DIR` set here would hand every conversation the credential and the
 * per-project push flag would mean nothing. The runner exports the dir under this
 * name on purpose (`scripts/run-container-daemon.sh`).
 */
export function ghConfigDirFrom(source: NodeJS.ProcessEnv): string {
	return source.PI_HOST_GH_CONFIG_DIR ?? "";
}

export type DaemonEnv = typeof env;

export const env = {
	homeserver: process.env.MATRIX_HOMESERVER ?? "http://conduit:6167",
	accessToken: process.env.MATRIX_ACCESS_TOKEN ?? "",
	room: process.env.MATRIX_ROOM ?? "",
	allowedUsers: (process.env.MATRIX_ALLOWED_USERS ?? "")
		.split(",")
		.map((user) => user.trim())
		.filter(Boolean),
	ollamaApiKey: process.env.OLLAMA_API_KEY ?? "",
	ollamaModel: process.env.OLLAMA_MODEL ?? "deepseek-v4.1-flash",
	// The subagent model is separate from the main one and must also be registered
	// on the provider (see `extraModels`), or spawns fail `no_model`.
	subagentModel: process.env.SUBAGENT_MODEL ?? "glm-5.3-flash",
	ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "https://ollama.com/v1",
	ollamaEmbedBaseUrl: process.env.OLLAMA_EMBED_BASE_URL ?? "http://127.0.0.1:11434",
	ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? "",
	contextWindow: Number(process.env.OLLAMA_CONTEXT_WINDOW ?? 131072),
	maxTokens: Number(process.env.OLLAMA_MAX_TOKENS ?? 16384),
	db: process.env.PI_HOST_DB ?? "./storage/session.sqlite",
	sandbox: process.env.PI_HOST_SANDBOX ?? "./workspace",
	// Where `/project new` puts a project that names no path. Sibling of the
	// sandbox, so a project is never inside the umbrella it spawns from.
	projectsDir: process.env.PROJECTS_DIR ?? resolve(process.env.PI_HOST_SANDBOX ?? "./workspace", "..", "projects"),
	// One turn budget per child message; `subagent`'s `maxTurns` overrides it.
	subagentMaxTurns: Number(process.env.SUBAGENT_MAX_TURNS ?? 40),
	// The `gh` config dir the runner authed at startup; see `ghConfigDirFrom` below
	// for why the name is PI_HOST_* and not GH_CONFIG_DIR. Empty = no push on this host.
	ghConfigDir: ghConfigDirFrom(process.env),
};

/**
 * Fail fast: one line per missing piece, then exit 2. The directories the daemon
 * writes into are created here too, so nothing later has to wonder if they exist.
 */
export function preflight(env: DaemonEnv): void {
	const missing: string[] = [];
	if (!env.accessToken) missing.push("MATRIX_ACCESS_TOKEN");
	if (!env.room) missing.push("MATRIX_ROOM");
	if (env.allowedUsers.length === 0) missing.push("MATRIX_ALLOWED_USERS (refusing to let anyone/everyone steer)");
	if (!env.ollamaApiKey) missing.push("OLLAMA_API_KEY");
	if (missing.length > 0) {
		console.error(`PREFLIGHT FAIL — missing env: ${missing.join(", ")}`);
		process.exit(2);
	}
	for (const requiredDir of [dirname(env.db), env.sandbox, env.projectsDir]) mkdirSync(requiredDir, { recursive: true });
}
