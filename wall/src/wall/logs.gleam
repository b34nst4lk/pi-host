//// The LOGS tab: the filter chips, the query the browser asks for, and the
//// one-line summaries the rows render. Kept apart from `model` so the wall's
//// state types stay in one file and the query building stays in this one.
////
//// The types at the top are the contract's (see `CONTRACT.md` v1); every
//// function below them is a pure function of its arguments.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

// --- the logs tab ---
//
// The browser over the ledger's `entries` table: newest first, live-tailed by
// the same 10 s poll, filtered by kind and by direction, searchable, every row
// expandable to its raw record. The reader does the SQL and the human line
// (`src/wall/logs.ts`); this side owns the query it asks for and the state of a
// page that can be walked backwards.

/// The kind chips. `app.*` is a prefix the reader understands.
pub const log_kinds = [
  "pi.user",
  "pi.assistant",
  "pi.tool-result",
  "pi.compaction",
  "pi.system",
  "app.*",
]

/// One page. The reader's default is 50 and its ceiling 200; the tab asks for 50.
pub const log_limit = 50

/// The browser's cross-conversation search: the reader caps it at 100, and a
/// hits list is short by design (it is a jump list, not a report).
pub const search_limit = 25

pub type Tab {
  Dashboard
  LogsTab
  BrowserTab
  ProjectsTab
}

/// The direction filter: a steer arriving, an answer leaving, or both.
pub type Direction {
  BothWays
  Incoming
  Outgoing
}

pub type LogFilters {
  LogFilters(kinds: List(String), direction: Direction, query: String)
}

pub type LogEntry {
  LogEntry(
    id: Int,
    kind: String,
    at: Option(String),
    text: String,
    thread: Option(String),
    spill: Option(String),
    raw: String,
  )
}

pub type Logs {
  Logs(
    entries: List(LogEntry),
    next_before: Option(Int),
    /// This page is the newest one, so the poll may replace it: the live tail.
    tailing: Bool,
    /// A `before=` page is in flight; its answer appends instead of replacing.
    appending: Bool,
    /// Full output, by entry id, once a row's expander has fetched it.
    spills: List(#(Int, String)),
    error: Option(String),
  )
}

pub fn empty_filters() -> LogFilters {
  LogFilters(kinds: [], direction: BothWays, query: "")
}

pub fn empty_logs() -> Logs {
  Logs(entries: [], next_before: None, tailing: True, appending: False, spills: [], error: None)
}

pub fn tab_label(tab: Tab) -> String {
  case tab {
    Dashboard -> "dashboard"
    LogsTab -> "logs"
    BrowserTab -> "browser"
    ProjectsTab -> "projects"
  }
}

pub fn direction_label(direction: Direction) -> String {
  case direction {
    BothWays -> "all"
    Incoming -> "in"
    Outgoing -> "out"
  }
}

/// What the direction means in the reader's vocabulary: `in` is the user's
/// steers, `out` is what the agent and the apps write.
pub fn direction_kinds(direction: Direction) -> List(String) {
  case direction {
    BothWays -> []
    Incoming -> ["pi.user"]
    Outgoing -> ["pi.assistant", "app.*"]
  }
}

fn kind_matches(pattern: String, kind: String) -> Bool {
  case pattern {
    "app.*" -> string.starts_with(kind, "app.")
    _ -> pattern == kind
  }
}

/// The `kind=` list actually sent. Chips narrow the direction; a combination
/// that cannot match anything asks for a kind nobody wrote, so the tab shows an
/// empty page instead of silently showing everything.
pub fn effective_kinds(filters: LogFilters) -> List(String) {
  case direction_kinds(filters.direction), filters.kinds {
    [], [] -> []
    [], chips -> chips
    directed, [] -> directed
    directed, chips -> {
      let kept =
        list.filter(chips, fn(chip) {
          list.any(directed, fn(directed_kind) { kind_matches(directed_kind, chip) })
        })
      case kept {
        [] -> ["(no such kind)"]
        _ -> kept
      }
    }
  }
}

/// Percent-encode the characters that would otherwise change the query. Bytes
/// above ASCII are left alone: `fetch` encodes them, and the reader decodes them.
pub fn url_encode(value: String) -> String {
  value
  |> string.to_graphemes
  |> list.map(fn(character) {
    case character {
      " " -> "%20"
      "%" -> "%25"
      "&" -> "%26"
      "#" -> "%23"
      "+" -> "%2B"
      "=" -> "%3D"
      "?" -> "%3F"
      "/" -> "%2F"
      "," -> "%2C"
      _ -> character
    }
  })
  |> string.join("")
}

/// The reader URL for one page. The tab always asks `dir=desc` (newest first);
/// `asc` exists for the contract, not for this view.
pub fn logs_path(filters: LogFilters, before: Option(Int), limit: Int) -> String {
  let head = "/api/logs?limit=" <> int.to_string(limit) <> "&dir=desc"
  let kinds = effective_kinds(filters)
  let kind_part = case list.length(kinds) {
    0 -> ""
    _ -> "&kind=" <> string.join(list.map(kinds, url_encode), ",")
  }
  let before_part = case before {
    Some(id) -> "&before=" <> int.to_string(id)
    None -> ""
  }
  let query_part = case string.trim(filters.query) {
    "" -> ""
    query -> "&q=" <> url_encode(query)
  }
  head <> kind_part <> before_part <> query_part
}

/// `3 entries · live tail` / `50 entries · paged back`.
pub fn logs_line(logs: Logs) -> String {
  let count = list.length(logs.entries)
  int.to_string(count)
  <> case count {
    1 -> " entry"
    _ -> " entries"
  }
  <> case logs.tailing {
    True -> " · live tail"
    False -> " · paged back"
  }
}

/// `12:34:56` from an ISO timestamp; the date is already in the ledger's own
/// ordering, and the row's raw record carries the full value.
pub fn short_time(at: Option(String)) -> String {
  case at {
    None -> "—"
    Some(iso) ->
      case string.length(iso) >= 19 {
        True -> string.slice(iso, 11, 8)
        False -> iso
      }
  }
}

/// `10-29 14:30` from an ISO timestamp: a conversation card spans days, so the
/// date matters where a log row only needs the time of day.
pub fn short_stamp(at: Option(String)) -> String {
  case at {
    None -> "—"
    Some(iso) ->
      case string.length(iso) >= 16 {
        True -> string.slice(iso, 5, 5) <> " " <> string.slice(iso, 11, 5)
        False -> short_time(Some(iso))
      }
  }
}

