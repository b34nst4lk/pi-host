# Working notes for agents in this repo

Host for a durable agent harness: TypeScript daemon (`src/`) that steers pi-durable
conversations from Matrix, plus `wall/` — a read-only Gleam/lustre dashboard over the
ledger. Gate: `npm run gates` = `typecheck` + `test` (vitest) + `fsize` + `wall:test`
(`cd wall && gleam test`). Toolchains come from the host-seeded `/opt/toolchains`
(`gleam`, `gh`) on `PATH`; `./build.sh` regenerates the committed `wall/assets` (host
only — container paths leak into the bundle), `wall/build/` is not committed.

## Skills

Read `skills/<name>/SKILL.md` when its trigger fires. `skills/README.md` is the index.

- `skills/ponytail/SKILL.md` — default posture for code work: the smallest complete
  change, and the review checklist.
- `skills/deslopping/SKILL.md` — stripping AI tells from code and prose.
- `skills/thermonuclear-review/SKILL.md` — the strict structural gate before a push.

## House rules that outrank the skills

- Never commit, push, restart a container or deploy unless the user asks for it in that
  message; report the commands instead.
- The ledger is read-only: `readOnly:true`, `PRAGMA query_only=1`, `busy_timeout=2000`.
  Never crash on a bad record — degrade to `null` / `"unknown"`.
- Zero runtime npm dependencies; strict TypeScript, tabs, `.ts` import extensions.
- Every file stays under ~5,000 tokens (≈20,000 characters). A file that wants to grow
  past that must be split along its module boundary, not padded. `npm run fsize`
  measures (`src/`, `tests/`, `wall/src/`, `wall/test/`, the wall's `index.html`) and
  fails over the limit; 4,000 is the warn line.
- Secrets live in `/dev/shm` and `/run/secrets` (nothing secret is stored under the repo
  itself) and are never read, echoed or copied. The one persistent exception is the
  GitHub PAT at `~/.secrets/pi-host/github_token`; the daemon never reads it and only
  gets the `gh` config dir path (`PI_HOST_GH_CONFIG_DIR`).
- `main` is merge-only: never push to `main`, open a PR. GitHub still enforces this on
  public repos only (rulesets need GitHub Pro on private ones) — the rule binds
  regardless of what the server would allow.
