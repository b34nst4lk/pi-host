# WALL — contract v1

The dashboard is two programs and one JSON contract.

- **reader** (node, `src/wall/*.ts`) — read-only view of the ledger + Ollama spend,
  served as JSON + the built UI on one port (`8091`).
- **wall app** (gleam + lustre, `wall/`) — polls the reader every 10 s and renders
  four sections. Never writes, never mutates, never needs credentials.

Everything below is **versioned day one**. A response that cannot be built is still
JSON: `{"v":1,"ok":false,"error":"<one line>"}`. `/api/*` never returns HTML. Unknown
or unparsable ledger records degrade to `null` / `"unknown"` — a bad row never fails a
request.

Timestamps are ISO-8601 UTC with milliseconds (`2026-10-29T14:31:02.512Z`).
Durations are integer seconds unless the field says otherwise.
Ids are numbers (durable ids are branded numbers in the harness, plain numbers here).

---

## GET /api/health

```json
{ "v": 1, "ok": true, "generated_at": "…", "uptime_s": 86400, "ledger_ok": true }
```

`200` when the process is up. `ledger_ok:false` means the ledger could not be opened
read-only (the rest of `/api/state` is then mostly `null`s).

## GET /api/state

Vitals, queue, fleet and the agent-state cards — everything that comes out of the
ledger. One request, one snapshot, `200` even when parts failed.

```json
{
  "v": 1,
  "ok": true,
  "generated_at": "2026-10-29T14:31:02.512Z",
  "vitals": {
    "ledger": {
      "ok": true, "error": null,
      "path": "storage/session.sqlite",
      "bytes": 5918720,
      "wal_bytes": 4161232,
      "entries": 1832,
      "tasks_live": 1,
      "submissions_live": 0
    },
    "sync": {
      "ok": true, "error": null,
      "batch": "s114_0_1_2_3_4_5",
      "seq": 41,
      "updated_at": "2026-10-29T14:30:55.000Z",
      "age_s": 7,
      "state": "live"
    },
    "daemon": {
      "ok": true, "error": null,
      "log_path": "storage/daemon.log",
      "log_bytes": 1974,
      "log_updated_at": "2026-10-29T03:35:00.000Z",
      "uptime_s": 86400,
      "errors_24h": 2,
      "last_error_at": "2026-10-29T09:12:00.000Z",
      "last_error": "join attempt failed (will rely on sync retries): …"
    },
    "container": { "ok": true, "error": null, "uptime_s": 86400, "source": "/proc/1" }
  },
  "queue": {
    "ok": true, "error": null,
    "inbox_depth": 0,
    "tasks": { "pending": 0, "running": 1, "waiting": 0, "completing": 0, "terminal": 812 },
    "submissions": { "queued": 0, "placed": 1, "done": 640, "unanswered": 3 },
    "background_live": 1,
    "errors": [
      { "at": "…", "status": "unanswered", "request_id": "matrix:$abc", "conversation_id": 1 }
    ]
  },
  "fleet": {
    "ok": true, "error": null,
    "agents": [
      {
        "name": "reader",
        "branch": "worktree-reader",
        "worktree": "/opt/pi-host/worktrees/reader",
        "conversation_id": 15,
        "reports": 2,
        "last_report_entry": 51,
        "state": "reported"
      }
    ]
  },
  "agents": {
    "ok": true, "error": null,
    "spike": { "state": "working", "conversation": 1 },
    "named": [
      {
        "name": "reader",
        "state": "working",
        "branch": "worktree-reader",
        "worktree": "/opt/pi-host/workspace/worktrees/reader",
        "last_reply": 2393,
        "conversation": 2166,
        "anchor": 2165
      }
    ],
    "orphans": [ { "anchor": 2899, "conversation": 2900 } ],
    "retired": 1,
    "work": { "in_flight": 2, "queued": 0 }
  }
}
```

### field notes

