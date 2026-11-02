# pi-host — knowledge handoff

One page to orient a fresh session. Everything else hangs off pointers from here.
Ops truth lives in the homeserver doc (`~/home_server/docs/009-pi-host/README.md`);
the 21 numbered lessons in `docs/plan-and-lessons.md` (read §4 first); house rules
the agents live by in root `AGENTS.md`.

## What pi-host is (60 seconds)

`@pi-spike:jacks.im` = a durable coding agent owning one sqlite ledger
(`storage/session.sqlite`, WAL) and one Matrix sync. Steered from Matrix rooms;
spawns named subagent children (worktree-default, `git worktrees/<name>`) and
per-project conversations (room-per-project). Survives `kill -9`: every turn,
cursor, and reply is a ledger transaction; resume replays. The Wall
(`dash.jacks.im`, `wall/` in Gleam/Lustre) is a **read-only** dashboard over the
same ledger. Containers: `pi-host` (the daemon, rw) + `pi-wall` (all mounts ro).

## Live state (as of 2026-11-02)

- Repo: `~/hermes-users/jacksim/workspace/projects/pi-host/` (moved there today —
  same pattern as every project; mounted in-container at `/opt/pi-host`, *also*
  visible via the projects mount as `/opt/projects/pi-host`). GitHub:
  `github.com/b34nst4lk/pi-host` (private, branch `main`).
- Containers (compose: `deploy/docker-compose.yml`): `pi-host:runtime`
  (node:26-slim + git 2.47.3, user 1000:1000) on network
  `home_server_home_server-network`; conduit at `http://conduit:6167` internal.
- **Toolchain mount** (WS1, 2026-11-02): host `…/pi-host-toolchains` →
  `/opt/toolchains` (`:ro`), host-seeded (uid 1000), on the runner's `PATH`
  (`/opt/toolchains/bin`): `gleam`, `gh`. So `npm run gates` runs
  `wall:test` = `cd wall && gleam test` in-container. Self-service installs
  (agent seeds its own binaries) are still future work.
- **gh + push (WS3)**: PAT staged persistently at
  `~/.secrets/pi-host/github_token` (0600, mounted `:ro` at
  `/run/secrets-persistent/github_token` — NOT under `/run/secrets`, which is a
  read-only dir; see the WS3 lesson). The runner auths `gh` into
  `/opt/pi-host/.gh` (gitignored) at startup, runs `gh auth setup-git`, then
  hands the dir to the daemon as **`PI_HOST_GH_CONFIG_DIR`** and unsets its own
  `GH_CONFIG_DIR`: tool execs inherit the daemon's env, so a `GH_CONFIG_DIR`
  left set would give every conversation the credential. Account `b34nst4lk`,
  scoped to pi-host, fourier, pr-review-workflow, cartographer, blog.
- Room map: **pi-steer** `!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU` =
  pi-spike's configured room (plain text goes to pi-spike). **fourier**
  `!YWb7NkaPRWgej133TSq7JCcJ7q4CmIxX9QNH3O6D3OU`, **pr-review-workflow**
  `!lCBs2Rcgt_wsaTMmqI_wNmeLb1_GGKSDcrcFQGGvZN8`. Other rooms = silently
  ignored; only `@jacksim:jacks.im` may steer (`MATRIX_ALLOWED_USERS`).
- Registry (ledger `app.projects`, read 2026-11-02): ONE entry —
  **pr-review-workflow** → conversation 7139, cwd
  `/opt/projects/pr-review-workflow` (relocated out of the pi-host tree; the
  nested-path open item is closed). `fourier` (6884) and `pi-host` (6954)
  still have `app.project` markers in their conversations but no registry row,
  so those rooms are silent until rebound. **pi-steer is not bound** (the
  double-bind note is history; the shared-room selector is still open).
- Anchors: 4 subagent + project anchors 6883 / 6953 / 7145 (pr-review-workflow's
  moved with the rebind). Model: `deepseek-v4.1-flash` @
  `https://ollama.com/v1`; subagent default `glm-5.3-flash`, max turns 40
  (env-overridable). (`docs/plan-toolchains-push-subagents.md` claims
  `glm-5.2:cloud`; that switch was reverted in `4291f52` — the daemon default
  in `src/daemon-env.ts` is the truth.)
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
  default (non-git cwd fails loud). `SUBAGENT_*` env can override. A subagent is
  always a **leaf** (its child has the tools extension removed, depth 1), but
  WHO may spawn one is not just the main agent: a project agent keeps the
  subagent tool (WS4), works in `worktrees/<name>` of its own repository, and
  its report is posted into the room of the conversation that SPAWNED it
  (`roomForConversation` at send time, main room as fallback).
- Projects: `src/project-registry.ts` (the two durable docs) + `src/projects.ts`
  (`/project new|bind|push|list`); project agent = anchored conversation, own
  cwd/instructions, keeps the subagent tool. Anchor tasks must ship **with**
  their extension (§decisions d20). `/project push <name> on|off` flips the
  registry row AND the conversation's `app.project` marker in one commit; the
  daemon's env factory reads the marker per tool use and injects
  `GH_CONFIG_DIR` for that conversation only (`src/env.ts`: `gitPushFor`,
  `pushShellEnv`). The token never enters the registry or a project directory.
  Off on bind, kept across a rebind, and refused when the host has no config dir.

## File map (one line each)

