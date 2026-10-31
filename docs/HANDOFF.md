# pi-host — knowledge handoff

One page to orient a fresh session. Everything else hangs off pointers from here.
Ops truth lives in the homeserver doc (`~/home_server/docs/009-pi-host/README.md`);
numbered lessons in `docs/plan-and-lessons.md` (read its table first); house rules
the agents live by in root `AGENTS.md`.

## What pi-host is (60 seconds)

`@pi-spike:jacks.im` = a durable coding agent owning one sqlite ledger
(`storage/session.sqlite`, WAL) and one Matrix sync. Steered from Matrix rooms;
spawns named subagent children (worktree-default, `git worktrees/<name>`) and
per-project conversations (room-per-project). Survives `kill -9`: every turn,
cursor, and reply is a ledger transaction; resume replays. The Wall
(`dash.jacks.im`, `wall/` in Gleam/Lustre) is a **read-only** dashboard over the
same ledger. Containers: `pi-host` (the daemon, rw) + `pi-wall` (all mounts ro).

## Live state (as of 2026-10-30)

- Repo: `~/hermes-users/jacksim/workspace/projects/pi-host/` (moved there today —
  same pattern as every project; mounted in-container at `/opt/pi-host`, *also*
  visible via the projects mount as `/opt/projects/pi-host`). GitHub:
  `github.com/b34nst4lk/pi-host` (private, branch `main`).
- Containers (compose: `deploy/docker-compose.yml`): `pi-host:runtime`
  (node:26-slim + git 2.47.3, user 1000:1000) on network
  `home_server_home_server-network`; conduit at `http://conduit:6167` internal.
- Room map: **pi-steer** `!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU` =
  pi-spike's configured room **and** (jack's choice) the **pi-host project's**
  bound room — double-bound; plain text there currently goes to the pi-host
  project (bound-wins rule, §open-items). **pi-host** `!8xh0NTVC8KAY2YFDHM5WBzh6OtvxjK99HnCbjGxcKZM`
  = jack's separate fresh room for pi-host (currently unbound, silent).
  **fourier** `!YWb7NkaPRWgej133TSq7JCcJ7q4CmIxX9QNH3O6D3OU` = the fourier project.
  Other rooms = silently ignored; only `@jacksim:jacks.im` may steer
  (`MATRIX_ALLOWED_USERS`).
- Registry (ledger `app.projects`, as of 2026-10-31): fourier → conv 6884, cwd
  `/opt/projects/fourier`; pi-host → conv 6954, cwd `/opt/projects/pi-host`;
  pr-review-workflow → conv 7139, room `!lCBs2Rcgt_wsaTMmqI_wNmeLb1_GGKSDcrcFQGGvZN8`,
  cwd `/opt/pi-host/projects/pr-review-workflow` (nested INSIDE the pi-host
  repo — see open-items; zero commits yet).
- Anchors: all 6 running (4 subagent + 6883/6953 project) after today's fix
  (§decisions d20). Model: `deepseek-v4.1-flash` @ `https://ollama.com/v1`;
  subagent default `glm-5.3-flash`, max turns 40 (env-overridable).
- Ledger ~3.4k entries; spend/status endpoints on the Wall read-only. E2EE
  rooms are NOT decryptable (v0 limitation, documented; fourier's bind was
  first attempted in an encrypted room and failed silently).

## Architecture in one screen

- **One-owner rule**: exactly one process may write `storage/session.sqlite`.
  The Wall reads it read-only (WAL). Never run two writers.
- Inbound: sync → `classifySyncBatch` (skip/steer) → room router
  (`src/rooms.ts`, pure `routeRoom`) → `parseMatrixCommand` (`src/core/steer.ts`).
  Commands (`/project`, `/stop`, `/status`, `/usage`, `/balance`, `/models`,
  `/note`, `/embed`) never reach background work; plain text = steer/input with
  follow-up queueing when busy. Every accepted message gets an 👀 reaction; all
  replies thread via `m.in_reply_to`.
