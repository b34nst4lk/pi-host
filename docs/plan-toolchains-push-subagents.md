# Plan: toolchains, project push, project subagents

Status: **DRAFT / PROPOSAL** — test points not yet confirmed, no code written.
Originates from the grilling session of 2026-10-31 (see docs/HANDOFF.md +
docs/plan-and-lessons.md for the system this builds on).

## Outcomes, deliverables & interactions

What concretely changes for you (the human in a Matrix room) and for the
agent. Each outcome names the workstream(s) that deliver it.

**O1 — a project agent can push to GitHub and open a PR, hands-free.**
Today pr-review-workflow tried to push and failed (no creds in the container).
After: in the pr-review-workflow room you say "review PR #42, push a fix branch
and open a PR." The agent commits its work, pushes a branch to GitHub under a
scoped token, runs `gh pr create`, and posts the PR link back to the room. You
never leave the room and never touch credentials.
Delivered by: WS2 (per-project push opt-in) + WS3 (gh CLI + token) + WS5
(branch protection, so `main` is never the target).

**O2 — the agent can build the wall and run its gleam tests in the container.**
Today a wall change can't be compiled/tested in-container because gleam is
absent, so `npm run gates` doesn't exercise gleam and `wall/build.sh` can't
run. After: the agent edits `*.gleam`, runs `npm run gates` (which now includes
`gleam test`) and `wall/build.sh`, all inside the container, and only commits
when green.
Delivered by: WS1 (toolchain mount + gleam) + the `gleam test`-in-gates change
in WS1.

**O3 — a project agent can spawn its own subagents, reported back to the
project room.** Today project agents are "spaces, not spawners" — the subagent
tool is stripped on bind, so asking pr-review-workflow to fan out a review was
refused. After: every project agent can spawn subagents in worktrees of its own
repo; the report comes back to the project conversation and is posted to the
project room. Subagents still cannot spawn grandchildren (depth 1, unchanged).
Delivered by: WS4.

**O4 — push access is opt-in per project, never on by default.** A new project
can't push until you say `/project push <name> on`. pr-review-workflow, pi-host
and fourier are the enabled set; the token is central (one PAT, never copied
into project dirs or the registry — the registry stores only a boolean).
Delivered by: WS2.

**O5 — `main` is protected on all three repos, for the agent AND for you.** No
direct pushes to `main` land; everything goes through a PR + review. The agent's
`AGENTS.md` reinforces "open a PR, never push to main."
Delivered by: WS5.

**O6 — the GitHub PAT lives in vaultwarden and survives reboots.** Source of
truth = a vaultwarden item; delivery = a persistent host file
(`~/.secrets/pi-host/github_token`, 0600) bind-mounted read-only into the
container. Unlike the matrix/ollama tokens in `/dev/shm`, this one does NOT die
on reboot. Rotation = new PAT in GitHub → update vaultwarden → overwrite the
host file → `docker restart pi-host`.
Delivered by: WS3.

**O7 — a general toolchain mechanism, not a gleam one-off.** A persistent,
agent-owned `/opt/toolchains` directory (bind-mounted, on PATH) holds gleam now
and is where rust/go/gh install later (host-seeded for now; agent self-service
as a follow-up). This is the pattern Q7=c (per-project containers) builds on
later.
Delivered by: WS1 (the mount + dir); WS3 (gh is the second tool in it).

### How the workstreams combine for the headline interaction

The pr-review-workflow review-that-opens-a-PR flow needs **all five**: WS4 to
spawn the review subagent, WS1 so the subagent's gates (incl. gleam, if it
touches the wall) pass in-container, WS2 so the project is push-enabled, WS3 so
`gh` is authed in-container, WS5 so the push targets a branch (not `main`) and
the PR can be opened. WS6 writes it all down and redeploys.

## Decisions settled (the grilling tree)

