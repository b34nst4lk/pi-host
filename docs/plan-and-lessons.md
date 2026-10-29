# pi-host: design plan & lessons

Status: phase 0 live (production daemon running), tools phase approved.
This document records the final state of decisions. Date: 2026-10-28.

## 1. What pi-host is

A persistent, durable coding-agent host: one process that owns a
[pi-durable](https://github.com/earendil-works/pi) harness and a Matrix surface,
so a long-lived agent can be steered from chat, keeps a full sqlite ledger
through crashes, and resumes where it stopped. First component of the "persistent
multi-project agent steered from Matrix" end goal (see §6 roadmap).

## 2. Architecture decisions (final)

### pi-durable is a library, imported — nothing is built inside it

- `@earendil-works/pi-durable` and its closure (`chord`, `pi-ai`, `pi-codemode`,
  `pi-telemetry`) are consumed as **vendored tarballs packed from the pinned
  spike checkout** (built artifacts @ commit `8efd314`, 1.3.0 series). Fresh
  clones install identically; no drift against the experimental npm line
  (npm is 1.4.0, API "changes without notice between releases").
- Upgrade discipline: bump a tarball → run the spike's crash gate
  (`crash_test.sh`) → run this repo's gates → only then touch live storage.
- The spike checkout (`~/hermes-users/jacksim/workspace/pi-durable-spike/`)
  stays as the **test rig** (crash tests, upstream examples, drivers). pi-host
  is the **product**.

### One process owns storage and the Matrix connection

pi-durable's contract is "one process owns a storage at a time," so the daemon
is both the harness host and the Matrix client. No external broker.

### Matrix surface: raw CS API, no SDK

- Thin client (`src/surfaces/matrix-client.ts`): long-poll `/sync`, `PUT /send`,
  `/join`. Access-token auth. Injected fetch for tests.
- **Must send a User-Agent** — Cloudflare in front of `matrix.jacks.im`
  rejects UA-less clients (undici/node send none) with error 1010.
- Deployment: bot account `@pi-spike:jacks.im` (local conduit user, sibling to
  the other household bots), homeserver reached at `https://matrix.jacks.im`
  (cloudflared). v0 room is **non-encrypted**; E2EE is a later upgrade
  (bot accounts without cross-signing fight encryption — pi-courier's
  documented experience).

### Room scoping: the bot is a plain user in the wider household

pi-spike may be invited anywhere; it idles silently. **Only the configured room
steers.** Sync events carry their room id; the daemon accepts events whose room
matches the configured form or the homeserver-resolved id. The allowlist
(`MATRIX_ALLOWED_USERS`) doubles as protection: the bot's own messages are
ignored because the bot is not in the allowlist.

### Steering semantics

| message | behavior |
|---|---|
| plain text | durable input (queues as follow-up when busy) |
| `/steer <text>` | steers the live run (`whenBusy: "steer"`) |
| `/stop` | `root.abort()` — withdraws queued, marks live tasks; background work survives |
| `/status` | pending + inbox counts posted to the room |
| `/note <text>` | appends an entry without asking the model (`app.matrix-note`) |

Settings: `followUpMode: "all"`, `steeringMode: "all"` (all queued items placed
at each boundary).

### Replies: durable-cursor reply pump

`createReplyPump` watches the transcript and delivers assistant texts to the
room. The cursor (`app.steer-cursor` conversation doc) advances **only for
delivered** entries: a failed send stays outside the cursor and is retried on
the next watch tick or next boot. At-least-once delivery; duplicate chat lines
are harmless, lost answers are not.

### Sync cursor persistence + first-boot skip (live since 2026-10-28)

The `/sync` `since` batch and the ids of ingested events (capped at 200) live in
an `app.sync-state` conversation doc. On **first boot with no stored batch**, the
daemon performs an initial sync, marks the backlog seen, and **skips** it: only
messages sent after the daemon is up steer it. Restarts resume from the stored
batch; a homeserver replay of already-ingested events (e.g. after a conduit
restart invalidates sync tokens) is filtered by the durable seen list. Batches
are processed before their cursor is persisted — a crash in between replays at
most once, never skips. Semantics live in `classifySyncBatch` (core/steer.ts),
unit-tested.

### Tools + execution environment (live since 2026-10-28)

- The built-in `CodingTools` extension (read/write/edit/bash) is installed in
  the registry; tools run through `NodeExecutionEnv` built per call from the
  conversation's agent `cwd` (`src/env.ts`), defaulting to the sandbox
  workspace (`PI_HOST_SANDBOX`, default `./workspace`, gitignored).
- **Trust posture (decided)**: v1 runs tools as the host user, allowlist-scoped
  (only `@jacksim:jacks.im` can trigger), cwd-scoped by convention —
  `NodeExecutionEnv` is *not* a sandbox (observed live 2026-10-28: reads roamed
  the host; writes stayed in-bounds only by model path choice). Hardening later:
  dedicated low-priv user for the daemon, or container-per-conversation via the
  existing docker-socket-proxy workshop.

### Credentials & key hygiene (non-negotiable rules)

- Secrets exist only as env vars staged at runtime from tmpfs
  (`/dev/shm/pi-host/`), never in files in the repo, argv, chats, or logs.
- `scripts/run-host-daemon.sh` reads staged files and **exports** env
  (`exec`), so values never appear in `ps`/`pgrep` output. Never compose
  `timeout env SECRET=...` — argv leaks (this exact mistake caused the
  2026-10-28 token leak; see §4).
- Matrix tokens are per-device session credentials: rotation = mint new login →
  re-stage → log out old device. Conduit's `reset-password` changes the login
  password and does **not** kill sessions.
- Ollama Cloud keys: fresh, revocable, rotated on any exposure.

## 3. Operational facts (final)

| item | value |
|---|---|
| homeserver | `https://matrix.jacks.im` (conduit v0.10.13, container `conduit`, no published port) |
| bot account | `@pi-spike:jacks.im`, created via admin room `create-user` |
| current device | `kuXTZRiS9u` ("pi-host daemon") |
| steering room | `!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU` (private, non-encrypted) |
| steerer | `@jacksim:jacks.im` only |
| model | `deepseek-v4.1-flash` via Ollama Cloud (`https://ollama.com/v1`, custom pi-ai provider, `reasoning: false`) |
| durable ledger | `pi-host/storage/session.sqlite` (WAL); debug-era ledger archived at `storage/debug-archive-20261028/` |
| run | `scripts/run-host-daemon.sh '<room>' '<allowed-users>'` (pane %13, tmux session 2) |
| admin | conduit admin room works via `@conduit:jacks.im <command>` (create-user, reset-password, …) |

## 4. Lessons (kept, de-iterated)

1. **Type-check every change; tests alone are not the gate.** The `no_model`
   outage: the daemon passed its whole `env` object to the provider factory
   whose options named the fields `model/apiKey/baseUrl` — the provider was
   built with `model id: undefined`, and every generation failed
   "Model … is not available." `tsx` strips types without checking; `tsc`
   never ran. The fix's first error message named the exact original bug.
   `npm run typecheck` is now part of the flow (note: `npx tsc` installs a
   decoy npm package — use the local devDep binary).
2. **Field-name drift across a refactor is silent until it isn't.** The
   migration into `src/provider.ts` changed the options interface; the daemon
   call site wasn't updated. Fail-fast guards in factory functions (throw on
   missing/empty options) turn boot-distance mysteries into one-line errors.
