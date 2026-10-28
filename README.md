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
| `PI_HOST_DB` | `./storage/session.sqlite` | durable ledger (renamed from spike `STEER_DB`) |

Commands in the room: plain text = follow-up · `/steer <text>` = steer the
live run · `/stop` · `/status` · `/note <text>` (appends without asking the
model) · plain chat text queues as a follow-up while busy.

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