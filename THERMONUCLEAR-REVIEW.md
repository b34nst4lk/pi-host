# THERMONUCLEAR REVIEW — pi-host

Reviewed from main `bb7ad6e` (the worktree base predates the daemon). Judged against the assumed load:
ONE daemon process, one host, one human user, ~1–5 Matrix rooms, few durable conversations, SQLite
(`storage/session.sqlite`) written only by the daemon, read by the wall container.

## What this repo does

`src/daemon.ts` is the whole product: one long-lived process that owns a pi-durable SQLite ledger,
steers a Matrix room surface (`src/rooms.ts` + `src/core/steer.ts`), binds sub-projects
(`src/projects.ts`), spawns worktree subagents (`src/subagents.ts`), answers Ollama admin commands,
and posts a read-only JSON+static dashboard (`src/wall/*.ts`, Gleam `wall/`) over the ledger.
The wall is a separate process/container by contract (`wall/CONTRACT.md`): reader never writes, UI never thinks.

## Verdict

`verdict · 1 blocker · 6 warnings` — the architecture itself (one-owner ledger, room router, durable
work, read-only wall) is sound and honestly documented. Fix first: pull `src/wall/ledger.ts`'s
document-replay engine and log-tail/container forensics out of the 1,254-line reader **before** the
next wall feature, not after.

## Blockers

### 1. `src/wall/ledger.ts` is 1,254 lines and four programs in one file
**`src/wall/ledger.ts:963-1154`** — measured sections inside one file, under separate `// ---` banners:

- report builders: agents/fleet (180), the registry (679), per-conversation facts (721), logs browser / conversations / search (~340-679);
- a document base+delta replay engine (`ledger.ts:963-1073`: `readDocument`, `replayRevisions`, `applyDelta`, `setPath`, `mutatePath`, `INVALID` sentinel);
- a log-tail forensic scanner (`ledger.ts:1073-1128`: `scanLog`, `readTail`);
- container uptime via `/proc/1` (`ledger.ts:1128-1154`: `containerVitals`).

**Evidence**: `wc -l src/wall/ledger.ts` → 1254; the file already exports shared helpers (`oneLine` consumed by `server.ts`), so cross-module use is established practice.
**Structural consequence**: the never-crash reader contract, the document-replay semantics (`a`/`t`/`s` ops) and OS forensics all get edited in the same growing file; a third wall feature (spend, conversations, search all landed here) pushes it past 1,400. The replay engine is pure and testable with no db; the scanner is pure string/`fs`; neither needs to sit behind `withDb`.
**Fix (deletion-first)**: extract two modules by moving existing functions, no new layer:
- `src/wall/document-replay.ts`: `readDocument`/`replayRevisions`/`applyDelta`/`setPath`/`mutatePath` (~120 lines moved);
- `src/wall/vitals.ts`: `scanLog`/`readTail`/`containerVitals` (~90 lines moved).
`ledger.ts` lands ≈950 lines and stays the single owner of `withDb` and the agents/queue/conversation reports. M.

## Warnings

### 2. The anchor task is defined twice, and the wall must know every copy
**`src/projects.ts:119-132`** vs **`src/subagents.ts:283-330`**:

- projects: `const anchorTask = defineTask<…>({ name: "project-anchor", version: 1, initial: () => ({ phase: "hold", wakes: 0 }), …})`
- subagents: `const anchorTask = defineTask<…>({ name: "subagent-anchor", version: 1, initial: () => ({ phase: "hold", wakes: 0 }), …})`

Both carry the same `ANCHOR_HOLD_MS = 60 * 60 * 1000` (`projects.ts:43`, `subagents.ts:61`), an identical
hold→commit→wake shape, and a near-identical cancel comment. Downstream, `src/wall/ledger.ts:691`
already needs a second constant `PROJECT_ANCHOR_KIND = "project-anchor"` and doubles the kind-match at
`ledger.ts:928-929` (`kindVariants(ANCHOR_KIND)` × `kindVariants(PROJECT_ANCHOR_KIND)`).
**Structural consequence**: a third kind of persistent child copies the task again and hand-edits the wall reader's kind list; the "anchor" invariant now lives in n+1 places per kind.
**Fix**: one `defineAnchorTask(name)` factory (shared module, used by both callers) and one `ANCHOR_KINDS` constant consumed by `ledger.ts` — deletes ~50 duplicated lines and one hand-maintained list. S.

### 3. Production-dead steering logic kept alive only by its tests
- **`src/core/steer.ts:181-183`** `forRoom` — `return acceptedRooms.has(event.room);`. The membership rule it implemented now lives in `rooms.ts` (`routeRoom`); no production caller (grep: only `tests/steer.test.ts:270-274`).
- **`src/core/steer.ts:370`** `withdrawSubmissions` — superseded by `handle.abort(context)` in the daemon's router; grep: only `tests/steer.test.ts:259`.
- **`src/rooms.ts:209`** `routeRoomFrom` and the `route` field it fills — zero callers in `src/` or `tests/`.
- **`src/daemon.ts:82`** `import { createRoomRouter, OLLAMA_ACTIONS }` — `OLLAMA_ACTIONS` unused in daemon (used internally in `rooms.ts:186`).

**Structural consequence**: a newcomer greps "room filter", finds `forRoom` and its strong comment ("Those events MUST NOT become steering input"), wires it in, and now two disagreeing canonical filters exist. Dead code with authority-comments is worse than no code.
**Fix**: delete the two `steer.ts` functions, the `route` field, the `daemon.ts` import, and their test cases. S.

