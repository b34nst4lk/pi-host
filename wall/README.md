# THE WALL

A read-only dashboard for the pi-host ledger, in two pieces that never share a
process:

```
wall/  (Gleam → JavaScript, lustre)          src/wall/*.ts  (node data plane)
  index.html + assets/js/**   ── /api/* ──▶  node:sqlite on storage/session.sqlite
  hand-built SVG sparklines                  node:http on :8091, zero npm deps
```

The wire format between them is **`CONTRACT.md` v1**, frozen before either side
was written. If a field is missing from the contract, add it there first.

## Why two pieces

The reader needs `node:sqlite` and the ledger; the UI needs a browser. Splitting
them means the UI can be developed, tested and screenshotted against fixtures
with no ledger, no database and no network — and the reader can be tested with
plain `node:test` against a scratch SQLite file with no DOM.

Both halves are read-only by construction:

* the reader opens the ledger `readOnly: true` with `PRAGMA query_only=1`;
* `deploy/docker-compose.yml` mounts the whole tree `:ro` and sets
  `read_only: true` on the container, so the wall *cannot* write even if it
  tried.

## The UI

```sh
cd wall
export PATH=$HOME/.local/bin:$PATH     # gleam 1.19.2 in this container
gleam test                             # gleeunit, pure mappings — no browser
./build.sh                             # assets/ = index.html + assets/js/**
node scripts/smoke.mjs                 # no browser: init → update → view on fixtures
```

`assets/` is the deployment artefact: the reader serves `assets/index.html` at
`/` and everything under `assets/` by extension. Built output is committed (the
house keeps built things in the repo, e.g. `vendor/`).

### Fake mode

Open `index.html?fake=1` and the app renders the built-in fixtures from
`src/wall/fake.gleam` instead of polling. The fixtures are **JSON text**, not
Gleam values, so fake mode runs through the same decoders as live mode — it
proves the model → decode → view chain, not a parallel code path.

### Layout

| file | role |
| --- | --- |
| `src/wall.gleam` | `init`/`update` (a flat dispatch table), the 10 s poll, `?fake=1`, `lustre.start` |
| `src/wall/update_logs.gleam` | the LOGS tab's half of `update`: filters, page arrivals, the spill reader, and their effects |
| `src/wall/update_browser.gleam` | the BROWSER tab's half of `update`: picker, search submit, jump to a hit, back to the tail |
| `src/wall/model.gleam` | the contract types, `Msg`/`Model`/`initial`, the sample ring buffer, sparkline maths, the agent-state and projects views |
| `src/wall/format.gleam` | pure formatters (counts, bytes, ages, dollars, percents) — no contract types, so anything may import it |
| `src/wall/logs.gleam` | logs-tab types (`Tab`, `Direction`, `LogFilters`, `Logs`) and the pure helpers: filter intersection, path building, row summaries |
| `src/wall/browser.gleam` | picker/window/search types and the pure transitions: rail ordering, selection, jump/anchor, row options |
| `src/wall/decode.gleam` | defensive JSON → model (`None`/`"unknown"` for anything odd) |
| `src/wall/view.gleam` | the frame: header with its tabs, error banner, tab switch, footer — pure `Model -> Element` |
| `src/wall/dashboard.gleam` | the four cards (VITALS, SPEND, AGENTS, QUEUE) and the PROJECTS view |
| `src/wall/logs_view.gleam` | the full-width LOGS tab and the one row renderer both log views share |
| `src/wall/browser_view.gleam` | the BROWSER tab: search box and hits, conversation rail, the selected space's stream |
| `src/wall/ui.gleam` | the small pieces every tab shares: section title, stat, sparkline, budget bar, `—` defaults |
| `src/wall/fake.gleam` | fixture JSON for offline development |
| `src/wall/pretty.gleam` | indents a record for display; never touches the wire |
| `src/wall/ffi.gleam` + `.ffi.mjs` | the only browser API surface: fetch, timer, clock, query string |

Rules the UI keeps:

* an unknown value renders `—`, never an invented `0`;
* the agent-state enum (`working` / `queued` / `reporting` / `alive` / `orphaned` /
  `retired`, plus `unknown`) is **decided by the reader** and rendered as one badge
  per agent card — the UI never re-derives a state from raw counts;
* a stale or absent reader is a banner, not a blank page;
* sparklines are `svg.polyline` over a 0..100 × 0..24 box, hand-built;
* the LOGS tab's filters are `kind=` parameters, not client-side filtering: what is
  on screen is what the reader answered, and a filter combination that cannot match
  (say `in` + the `pi.assistant` chip) shows an empty page rather than everything;