3. **Instrument the failing topology, not a re-derivation of it.** Probes with
   literal arguments all passed; only a live ticker inside the daemon process
   caught `models=[null]`. When probes pass and production fails, replicate
   the full runtime shape with instrumentation before theorizing.
4. **`ps`/`pgrep -a` prints argv.** A debug run composed as
   `timeout env MATRIX_ACCESS_TOKEN=… OLLAMA_API_KEY=…` leaked both secrets
   into a transcript via one `pgrep -af`. Consequences: full rotation of both
   (old device deleted, new session `kuXTZRiS9u`; new Ollama key). Rule:
   secrets via exported env only; never print process command lines that may
   carry them.
5. **`timeout` doesn't always kill tsx's node child.** SIGTERM reaches the
   wrapper; the child can survive and keep printing to the pane. Use
   `timeout -k`, verify with `pgrep -f "[d]aemon.ts"` (bracket trick avoids
   self-matches), and kill strays by PID.
6. **A pane with a foreground process absorbs typed commands.** `tmux
   send-keys` text goes to the process's stdin, not a shell — the echo is
   visible, the command never runs. Always check
   `pane_current_command`/capture before sending.
7. **Durable ids are branded numbers (or strings, depending on storage).**
   `EntryId`/`SubmissionId` are `number & brand`; pumps and cursors treat ids
   opaquely (`PumpId = string | number`). Conversation-scoped `defineDoc`
   requires `history`/`fork` semantics in the dist 1.3.0 line.
8. **pi-durable keeps its promises.** Interrupted submissions resumed and
   completed across a mid-generation process kill; the reply pump delivered
   exactly once via its cursor; the failed-generation ledger was inspectable
   read-only by a third process (sqlite in WAL mode).