- Outbound: per-room durable reply pumps (`app.steer-cursor` = union of entry
  ids — union was a fix, see lessons). Per-room `lastInbound` (read at
  send-time) decides threading.
- Subagents: `src/subagents.ts` + `src/anchor.ts` — spawn with `background:true`,
  hold on completion for report delivery, `reported[]` exactly-once; worktree
  default (non-git cwd fails loud). `SUBAGENT_*` env can override.
- Projects: `src/projects.ts` — `/project new|bind|list`; project agent =
  anchored conversation, own cwd/instructions, no subagent tool. Anchor tasks
  must ship **with** their extension (§decisions d20).

## File map (one line each)

- `src/daemon.ts` — wiring: env, projects, registry, pumps, tasks, Matrix client.
- `src/extensions.ts` — pi-durable harness extension set (CodingTools, subagent
  tools/limits, projects, provider).
- `src/core/steer.ts` — the pure steer grammar (command map, reply-pump logic).
- `src/rooms.ts` — room router + `routeRoom` + shared-room selector stub.
- `src/sync-loop.ts` — Matrix sync + classify + mid-run invites (auto-join).
- `src/projects.ts` — project model + anchor task + registry doc writes.
- `src/subagents.ts`, `src/anchor.ts` — subagent spawn/stop/status/delivery.
- `src/env.ts` — `createAgentEnv` + `TimeoutEnv` (15-min default; SDK timeouts
  are SECONDS — converted once, at the boundary; §lessons 6).
- `src/provider.ts`, `src/ollama_api.ts`, `src/core/ollama-format.ts` — Ollama
  Cloud model wiring + `/usage`/`/balance`/`/models` surfaces.
- `wall/` — Gleam/Lustre dashboard: `src/wall/ledger.ts` (read-only reader),
  `document-replay.ts`, `vitals.ts`, `*.gleam` views; `CONTRACT.md` = the
  endpoint/enum truth; `build.sh` = the host-side build (assets committed).
- `scripts/run-container-daemon.sh`, `run-host-daemon.sh` — the runners
  (container one is what compose calls).
- `tests/` — vitest (the pure logic); `wall/tests` + `gleam test` for the wall.
- `docs/plan-and-lessons.md` — the 17 numbered lessons (READ FIRST).
- `THERMONUCLEAR-REVIEW.md`, `skills/` — pi-spike's self-review regime.

## Ops runbook

- Restart daemon: `docker restart pi-host` (ledger resumes; watch
  `docker logs pi-host --tail`).
- Redeploy with rebuild: `docker compose -f deploy/docker-compose.yml up -d
  --force-recreate pi-host`. Wall asset change: `wall/build.sh` first, then
  `--force-recreate pi-wall`.
- Bind a project: create a **non-encrypted** Matrix room, invite the bot,
  send `/project bind <name> <repo>` in that room (self-implicit: the bind
  binds the room you type in). Rebind = same command from the right room
  (upsert). `/project list` reads the registry.
- Read the ledger (read-only!): `sqlite3 "file:storage/session.sqlite?mode=ro"`.
  Documents = base+delta revisions — parse defensively (see wall/ledger.ts).
- Reboot: `/dev/shm` is wiped — re-stage secrets into `/dev/shm/pi-host/`
  (0600) before anything; never in argv/files/chat (§decisions d5).
- Backup: `restic` covers the tree; quiesce the daemon for a consistent
  sqlite snapshot (`docker stop pi-host` → snapshot → `start`) — pending
  verification (§open-items).

## Decision ledger (short form; details in the lessons + commits)

1. pi-durable vendored (1.3.0 pins, `vendor/`), never built in-tree.
2. Daemon = the only ledger owner AND the only Matrix client.
3. Worktree-default subagents; auto-commit per work; explicit merge only.
4. Room-per-project with direct routing (no relay through pi-spike).
5. Secrets: tmpfs env only (`/dev/shm/pi-host` → container `/run/secrets:ro`).
6. Wall is read-only; controls go through rooms, never the ledger.
7. Review protocol: pi-spike authors + gates; jack (or the supervising session)
   reviews adversarially, commits, restarts containers.