### 4. The fleet report reads a TaskId as an entry id
**`src/subagents.ts:537`** (and `:573`): `doc.reporters[name] = reporter;` — `reporter` is a `TaskId`
(`doc.reporters: Record<string, TaskId>`, `subagents.ts:141`). But **`src/wall/ledger.ts:267-274`**:

```ts
// `reporters` map (name → newest report entry) the daemon maintains.
const fromReporters = num(reporters?.[name]);
const lastReportEntry = maxOf([...reported, fromReporters === null ? [] : [fromReporters]]);
```

and `ledger.ts:283` reports it as `last_report_entry`, with an invented `reports: 1` when the array is
empty. `tests/wall.test.ts:157` (`reporters: { "wall-ui": 2409 }`) codifies the conflation.
**Structural consequence**: task ids and entry ids are different counters; when a subagent has a
reporter task id above its (unreported) entry ids, the wall's `last_report_entry` points at a task,
not a reply — a wrong result derived from a named input, with the type lie invisible to the reader.
**Fix (deletion-first)**: delete the `fromReporters` max-merge in `fleetReport` (or have `subagents.ts`
record the *answer entry id* in `reporters` — one owner, one meaning). Update the fixtures. S.

### 5. Resolved Matrix room id is owned nowhere — alias configs degrade silently
**`src/daemon.ts:303-304`**: `const mainRooms = new Set<string>([env.room]); if (joined !== undefined) mainRooms.add(joined);`
and **`src/daemon.ts:190-192`** (subagent `roomPost`): `return await client.sendText(env.room, text, replyTargetFor(env.room));`
— while `lastInbound` is keyed by **resolved** sync event room ids.
Two concrete cases with `MATRIX_ROOM="#alias:server"` (explicitly supported: `scripts/run-host-daemon.sh` usage line, README env table):
(a) transient join failure at boot (`daemon.ts:243-249` "join attempt failed (will rely on sync retries)") leaves only the alias in `mainRooms`; every sync event carries the resolved `!id`, so `routeRoom` never matches — the main room is **deaf until restart**, one log line per event;
(b) every subagent report post threads against `replyTargetFor("#alias…")` → never hits → reports post unthreaded.
**Structural consequence**: the process has two names for the same room and no owner picks the resolved one; behavior differs per call site.
**Fix**: at boot (and lazily on first sync) resolve to the joined id once and store it (`joined ?? env.room`); use it for `mainRooms`, `roomPost` and `replyTargetFor`. No new layer — one owner variable. S/M.

### 6. Docs describe one architecture generation ago
- `README.md` still documents the phase-0 single-room shape; `src/rooms.ts`, `src/projects.ts`, `src/subagents.ts`, `src/env.ts`, `src/wall/` and the `/project`/`/subagent` verbs are absent from the README's file/command tables.
- `docs/plan-and-lessons.md` §6 items 7–8 (multi-agent, multi-project) are never struck through, though both shipped (HEAD `bb7ad6e` is multi-project).
- **`src/daemon.ts:56-58`**: the `OLLAMA_EMBED_MODEL` entry carries spliced-in context-window text — "card is 128K context / 16.4K out; the earlier 32768 default made compaction fire…" — which belongs to the `OLLAMA_CONTEXT_WINDOW` entry at `daemon.ts:51`.
**Structural consequence**: for a repo whose discipline is "the ledger is the record", the entry-point docs pointing at a former architecture misdirect every future reader/editor; the env comment already has.
**Fix**: rewrite README's shape/commands tables from today's `src/`, strike the roadmap items, move the env table into the README (one owner for env docs). M.

### 7. `isRecord` copied three times in the reader modules
**`src/wall/ledger.ts:1199`**, **`src/wall/logs.ts:170`**, **`src/wall/spend.ts:230`** — identical
`function isRecord(value: unknown): value is Record<string, unknown>` bodies, while `contract.ts` is
already the shared pure-helper home (`num`, `str`, `parseRecord`).
**Fix**: export `isRecord` from `contract.ts`; delete the three copies. S.

## What I did not review

- **pi-durable internals** (task engine, inbox, SQLite layer under `node_modules/@earendil-works/`) — vendor tarball; I read only the type surface callers use (e.g. `ContextView`'s entries/contributions parallelism, which validates `subagents.ts answerText`). Confidence in verdicts that depend on it: low-medium.
- **Gleam wall UI internals** (`wall.gleam` 626 L, `view.gleam` 798 L, `model.gleam` 975 L) — skimmed structure + all decoders; none re-derive server state (they decode the reader's enum, which is the right shape). Confidence: medium.
- **Runtime behavior against live services** (homeserver, Ollama cloud, docker cutover) — nothing was executed against them. `npm run typecheck` clean, `npm test` 196/196 green at `bb7ad6e`. Confidence: n/a (not measured).
- **Secret handling** below the env boundary (`/run/secrets`, `/dev/shm/pi-host`) — excluded by instruction; scripts confirmed to only `cat`-into-env, never echo.
- **`tests/wall.test.ts` at 1,572 lines** — fixture corpus, not product structure; not flagged.

**Confidence per verdict**: Blocker 1 (high, measured); Warnings 2–4 (high, grep-verified); Warning 5 (medium-high — degraded cases reasoned from sync/join code paths, not reproduced live); Warnings 6–7 (high).

---
`verdict · 1 blocker · 6 warnings` — top of the pile: (1) split `src/wall/ledger.ts`'s replay engine + forensics into own modules (M); (2) one shared anchor-task factory for projects/subagents (S); (3) delete production-dead `forRoom`/`withdrawSubmissions`/`route` + the TaskId-as-entry-id max in `fleetReport` (S).