9. **Matrix bot hygiene on conduit**: registration is closed — accounts are
   created via the admin room; tokens are minted by logging in (Element or
   `POST /login` with `device_id`/display name) and revoked by logging out the
   device. Passwords posted by `@conduit` in the (plaintext) admin room must be
   stored immediately and the message redacted (PL 100 required — being admin
   room member is the admin grant).
10. **Long-running daemons need their own hygiene**: stale pre-rotation
    daemons held a dead token and kept 401-retrying forever; kill old processes
    before starting new ones and verify by PID, not by pane appearance.
11. **Model reports confabulate causes — verify against the durable ledger.**
    2026-10-28 tools probe: the agent claimed bash failed because the harness
    gave it a nonexistent cwd ("worth fixing in the harness"). The ledger
    showed three ENOENTs on `…/workspace/workspace` — its own doubled relative
    `cwd` argument — while the workspace had existed since preflight. The agent
    then invented a self-flattering infrastructure narrative. The ledger is the
    record; the reply is a claim.
12. **The advisory boundary was observed live.** With tools, the agent's reads
    roamed the host freely (repo, `ps`, os-release, parent directories);
    writes stayed inside the sandbox only because it chose relative paths.
    The v1 trust posture (allowlist-scoped, cwd-by-convention) is a documented
    decision — its hardening options (low-priv user, container-per-
    conversation) are evidence-backed, not paranoid.
13. **Cursor-style state persists as a UNION, and tests must drive the
    multi-item shape.** The reply pump saved only the current tick's delivered
    ids (replace, not union), so with two answers the cursor flip-flopped
    `[12] ↔ [71]` — ~900 doc rewrites and alternating room spam once commit
    6b27d3b gave the watch a sync heartbeat. Both pump tests used exactly one
    answer, where replace == union. The regression test now drives two answers
    across three ticks. General rule: test the shape that distinguishes the
    semantics you actually implemented.

## 5. Provenance

- Research trail: pi background/parallel options → pi-durable fit for the
  persistent multi-project Matrix-steered agent (announcement: "long-running,
  durable, malleable agents… reachable from different surfaces").
- Spike (audits 1 & 2 in the Hugo blog, `pi-durable-spike/`): crash-resume
  verified across `kill -9` and `docker rm -f` (349/349 memos, no duplicated
  effects); real model via Ollama Cloud through the harness; key-chain
  runner pattern.
- pi-host scaffold: library import, vendored pins, migrated steer surface,
  16→18 tests, typecheck gate, production live 2026-10-28.

## 6. Roadmap (ordered)

1. ~~Sync-cursor persistence + first-boot skip~~ **DONE 2026-10-28** (`classifySyncBatch`, `app.sync-state` doc).
2. ~~Tools (`CodingTools`) + `NodeExecutionEnv` sandbox workspace~~ **DONE 2026-10-28** (`src/env.ts`, preamble updated).
3. Live sequence: `/steer` mid-generation → `/status` → `/stop` — **DONE 2026-10-28** (steer verified on the tic-tac-toe run; stop ledger-verified: live run aborted, submission withdrawn `unanswered (aborted)`, no leak).
4. ~~`kill -9` mid-generation with a live model~~ **DONE 2026-10-28** — audit-2 roadmap item closed on the real rig: task SIGKILLed at `phase=request`, daemon restarted, `resume()` restarted the interrupted generation from its committed checkpoint, and the run continued to completion (a multi-turn Gleam tic-tac-toe build). Compaction fired after nearly every tool round (756K in / 708K cacheRead / 105K out tokens for the session).
5. ~~Ollama account APIs as room commands~~ **DONE 2026-10-28** (`/usage`, `/balance`, `/models`, `/embed`; `src/ollama_api.ts` + `src/core/ollama-format.ts`, 33 tests). Live reality differed from the docs in three ways worth remembering: this plan's `/api/usage` reports `request_count` only (no `usage_usd`, no token counters), `groups` are nested in `totals`/`buckets` rather than top-level, and `/api/balance` returns the legacy `session`/`weekly` percent shape. Formatters treat every metric as optional for that reason.
6. Containerize the daemon on `home_server-network` (conduit DNS), tmpfs key
   chain in compose; systemd-style restart policy.
7. Real tasks: `defineTask` builds in the workspace (background tasks,
   `sleepUntil` scheduling) — the "build in the background" capability.
8. Multi-project: project registry as session docs, one conversation per
   project, per-project cwd/env — the workshop pattern
   (docker-socket-proxy Phase B is already live on the host).
9. E2EE upgrade (matrix crypto stack) if encrypted-room steering is ever
   needed.