- `vitals.ledger.entries` — `count(*) from entries`. `bytes`/`wal_bytes` — file sizes
  of `<db>` and `<db>-wal` (`null` when absent). `tasks_live` — tasks with status in
  `pending|running|waiting|completing`; `submissions_live` — submissions in
  `queued|placed`.
- `vitals.sync` — the live `app.sync-state` document (`documents.kind` is stored
  JSON-quoted, i.e. the row holds `"app.sync-state"` **with** the quotes; match both
  forms defensively). `documents.record` is metadata only: the value is the newest
  `base` revision of `document_revisions` with its `delta` revisions replayed
  (`["s",path,value]` set, `["t",path,n]` truncate, `["a",path,value]` append).
  `batch` is the replayed `batch` field, `seq` is the newest revision's `seq`.
  **The revisions carry no timestamps**, so `updated_at`/`age_s` are derived from the
  `mtime` of the database and its `-wal` (whichever is newer) — the one clock the
  daemon and the reader share. `state`: `live` when `age_s <= 90`, `slow` when
  `<= 600`, else `stale`; `unknown` when the document is missing or unreadable.
- `vitals.daemon` — static info about the log file (size, mtime) plus a scan of the
  **last 200 lines**: `errors_24h` counts lines matching `error|failed|fatal` (case
  insensitive) whose timestamp is within 24 h (lines without a timestamp count when
  they are in the tail); `last_error*` describe the newest such line, truncated to 300
  characters. A missing/unreadable log is `ok:false` with `error`, never a 500.
- `vitals.container.uptime_s` — from `/proc/1/stat` field 22 divided by the clock
  tick, cross-checked against `/proc/uptime`; `ok:false` off Linux.
- `queue.inbox_depth` — `submissions` with status `queued`; `queue.errors` — up to 10
  newest `unanswered` submissions (message, not a secret). `at` is `null` for now: the
  `submissions` table stores no timestamp, and inventing one would be a lie.
- `fleet.agents` — from the live `app.subagents` document
  (`documents.kind = '"app.subagents"'`, replayed the same way as the sync cursor):
  `agents` is `{ "<name>": { conversationId, reported: number[], worktree } }` and the
  daemon also records reports as `reporters: { "<name>": <entry id> }`, so
  `last_report_entry` is the newest of the two (`reported` array, else `reporters`).
  `branch` is `"worktree-" + name`, `state` is `"reported"` when an entry is known
  else `"waiting"`. No document → `agents: []`.

### `agents` — the agent-state enum (round 2, additive in v1)

Six states, decided by **precedence** (highest first). The implementation is one
pure function, `agentState()` in `src/wall/agents.ts`, so the order is readable and
testable without a database:

| # | state | decided by |
| --- | --- | --- |
| 1 | `working` | the conversation has `pi.generation`/`pi.tool`/`pi.compaction` tasks in `running`/`waiting`/`completing`, or its replayed `pi.live` holds a `run`/`generation` |
| 2 | `queued` | nothing in flight, and the replayed `pi.inbox.items` is non-empty |
| 3 | `reporting` | idle, but a `subagent-reporter` task for this conversation is still `running`/`waiting`/`completing` in the main conversation |
| 4 | `alive` | an anchor for it is held (`kind = subagent-anchor`, status ≠ `terminal`) **and** `app.subagents` names it |
| 5 | `orphaned` | an anchor is held and nothing names it — the wall renders `unnamed (prunable)` |
| 6 | `retired` | its anchor reached `terminal`: counted in `retired`, never a card |
| — | `unknown` | the ledger could not be read, or the registry names a conversation that is not in `conversations` |

- `spike` — the main conversation (`conversations` row nothing owns; `1` when that
  cannot be read), judged by the same enum. It has no anchor, so it settles at
  `alive` when idle (it is named by definition).
- `named[]` — one card per `app.subagents` agent, sorted by name. `conversation` is
  the registry's `conversationId`; `anchor` is the anchor task that owns it (via
  `conversations.owner_task_id`, falling back to the anchor's `record.input.name`
  when `conversations` is unreadable); `last_reply` is the `fleet` value, or `null`
  (rendered `—`, never `0`). A named agent whose conversation cannot be found is
  `unknown`, not `alive`.