| # | Decision |
|---|---|
| Q1 | Agent pushes to a branch / opens PRs, never direct to `main`. |
| Q2 | Agent rebuilds the wall + runs `gleam test` in-container; fold `gleam test` into `npm run gates`. |
| Q3 | Fine-grained PAT on `b34nst4lk`, repo-scoped to pr-review-workflow + pi-host + fourier. |
| Q4 | `gh` CLI in the toolchain, authed from the staged token. |
| Q5 | GitHub branch protection on `main` (applies to the human too) + `AGENTS.md` soft rule. |
| Q6 | Scoped to pr-review-workflow, pi-host, fourier. |
| Q7 | Persistent agent-owned toolchain dir mounted in-container now → per-project containers later. |
| Q8 | Vaultwarden = source of truth; persistent ro host file `github_token` = delivery copy. |
| Q9 | One PAT, per-project push opt-in via a registry flag; token is central, never in project dirs. |
| Q10 | Every project is a spawner; subagents stay leaves (already enforced — `extensions: { remove: [toolsExtension] }`). |

## Two issues this solves

1. pr-review-workflow tried to push a commit and failed (no GitHub creds in the
   container; also the project had no remote/commits yet).
2. Wall changes can't be built/tested in-container because gleam is absent.

Plus the discovered gap: project agents could not spawn subagents ("a project
is a space, not a spawner" — Q10 lifts this).

## Workstream order + dependencies

```
WS1 (toolchain mount + gleam) ──┐
                                ├─► WS6 (docs + deploy)
WS4 (project subagents) ────────┤
                                │
WS2 (push opt-in registry) ──► WS3 (gh + token delivery) ──► WS5 (branch protection)
```

WS1 first (it unblocks in-container gates for every later change). WS4 is
independent and highest-value (unblocks pr-review-workflow's review use case).
WS2→WS3→WS5 is the push chain. WS6 runs throughout and closes.

---

## WS1 — toolchain mount + gleam in the container (Q7=b, Q2=a)

Goal: a persistent, agent-owned toolchain directory bind-mounted into the
container at `/opt/toolchains` (on PATH); gleam installed there; `gleam test`
folded into `npm run gates`.

Mostly **ops** (compose, runner, package.json), not TDD-shaped. One small
pure-ish decision and an integration verification.

### Ops steps
1. Host: `mkdir -p ~/hermes-users/jacksim/workspace/pi-host-toolchains/bin`
   (uid 1000). This is the persistent, agent-owned toolchain dir.
2. Seed gleam: copy the host's statically-linked gleam binary
   (`/home/jacksim/.local/bin/gleam`) into `…/pi-host-toolchains/bin/gleam`.
   (Static ELF → runs in node:26-slim unchanged.)
3. Compose: add a bind mount
   `~/hermes-users/jacksim/workspace/pi-host-toolchains:/opt/toolchains:ro`
   to the `pi-host` service, and `PATH=/opt/toolchains/bin:…` via the runner
   (NOT compose `environment:`, to keep one place that owns PATH).
4. Runner (`scripts/run-container-daemon.sh`):
   `export PATH="/opt/toolchains/bin:${PATH}"` before `exec tsx …`.
5. `package.json` gates: `"gates": "npm run typecheck && npm test && npm run fsize && gleam test"`.

### Test point to confirm
- **No new unit seam.** The gleam tests already exist (`wall/test/*.gleam`,
  run by `gleam test`). Folding them into `npm run gates` is a script change;
  its test is "the gate chain fails when a gleam test fails" — verified by
  integration, not a vitest assertion.

### Verification (the gate for this workstream)
- Host: `gleam test` (in `wall/`) passes; `npm run gates` green.
- In-container (after redeploy): `docker exec pi-host /opt/toolchains/bin/gleam
  --version` prints 1.19.x; `docker exec pi-host sh -lc 'cd /opt/pi-host &&
  npm run gates'` green, including the new `gleam test` step.
- `wall/build.sh` runs in-container (GLEAM env points at the mounted binary).

### Notes
- `:ro` on the toolchain mount: the agent installs tools via a host-side seed
  step for now. Self-service install by the agent (rustup, go tarball) is a
  later refinement — the mount can become `:rw` when we trust it, but Q7=b's
  "agent-owned" starts with a seeded dir.
- `/opt/toolchains/bin` is the single PATH entry; multi-binary toolchains
  (rust) install under `/opt/toolchains/<tool>/` and symlink into `bin/`.

---

## WS4 — project agents can spawn subagents (Q10)

Goal: every project becomes a spawner; subagents remain leaves (already
enforced in `src/subagents.ts`: `configure(tx, child.id, { extensions: {
remove: [toolsExtension] }, …})`). **This is NOT a one-line wiring change** —
today the subagent `roomPost` is a single closure hard-wired to the MAIN room
(`src/daemon.ts` ~line 130, comment: *"Reports thread in the MAIN room: a
subagent is the main agent's child"*), and the reporter calls `host.roomPost(body)`
with no conversation context. So a project-spawned subagent would post its
report to the wrong room today. Two changes are needed:

1. stop stripping the subagent extension from project agents (daemon wiring:
   `hideExtensions: []`);
2. make `roomPost` **contextual** so a subagent reports to the *spawning
   conversation's* room, not always the main room.

### Test points to confirm (both)
- **`roomForConversation` (pure, `src/rooms.ts`) — the narrow pure seam.**
  Already exists and already tested in `tests/projects-routing.test.ts`; it
  maps a conversation id → its bound room. The new use is: the subagent
  reporter resolves its target room through this function (given the
  *spawning* conversation, not the main one). Confirm it covers the
  subagent-report routing (a RED case: a subagent spawned from a project
  conversation resolves to the project room, and `null` for a main-conversation
  spawn falls back to the main room).
- **`createProjects` + `createSubagents` over `projects-fixtures.ts` /
  `subagents.test.ts` harnesses (stateful).** The end-to-end behavior: a
  project conversation's agent has the subagent tool, a spawn from it reports
  back to the *project* room (not the main room), and the subagent is a leaf
  (cannot spawn grandchildren).

### Red → green cycles
1. **RED (pure):** `roomForConversation` resolves a project conversation →
   that project's room, and the main conversation → `null` (caller falls back
   to the main room). Extend `tests/projects-routing.test.ts` if the
   main-conversation fallback case isn't already pinned.
   **GREEN:** no new code if it already holds; otherwise adjust `roomForConversation`.
2. **RED (fixture):** a subagent spawned FROM a project conversation posts its
   report to the project room, not the main room. Use the `subagents.test.ts`
   harness shape but with a project conversation as the spawner, asserting the
   `roomPost` target is the project room. Fails today (`roomPost` ignores the
   spawning conversation).
   **GREEN:** thread the spawning conversation id through the reporter so
   `roomPost` resolves via `roomForConversation` (project room) with the main
   room as the fallback. This likely changes the `SubagentHost.roomPost`
   signature to carry the conversation id, or captures it at spawn time.
3. **RED (fixture):** a project agent has the subagent tool available (a
   spawn-inducing message creates a subagent child under the project
   conversation). Fails today (extension stripped on bind).
   **GREEN:** in `src/daemon.ts` wiring, `createProjects({ hideExtensions: [] })`.
   Update the `ProjectsHost.hideExtensions` comment and the steer preamble in
   `src/extensions.ts` ("a project is a space, not a spawner" → lifted; depth
   stays 1 via the child's own remove).

### Gate
- `npm run gates` green (incl. `gleam test` once WS1 lands).
- No regression in `tests/projects-*.test.ts` or `tests/subagents.test.ts`.

### Notes
- A project-spawned subagent worktrees off the project's cwd (a git repo) →
  `worktrees/<name>` inside the project repo. Reports thread into the project
  room. The reply pump per conversation already exists; the new work is making
  `roomPost` target the right one.
- Depth stays 1: subagents (whoever spawns them) cannot spawn grandchildren.
- Watch the fsize gate: `src/subagents.ts` / `src/subagent-reporter.ts` /
  `src/daemon.ts` are near the warn line; split along a real seam if the
  `roomPost` contextualization pushes any over 5,000.

---

## WS2 — per-project push opt-in (Q9=b)

Goal: a registry flag records which projects may push; a project agent's tool
env gets `GH_CONFIG_DIR` wired only when its flag is on; a room command
toggles it.

### Test points to confirm
- **`parseMatrixCommand` (pure, `src/core/steer.ts`):** a new
  `/project push <name> on|off` command parses to a `project-push` action
  with `{ name, enabled }`. Negative cases: bad name, missing arg, unknown
  subcommand → `project-invalid`.
- **`createAgentEnv` (pure, `src/env.ts`):** extended with an option
  `{ gitPush?: { configDir: string } }`; when present, the env's `shellEnv`
  includes `GH_CONFIG_DIR=<configDir>`. When absent, it does not. Tested in
  `tests/env.test.ts` at the existing `createAgentEnv` test point.
- **`createProjects` + fixtures (stateful):** `/project push foo on` sets
  `push: true` on `ProjectRecord` and the `ProjectMarker`; `/project push foo
  off` clears it; default on bind is `false`. The bind outcome and
  `/project list` reflect the flag.

### Red → green cycles
1. **RED (parse):** `parseMatrixCommand("/project push foo on")` →
   `{ action: "project-push", name: "foo", enabled: true }`; `off` →
   `enabled: false`; `"/project push"` and `"/project push foo maybe"` →
   `project-invalid`. (Pure, in `tests/steer.test.ts`.)
   **GREEN:** add the branch to `parseProject` in `src/core/steer.ts` + the
   action variant.
2. **RED (env):** `createAgentEnv({cwd}, ws, { gitPush: { configDir: "/gh" }
   })` produces an env whose shell execs carry `GH_CONFIG_DIR=/gh`; without
   the option, no `GH_CONFIG_DIR`. (Inspect `shellEnv` via the `TimeoutEnv`
   options.) **GREEN:** thread `shellEnv` through `TimeoutEnvOptions` into
   `NodeExecutionEnv`.
3. **RED (registry):** `/project push foo on` toggles `ProjectRecord.push`
   and `ProjectMarker.push`; `/project list` shows `[push]`; a fresh bind has
   `push: false`. **GREEN:** add the field to both docs, the toggle handler
   in `createProjects`, and the `describeProject` line.
4. **RED (wiring):** the daemon's project env factory reads the project
   marker and passes `gitPush` only when `push === true`. Integration-level
   (fixture): a bound-and-push-enabled project's tool env has `GH_CONFIG_DIR`;
   a push-disabled project's does not. **GREEN:** daemon wiring reads the
   marker (or the registry) per tool-exec.

### Gate
- `npm run gates` green. fsize: `src/env.ts`, `src/projects.ts`,
  `src/core/steer.ts`, `src/daemon.ts` stay under 5,000 tokens (the fsize
  rule — split along seams if they cross).

### Notes
- The token itself never enters the project dir or the registry. The registry
  records *permission* (`push: bool`); the token is central (WS3).
- Command placement: `/project push <name> on|off` works in any room (it
  mutates the main-conversation registry, like `/project bind`).

---

## WS3 — gh CLI + token delivery (Q4=a, Q8=a)

Goal: `gh` in the toolchain; a persistent ro host file `github_token` staged
from vaultwarden; the runner auths `gh` from it at startup into a shared
config dir; that dir is the `GH_CONFIG_DIR` WS2 wires.

Mostly **ops** (host file, compose mount, runner). One pure seam from WS2
already covers the env wiring; this workstream provides the config dir.

### Ops steps
1. Create the fine-grained PAT on GitHub (b34nst4lk), scoped to
   pr-review-workflow + pi-host + fourier, permissions: `contents:write`,
   `pull-requests:write`. Store the token as a vaultwarden item (source of
   truth).
2. Stage once into a **persistent** host file (NOT tmpfs):
   `mkdir -p ~/.secrets/pi-host && install -m 600 <token>
   ~/.secrets/pi-host/github_token`. Survives reboot (the win over
   `/dev/shm`). Re-stage only on rotation.
3. Compose: add
   `~/.secrets/pi-host/github_token:/run/secrets/github_token:ro` to the
   `pi-host` service mounts. (Deliberate exception to tmpfs-only, justified
   by reboot-persistence + revocable scoped token — Q8=a.)
4. Seed `gh` into the toolchain: extract the gh tarball into
   `…/pi-host-toolchains/bin/gh` (host-side seed step, like gleam).
5. Runner: read `/run/secrets/github_token`, run
   `gh auth login --with-token` into a shared config dir (e.g.
   `/opt/pi-host/.gh`, gitignored, persisted via the repo bind mount — or a
   small dedicated volume); `gh auth setup-git` so `git push` over HTTPS
   works. Set `GH_CONFIG_DIR` to that dir. Unset the token env on exit
   (same pattern as matrix/ollama).
6. Daemon wiring: `GH_CONFIG_DIR` is the value WS2's env factory passes for
   push-enabled projects.

### Test point to confirm
- **No new unit seam.** The pure logic (env gets `GH_CONFIG_DIR`) is WS2's.
  This workstream's verification is integration: `gh auth status` succeeds
  in-container; a push-enabled project agent can `git push` to a branch and
  `gh pr create`.

### Verification
- Host: `gh auth status` (host gh, separate) unchanged.
- In-container: `docker exec pi-host sh -lc 'gh auth status'` → authenticated
  as b34nst4lk; `docker exec pi-host sh -lc 'cat /run/secrets/github_token |
  wc -c'` → token length, 0600 on the host.
- End-to-end (against a scratch branch on pr-review-workflow, once WS5 branch
  protection is up): agent pushes a branch and opens a PR.

### Notes
- `/opt/pi-host/.gh` is under the repo bind mount → persists and is gitignored
  (add to `.gitignore`). It is a credential cache, not committed.
- Rotation: new PAT in GitHub → update vaultwarden item → overwrite
  `~/.secrets/pi-host/github_token` → `docker restart pi-host` (runner
  re-auths).

---

## WS5 — GitHub branch protection on `main` (Q5=a)

Goal: `main` is protected on pr-review-workflow, pi-host, fourier — no direct
push (not by the agent, not by jack); changes land via PR + review.

### Ops steps
- Per repo: `gh api repos/b34nst4lk/<repo>/rulesets -X POST …` (or the
  settings UI) requiring a PR to merge into `main`, with at least one
  approval review. Apply to all three repos.
- Document the rule in each project's `AGENTS.md`: "never push to main; open
  a PR — `main` is protected and will reject direct pushes."

### Test point to confirm
- **None in pi-host code.** This is a GitHub-side policy. Verified by
  attempting a direct push to `main` and seeing it rejected.

### Verification
- `git push origin main` (from anywhere) is rejected by the ruleset.
- A push to a scratch branch + `gh pr create` succeeds.

---

## WS6 — docs + deploy

- `docs/HANDOFF.md`: live state section gains the toolchain mount, the three
  push-enabled projects, the `/project push` command, project-spawned
  subagents. Open items: shared-room selector (unchanged), toolchain
  self-service installs (future), per-project containers (Q7=c, future).
- `docs/plan-and-lessons.md`: decision ledger entries for Q7=b (toolchain
  dir), Q9=b (push opt-in), Q10 (projects are spawners), Q8=a (persistent
  secret file exception). New lessons only after they cost real time.
- Root `AGENTS.md` / project `AGENTS.md`: the "open a PR, never push to main"
  soft rule.
- `.gitignore`: add `/opt/pi-host/.gh` path (`.gh/`).
- Deploy: `docker compose -f deploy/docker-compose.yml up -d --force-recreate
  pi-host` after WS1+WS3+WS4 land; verify logs (`harness up`, joined,
  syncing) and a steering round.

---

## Confirmed (seam review with jack, 2026-10-31)

- **WS1:** no new unit test point — gate = in-container `npm run gates`
  green incl. `gleam test`, and `wall/build.sh` runnable in-container.
- **WS4:** both — narrow pure seam `roomForConversation` (`src/rooms.ts`, for
  subagent-report routing) AND the `projects-fixtures.ts` / `subagents.test.ts`
  stateful harness for end-to-end "project spawn → report reaches project
  room."
- **WS2:** three test points confirmed — `parseMatrixCommand` for
  `/project push …`, `createAgentEnv` for `GH_CONFIG_DIR` injection,
  `createProjects` registry/marker toggle. **Command shape:
  `/project push <name> on|off`** (a separate toggle, not bind-time).
- **WS3 / WS5:** ops + integration verification, no vitest test points.

## Handoff note for pi-spike

Run order: WS1 → WS4 → WS2 → WS3 → WS5 → WS6 (see "Workstream order +
dependencies"). Gates before every commit (`npm run gates`); fsize rule holds
for every source file. WS1's ops steps (host toolchain dir, seeding gleam, the
compose mount, the runner PATH export, the `gleam test` step in `npm run gates`)
are host/container changes — coordinate the `docker compose … up -d
--force-recreate pi-host` redeploy with jack. WS3 stages a GitHub PAT (jack
creates it in GitHub + vaultwarden) and WS5 sets branch protection (jack's repos)
— both need jack's action; flag them as blocking in the room when reached.
Commit this plan before starting; update docs/HANDOFF.md + docs/plan-and-lessons.md
in WS6 as each workstream lands, not before.