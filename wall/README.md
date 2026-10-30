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
| `src/wall.gleam` | `init`/`update`, 10 s poll, `?fake=1`, `lustre.start` |
| `src/wall/model.gleam` | types, ring buffer of samples, formatters, sparkline maths |
| `src/wall/decode.gleam` | defensive JSON → model (`None` for anything odd) |
| `src/wall/view.gleam` | pure `Model -> Element`: four cards, no chart library |
| `src/wall/fake.gleam` | fixture JSON for offline development |
| `src/wall/ffi.gleam` + `.ffi.mjs` | the only browser API surface: fetch, timer, clock, query string |

Rules the UI keeps:

* an unknown value renders `—`, never an invented `0`;
* a stale or absent reader is a banner, not a blank page;
* sparklines are `svg.polyline` over a 0..100 × 0..24 box, hand-built;
* no new dependencies beyond lustre and gleam_json.

## The reader

`src/wall/{contract,ledger,spend,server,main}.ts` — see `CONTRACT.md` for every
response shape and every environment variable. Run it with node 26 (it strips
types itself):

```sh
node src/wall/main.ts        # WALL_PORT=8091 by default
```

It never writes: not to the ledger, not to the log, not to disk. Spend data comes
from ollama.com, cached for 60 s and capped at 10 upstream requests per rolling
minute; a 429 serves the cache with `stale: true` rather than failing the page.