* one row renderer for both tabs (`logs_view.log_rows`), parameterised by whether the
  stream belongs to the logs page or to a browser pane;
* a landed search hit turns the tail off (`anchor != None`), so the poll cannot move
  the rows under a reader who is reading them;
* typing is not searching: the hits on screen keep answering the query they came
  from until Enter (or the button);
* the live tail only replaces the page while it shows the newest rows: once `older`
  has been pressed the 10 s poll leaves the page alone until a filter changes;
* no new dependencies beyond lustre and gleam_json.

### The LOGS tab

`LOGS` (next to `DASHBOARD` in the header) is a browser over the ledger's own
entries table: a row per entry, newest first, 10 s live tail. Each row shows the time,
the kind, the subagent thread and the reader's one-line summary; opening it reveals
the raw record, indented two spaces per level (`src/wall/pretty.gleam`; a record
that is not JSON is shown exactly as it arrived, and anything over 100 kB is left on
one line) and — when the entry spilled its full output — a `full output` expander
that fetches `/api/spill?path=…` on demand. See `CONTRACT.md` for both
endpoints.

In fake mode the fixtures honour the chips and the search box, so the whole tab is
clickable with no reader running (`index.html?fake=1`).

### The BROWSER tab

`BROWSER` is the conversation-first view of the same ledger, one tab over. The
question it answers is "what happened in *that* space", which the LOGS tab cannot:
LOGS shows one space's newest rows, BROWSER starts from a list of spaces.

* **Search** (`/api/search`) is the only cross-conversation query: type, press
  Enter, and the hits list under the box names each hit's space, its date and the
  matched line. Clicking a hit switches the pane to that conversation and asks for
  `/api/logs?conversation=…&around=…`, a ±25-entry window with the hit marked.
  A window is not a tail: the 10 s poll leaves it alone until `back to the tail`.
* **Rail** (`/api/conversations`): one card per space — title, state badge, entry
  count, `first → last` — main pinned first, children in id order, refreshed on the
  same 10 s tick. A space the registry cannot name says `conversation <id>` rather
  than guessing.
* **Pane**: the selected space's stream, drawn by the *same* row renderer as LOGS
  (`view.log_rows`), so the expanders, the indented record and the `full output`
  reader behave identically. The one addition is **compaction**: a `pi.compaction`
  entry is a boundary in the conversation, so it is drawn as a full-width divider
  (`— summarized history begins —`, then `— continues —` for each later one) with
  its summary text one click away. Entries above and below stay one stream — the
  divider is a label, not a fold.

Both tabs share the row code on purpose: a second renderer would drift, and this is
the view that has to stay honest about what the ledger says.

## PROJECTS: the fleet's rooms

A **project** is a Matrix room bound to its own persistent conversation. The daemon
binds it (`/project new <name>`, `/project bind <name> <path>`), keeps a
`project-anchor` task holding that conversation, and records the pointers in
`app.projects`. Plain text typed in a bound room goes straight into that project's
conversation — it never passes through pi-spike.

The wall's job is to show them without pretending to own them:

* **One card list, three kinds.** `agents.named[]` carries `kind` (`project`,
  `subagent`) and `agents.spike.kind` is `main`. The PROJECTS pane is that list
  filtered, so a project's state is decided by the same precedence ladder (and the
  same `agentState()` function) as an agent's — the two views cannot disagree.
* **One row per project.** Name and state badge, the room in short form
  (`!ig3PmgqC-r…XpufmU` — long ids are clipped, short ones left alone), the
  directory it works in, `N entries` of history, and the first line of its
  `AGENTS.md` as the summary. A project with no room, no directory or no summary
  says so in words; nothing renders a bare `null`.
* **No request of its own.** The pane renders from the 10 s `/api/state` poll that
  was already running; the reader adds one query per project conversation for the
  entry count. An empty pane teaches the command instead of showing a blank box.
* **Read-only, as always.** The wall never reads `AGENTS.md` and never writes a
  registry. A stale summary is possible; a wrong state is not.

## The reader

`src/wall/{contract,ledger,agents,spend,server,main}.ts` — see `CONTRACT.md` for every
response shape and every environment variable. Run it with node 26 (it strips
types itself):

```sh
node src/wall/main.ts        # WALL_PORT=8091 by default
```

It never writes: not to the ledger, not to the log, not to disk. Spend data comes
from ollama.com, cached for 60 s and capped at 10 upstream requests per rolling
minute; a 429 serves the cache with `stale: true` rather than failing the page.
