# pi-host

A persistent, durable coding-agent host: a process that owns an agent harness
([pi-durable](https://github.com/earendil-works/pi#packagesdurable)) and a
Matrix surface, so an agent can be steered from chat, keeps its full ledger
through crashes, and resumes where it stopped.

Phase 0 scope: one conversation, one Matrix room, steer + follow-up + stop +
status + notes, replies pumped back into the room under a durable cursor.

## Shape

pi-durable is a **library, imported into this host** — nothing is authored
inside the durable package. Ownership split:

- pi-durable owns the runtime: commit ledger, task scheduler/resume, inbox
  semantics, durable docs, watch views, storage formats.
- this repo owns: task definitions (`src/`), extensions/tools, the surfaces
  (Matrix client + sync loop), the daemon keep-alive, deployment.

```
src/
  core/steer.ts          pure steering logic: command map, sync dedupe, extractor,
                         submission placement, withdraw sweep, durable reply pump
  core/ollama-format.ts  pure formatters for /usage, /balance, /models, /embed
  ollama_api.ts          native Ollama endpoint wrappers (usage, balance, tags,
                         embed) with injectable fetch
  surfaces/
    matrix-client.ts     thin CS-API client (raw HTTP, no SDK; injectable fetch)
  provider.ts            Ollama Cloud provider (mirrors the spike's ollama_driver.ts)
  extensions.ts          registry + steer preamble (durable agents do NOT load pi
                         CLI extensions/skills/MCP — surface tools here)
  daemon.ts              the process: preflight → Harness.open → resume → join →
                         sync loop → submissions → reply pump → clean shutdown
tests/
  steer.test.ts          15 tests, faux-provider harness + stub Matrix fetch
vendor/
  *.tgz                  pinned 1.3.0 artifacts, npm-packed from the spike
                         checkout at 8efd314 (built: full monorepo build rc=0)
```

## Dependency pinning

The host runs the **built artifacts of the pinned spike checkout**, not the
 drifting npm line (checkout durable = 1.3.0-series @ 8efd314; npm is 1.4.0
under an API that "changes without notice between releases"). The tarballs in
`vendor/` are committed so a fresh clone installs identically. To re-pin:

```bash
# from ~/hermes-users/jacksim/workspace/pi-durable-spike/pi/packages/<pkg>:
npm pack --pack-destination ../../pi-host/vendor
```

Upgrade discipline: bump a tarball → rerun the spike's crash gate first
(`bash pi-durable-spike/crash_test.sh`) → then rebuild and rerun this repo's
tests before touching live storage.

## Install and run

```bash
npm install            # vendor tarballs stay local; photon/diff/typebox/etc from npm

# preflight will fail until you provide (never in argv, never in a file here):
OLLAMA_API_KEY=... MATRIX_ACCESS_TOKEN=... MATRIX_ROOM='!...:jacks.im' \
  MATRIX_ALLOWED_USERS='@you:jacks.im' npm run daemon
```

The daemon needs to reach the homeserver: from this shell that means the
conduit DNS name only exists inside docker (`http://conduit:6167` default);
otherwise set `MATRIX_HOMESERVER` accordingly.

## Container deployment (interim: no build)

Three files, plus the documented build path (a fourth file, the build path itself):

| file | role |
|---|---|
| `deploy/docker-compose.yml` | the deployment: `image: node:26-slim`, repo tree bind-mounted at `/opt/pi-host`, host tmpfs bind-mounted **read-only** at `/run/secrets`, `network: home_server_home_server-network`, `user: "1000:1000"`, `restart: unless-stopped` |
| `scripts/run-container-daemon.sh` | in-container entrypoint: preflights `/run/secrets/{matrix_token,ollama_key}` (non-empty, never printed), exports room/users/homeserver/db, `exec`s `tsx src/daemon.ts` |
| `docker/Dockerfile` | the real build path (`npm ci` after `COPY vendor`, since the earendil deps are local tarballs), kept for a host session that holds `BUILD` |

**Why no build in the compose file.** The agent's docker socket grants
`images:pull` and `containers:*` but `BUILD=403` is permanent, so a build-based
compose file could never be brought up from the sandbox. The interim deployment
is therefore a pre-pulled `node:26-slim` plus a bind mount: `node_modules` and
`src/` come from the host tree, so there is nothing to build.

**Inside the network the homeserver default becomes correct.** `MATRIX_HOMESERVER`
is `http://conduit:6167` — the network alias — so containerized steering takes no
Cloudflare hop. (From the host shell that name does not resolve at all; the host
runner needs the public origin instead.)

**Secrets.** `/dev/shm/pi-host` is a real host tmpfs and is bind-mounted
read-only at `/run/secrets`; the entrypoint reads the two files into the
environment and unsets them on exit. Nothing secret is ever an `ARG`, an `ENV`,
an `-e` value or an argv element — `docker inspect` shows env, and that was the
leak pattern flagged in the earlier loopback investigation.

### Cutover (host session — the agent does not run it)

```bash
# 1. stop the host daemon: exactly one process may own the SQLite storage.
#    TERM (never KILL) lets the live run settle; the ledger replays anything
#    committed but unsent.
kill -TERM "$(pgrep -f 'tsx src/daemon.ts')"
sleep 5 && (pgrep -f 'tsx src/daemon.ts' && echo "STILL UP — do not start the container") || echo "host daemon down"

# 2. bring the container up from the repo root
docker compose -f deploy/docker-compose.yml up -d

# 3. watch for the marker that means the ledger opened and sync resumed
docker logs -f --tail 50 pi-host     # wait for "harness up: db=/opt/pi-host/storage/session.sqlite ..."
```

Rollback is symmetric: `docker compose -f deploy/docker-compose.yml down`, then
`scripts/run-host-daemon.sh '<room>' '<users>'`.

### Verified before hand-down (probe containers, all `--rm`)

- `docker pull node:26-slim` — pulls from this socket.
- Fresh container on `home_server_home_server-network`:
  `GET http://conduit:6167/_matrix/client/versions` → `OK v1.12`.
- Repo tree at `/home/jacksim/hermes-users/jacksim/workspace/pi-host` mounts at
  `/opt/pi-host`; `node_modules/.bin/tsx` runs `src/` (imported
  `core/steer.ts`, `parseMatrixCommand('/usage 7d models')` returned the expected
  object) on **node v26.13.0** with tsx v4.23.15, and `vitest --run` passed 33/33
  inside the container — so `node:26-slim` needs no `node:22-slim` fallback.
- `/dev/shm/pi-host:/run/secrets:ro` shows `matrix_token` (32 B) and `ollama_key`
  (59 B), both `0600`, readable at uid 1000.
- Known gap: host Ollama binds `127.0.0.1:11434` only, so `/embed` fails from
  inside the container (`host.docker.internal:11434` → connect timeout) until it
  listens on `0.0.0.0` or joins that network. The other three query commands use
  ollama.com and are unaffected.

## Env contract

| variable | default | meaning |
|---|---|---|
| `MATRIX_HOMESERVER` | `http://conduit:6167` | homeserver base URL |
| `MATRIX_ACCESS_TOKEN` | required | bot account token |
| `MATRIX_ROOM` | required | room id or `#alias` |
| `MATRIX_ALLOWED_USERS` | required (unset = deaf) | comma list of allowed steerers |
| `OLLAMA_API_KEY` | required | model auth, env-staged like the spike |
| `OLLAMA_MODEL` | `deepseek-v4.1-flash` | |
| `OLLAMA_BASE_URL` | `https://ollama.com/v1` | |
| `OLLAMA_EMBED_BASE_URL` | `http://127.0.0.1:11434` | embeddings server: the **local** Ollama (ollama.com serves no embedding models) |
| `OLLAMA_EMBED_MODEL` | autodetected `*embed*` | embedding model on that server |
| `PI_HOST_DB` | `./storage/session.sqlite` | durable ledger (renamed from spike `STEER_DB`) |
| `PI_HOST_SANDBOX` | `./workspace` | agent workspace: cwd for its read/write/edit/bash tools |

Commands in the room: plain text = follow-up · `/steer <text>` = steer the
live run · `/stop` · `/status` · `/note <text>` (appends without asking the
model) · plain chat text queues as a follow-up while busy.

### Query commands

Four commands answer straight from the Ollama APIs. Each makes **one** upstream
call (that account endpoint is limited to 10 req/min per user, shared across
keys), renders it with a pure formatter, and threads the reply onto the command.

| command | endpoint | reply |
|---|---|---|
| `/usage [24h\|7d\|30d] [models]` | `GET /api/usage?range=…[&group_by=model]` | totals line, token line when the plan meters tokens, top 5 model groups, current bucket (marked `(partial)` while open) |
| `/balance` | `GET /api/balance` | one line: included dollars + allowance period, or `session`/`weekly` percent left; plus purchased |
| `/models` | `GET /api/tags` (no auth) | `name [capabilities]`, capped at 20 |
| `/embed <text>` | `POST {OLLAMA_EMBED_BASE_URL}/api/embed` | model, dims, input count, eval count, first 4 vector values (never the whole vector) |

- Every metric is optional in the types: this account's plan reports
  `request_count` only, so the formatter prints no USD or token figures rather
  than `$0.00`/`NaN`. Request counts stay exact; token counts compact
  (`756000` → `756.0K`, `1570574` → `1.6M`).
- `groups` are read from `totals.groups` (where the live API nests them) with the
  documented top-level `groups` as a fallback. There is no `remainder` field.
- `/usage 12h` is refused with the valid forms instead of guessing.
- An embedding request needs a local model: with none installed the reply says
  `no embedding model on … — run \`ollama pull embeddinggemma\` first` (no `❌`,
  it is a state, not a failure). Any real API error replies `❌ <status: detail>`
  and is logged.

## Receipt and threading

- **👀 on every accepted message.** `handleEvent` reacts (`m.annotation`,
  key `👀`) as soon as an allowed message is read, before the model is asked
  anything — the room sees receipt while the run is still working. A failed
  reaction is logged and dropped, never fatal: the message still steers. The
  homeserver keys reactions by (event, key, sender), so a redelivered sync
  batch cannot stack a second 👀.
- **Replies quote the message being answered.** The pump sends every answer
  with `m.relates_to.m.in_reply_to.event_id` set to the newest accepted
  inbound message (`lastInbound` in `src/daemon.ts`), read *at send time*, so a
  slow answer quotes the latest message rather than a stale id. `/stop` and
  `/status` replies quote the command that triggered them.

Both shapes are pure functions in `src/core/steer.ts` (`reactionContent`,
`replyContent`) and covered by tests, so the wire format can be checked without
a homeserver.

## Provenance & proven rules

- Migrated from `~/hermes-users/jacksim/workspace/pi-durable-spike/`
  (blog audits 1 & 2). Crash-resume claims were verified there across
  `kill -9` and `docker rm -f` kill classes; the steer tests here are the
  port of that learning, not yet the live-model container rig.
- Key hygiene: credentials exist only as env vars, staged at runtime; never
  in files, argv, chats, or this repo.
- Durability boundary (audit 2): committed intents are durable; external
  side effects (bash, sends) are at-least-once guarded, not transactional.

## Next steps (phase 1)

1. Live room + account provisioning → first real room message.
2. Steer a live generation, then `/stop` mid-run.
3. `kill -9` mid-generation resume (audit-2 roadmap item 1) on this rig.
4. Containerize on the home-server network; extend the tmpfs key chain to
   stage `MATRIX_ACCESS_TOKEN`.
5. Tasks + per-project envs (`tasks.ts`, `envs.ts`) → project-sentinel v0.