8. `NODE_OPTIONS=--dns-result-order=ipv4first` (IPv6 edge lesson).
9. Steering room = pi-steer; agent answers thread off live `lastInbound`.
10. Union-semantics steer cursor (spam-proof); sync cursor per room.
11. Mid-run invites auto-join; unbound rooms stay silent.
12. fsize gate: no file > 5,000 tokens (chars/4 heuristic; `scripts/fsize.mjs`).
13. Gleam targets javascript only; wall has zero npm deps.
14. Exec-timeout wrap default 15 min (d6 in src/env.ts).
15. Container user 1000:1000; `restart: unless-stopped`.
16. AGENTS.md re-read per request = living instructions, not frozen state.
17. Project cwd = umbrella dir; instructions_path pointer only; registry rows
    never embed conversation state (that lives in anchors/entries).
18. Reply pumps restart on every successful bind (pump wiring is derived).
19. `/stop` touches only the conversation its room routes to.
20. (today) Task definitions ship **with** their pi-durable extension — the
    missing `projects.anchor` wiring left project anchors `pending` forever;
    fixed in `src/projects.ts` extension (`tasks: [anchorTask]`).

## Open items (designed, not built)

- **Shared-room selector (started today, reverted RED)**: pi-steer is both
  pi-spike's room and pi-host's; plain text must keep flowing to pi-spike and
  `@pi-host …` address the project. First cut edited `src/rooms.ts`
  (`parseAgentSelector`) + tests; tests exposed that the router target line,
  not the command source, decides plain-text flow in double-bound rooms —
  reverted to HEAD, kept RED intent here so it can be finished deliberately.
  Registry row for pi-host = pi-steer room (jack's call, keep it).
- **Daily digest**: `defineTask` + `sleepUntil` morning post (usage + balance +
  overnight summary) to pi-steer. First proactive act; design in backlog.
- **Orphan-anchor pruning** + a wall Health line for unnamed anchors.
- **control surface** (`@dash`): needs `create-user dash` + `reset-password` via
  `@conduit:jacks.im`, token staged to `/dev/shm/pi-host/dash_token`,
  `MATRIX_ALLOWED_USERS` updated, compose env added.
- **`/embed` fix**: host Ollama needs `OLLAMA_HOST=0.0.0.0` + two scoped ufw
  allows (bridge→host is dropped; see ollama-loopback-investigation.md).
- **Backup consistency** for the ledger (quiesce or `sqlite3 .backup`).
- **pr-review-workflow's cwd is nested inside the pi-host repo**
  (`/opt/pi-host/projects/…`): it works, but it mixes a project tree into the
  daemon's own repo (blocks `git add -A` with its zero-commit git init; its
  branch has nothing to merge). Decide: relocate to `/opt/projects/`
  (`mv` + `/project bind pr-review-workflow /opt/projects/pr-review-workflow`
  from its room, upsert) or teach agents to scaffold relative to
  `/opt/projects`.
- **E2EE** (deferred) and **sentinel/watchman git-poll** (deferred).

## Gotchas (the ones that cost real time)

- Model reports are claims; the ledger is ground truth.
- `npx tsc` installs a decoy — use `./node_modules/.bin/tsc`.
- Host node = 22.22.1 (no type-stripping) → always `tsx`.
- Distro npm 9 breaks → `npx --yes npm@latest`.
- SDK exec timeouts are SECONDS; `TimeoutEnv` converts once.
- Docker entrypoint vs command collision (§lessons 4) — compose sets both.
- Restart wipes nothing; reboot wipes `/dev/shm` (secrets!).
- Encrypted rooms = unreadable; keep steering rooms non-encrypted.
- A gate chain must end with `set -euo pipefail` or explicit aborts — a
  failing vitest piped into grep once let an ungated restart through (today).