- `src/daemon.ts` — wiring: env, projects, registry, pumps, tasks, Matrix client.
- `src/extensions.ts` — pi-durable harness extension set (CodingTools, subagent
  tools/limits, projects, provider).
- `src/core/steer.ts` — the pure steer grammar (command map, reply-pump logic).
- `src/rooms.ts` — room router + `routeRoom` + shared-room selector stub.
- `src/sync-loop.ts` — Matrix sync + classify + mid-run invites (auto-join).
- `src/projects.ts` — project model + anchor task + registry doc writes.
- `src/project-registry.ts` — `ProjectRecord`/`ProjectMarker` + the two docs.
- `src/subagents.ts`, `src/anchor.ts` — subagent spawn/stop/status/delivery.
- `src/env.ts` — `createAgentEnv` + `TimeoutEnv` (15-min default; SDK timeouts
  are SECONDS — converted once, at the boundary; §lessons 6) + the push
  permission (`gitPushFor`, `pushShellEnv`).
- `src/provider.ts`, `src/ollama_api.ts`, `src/core/ollama-format.ts` — Ollama
  Cloud model wiring + `/usage`/`/balance`/`/models` surfaces.
- `wall/` — Gleam/Lustre dashboard: `src/wall/ledger.ts` (read-only reader),
  `document-replay.ts`, `vitals.ts`, `*.gleam` views; `CONTRACT.md` = the
  endpoint/enum truth; `build.sh` = the host-side build (assets committed).
- `scripts/run-container-daemon.sh`, `run-host-daemon.sh` — the runners
  (container one is what compose calls).
- `tests/` — vitest (the pure logic); `wall/tests` + `gleam test` for the wall.
- `docs/plan-and-lessons.md` — the 21 numbered lessons (READ FIRST).
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
- Let a project push: `/project push <name> on` (any room; it mutates the
  registry, not a binding). It grants that project agent `GH_CONFIG_DIR`; the
  main agent and subagents never get one.
- Rotate the GitHub PAT: new token in vaultwarden → overwrite
  `~/.secrets/pi-host/github_token` → `docker restart pi-host` (the runner
  re-auths `gh`).
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
10. Union-semantics steer cursors (spam-proof, per conversation); one `/sync`
    cursor spans every room (`$`-global event ids).
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
20. (2026-10-30) Task definitions ship **with** their pi-durable extension —
    the missing `projects.anchor` wiring left project anchors `pending`
    forever; fixed in `src/projects.ts` extension (`tasks: [anchorTask]`).
21. (2026-11-02) Toolchain = a host-seeded dir mounted `:ro` and put on
    `PATH` (Q7=b), not in-image installs: one place to seed `gleam`/`gh`.
22. (2026-11-02) Push is a per-project opt-in (Q9=b): a registry boolean, off
    on bind, granted by `/project push <name> on`; the credential stays central
    and reaches the tool env as `GH_CONFIG_DIR` only for a granted conversation.
    The daemon reads the dir from `PI_HOST_GH_CONFIG_DIR` for exactly that
    reason.
23. (2026-11-02) A project agent is a full steer agent: it keeps the subagent
    tool and fans out into its own repository's worktrees (Q10); reports come
    back to the spawning conversation's room, not to the main room.

## Open items (designed, not built)

- **Shared-room selector (started 2026-10-30, reverted RED)**: pi-steer is both
  pi-spike's room and was once pi-host's; plain text must keep flowing to
  pi-spike and `@pi-host …` address the project. First cut edited
  `src/rooms.ts` (`parseAgentSelector`) + tests; tests exposed that the router
  target line, not the command source, decides plain-text flow in double-bound
  rooms — reverted to HEAD, kept RED intent here so it can be finished
  deliberately. (Today's registry has no pi-host row, so nothing is
  double-bound right now.)
- **Daily digest**: `defineTask` + `sleepUntil` morning post (usage + balance +
  overnight summary) to pi-steer. First proactive act; design in backlog.
- **Orphan-anchor pruning** + a wall Health line for unnamed anchors.
- **control surface** (`@dash`): needs `create-user dash` + `reset-password` via
  `@conduit:jacks.im`, token staged to `/dev/shm/pi-host/dash_token`,
  `MATRIX_ALLOWED_USERS` updated, compose env added.
- **`/embed` fix**: host Ollama needs `OLLAMA_HOST=0.0.0.0` + two scoped ufw
  allows (bridge→host is dropped; see ollama-loopback-investigation.md).
- **Backup consistency** for the ledger (quiesce or `sqlite3 .backup`).
- **Branch protection on `main` (WS5) is BLOCKED on a GitHub plan limit**: the
  rulesets/branch-protection API answers `403 Upgrade to GitHub Pro or make
  this repository public` for the three PRIVATE repos (pi-host,
  pr-review-workflow, blog). fourier and cartographer are public and would
  accept a ruleset (the PAT has admin on all five). Decide: GitHub Pro, make
  the repos public, or soft rule only. Also decide whether a 1-approval
  requirement gets a bypass actor for `b34nst4lk` — without one, a solo repo's
  own PRs can never merge.
- **`wall/assets` are stale**: regenerate them with `wall/build.sh` ON THE HOST
  (container-absolute paths leak into the bundle when it is built in-container)
  and commit the result.
- **Deploy of WS1–WS4 is jack's call**: `docker compose -f deploy/docker-compose.yml
  up -d --force-recreate pi-host` after review; nothing in this session was
  deployed or restarted.
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