- `orphans[]` — held anchors with no registry entry: the anchor **task** id (not a
  conversation) plus the conversation it owns, when that can be derived.
- `retired` — `count(*)` of `subagent-anchor` tasks with status `terminal`.
- `work` — `in_flight` counts in-flight run tasks in the **main** conversation
  (anchors and reporters are not work); `queued` is the main conversation's replayed
  `pi.inbox.items` length. `null` when the ledger or the document is unreadable.
- Every document read here is `base` + `delta` replay, scoped by
  `scope_kind = 'conversation'`, `owner_id = <conversation>`.

## GET /api/spend

Upstream is Ollama Cloud: `GET {base}/usage?range=24h` and `GET {base}/balance` with
`Authorization: Bearer <key>`; the upstream limit is **10 requests per minute**. The
reader caches for **60 s**, hard-caps itself at **10 upstream requests per rolling
minute**, and on upstream `429` serves the cache with `stale:true` (never a 500).

```json
{
  "v": 1,
  "ok": true,
  "generated_at": "2026-10-29T14:31:02.512Z",
  "fetched_at": "2026-10-29T14:30:58.000Z",
  "age_s": 4,
  "cached": true,
  "stale": false,
  "error": null,
  "limits": { "window_s": 60, "max_per_minute": 10, "used_in_window": 1 },
  "usage": {
    "range": "24h",
    "requests": 128,
    "input_tokens": 1234567,
    "output_tokens": 98765,
    "raw": {}
  },
  "balance": {
    "balance_usd": 0,
    "purchased_usd": 0,
    "percent_used": 12.5,
    "currency": "USD",
    "raw": {}
  }
}
```

- Fields the upstream does not provide are `null` (e.g. this account returns only
  `request_count` for usage and legacy percentages plus `purchased.balance_usd` for
  balance). `raw` carries the upstream object verbatim so the UI can show what is
  really there; it is not rendered by default.
- `cached` — this response came from cache. `stale` — cache served because upstream
  failed or rate-limited us; `error` then holds one line (`"upstream 429; serving cache
  from 12s ago"`).
- With no cached value at all and an upstream failure: `ok:false`, `usage:null`,
  `balance:null`, `error` set.

## Static

- `GET /` → `wall/assets/index.html`
- `GET /<path>` → the file under `wall/assets/` (content-type by extension; `.mjs`,
  `.js`, `.css`, `.html`, `.svg`, `.png`, `.woff2`). Path traversal rejected (`..`,
  absolute escapes) with `404`. Unknown path → `404`.

## UI-side history (the reader keeps no history)

The wall app polls every 10 s and keeps the last **60 samples** in its model:
`entries`, `tasks_running`, `requests` (+timestamp each). Sparklines are hand-built
SVG `<polyline>`s over that ring buffer, scaled to the box, no chart library. A
sample is only appended when the corresponding value is non-`null`.

## Sections

| section | contents |
| --- | --- |
| **VITALS** | ledger entries + size, sparkline of entries; sync freshness (state colour, `age_s`, batch, seq); daemon log size + `errors_24h` + last error line; container uptime |
| **SPEND** | requests / input / output tokens for 24 h, sparkline of requests; budget bars: upstream calls `used_in_window/10` per minute, `percent_used` of the balance; `cached`/`stale` badge |
| **AGENTS** | `work: <in_flight> in flight · <queued> queued`; the pi-spike card; one card per named subagent (state badge, branch, worktree, last answer entry id); an orphans row (`N unnamed (prunable)` + `#anchor → c<conversation>` ids); a retired-anchor count when > 0 |
| **QUEUE** | the same `work:` line in place of the old `tasks running` counter; inbox depth, tasks pending, unanswered, up to 10 recent errors |

## Versioning

`v` increments only for a breaking change; additive fields do not bump it. The UI
ignores unknown fields and renders `—` for `null`.
