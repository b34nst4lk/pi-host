# Working notes for agents in this repo

Host for a durable agent harness: TypeScript daemon (`src/`) that steers pi-durable
conversations from Matrix, plus `wall/` — a read-only Gleam/lustre dashboard over the
ledger. Gates: `npm run typecheck && npm test`, and `cd wall && gleam test`; artifacts in
`wall/assets` are committed, `wall/build/` is not.

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
- Secrets live in `/dev/shm` and `/run/secrets` (`/opt/pi-host/secrets` on the host) and
  are never read, echoed or copied.
