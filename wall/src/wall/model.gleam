//// The wall's state, its messages and the pure mappings between them.
////
//// Nothing in this module touches the network, the DOM or the clock: every
//// function here is a pure function of its arguments so it can be tested with
//// gleeunit without a browser (see `test/wall_test.gleam`).
////
//// The shapes mirror `CONTRACT.md` v1. Every field the reader can fail to
//// provide is an `Option`: the wall renders `—` for `None` and never invents a
//// number.

import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string

/// How many polls of history the sparklines keep (60 × 10 s = 10 minutes).
pub const history_length = 60

// --- contract values -------------------------------------------------------

/// How fresh the sync cursor is. `Unknown` covers "the document is missing" and
/// "the reader could not read the ledger" — both render the same way.
pub type Freshness {
  Live
  Slow
  Stale
  Unknown
}

pub type Vitals {
  Vitals(
    entries: Option(Int),
    ledger_bytes: Option(Int),
    sync_state: Freshness,
    sync_age_s: Option(Int),
    sync_batch: Option(String),
    sync_seq: Option(Int),
    errors_24h: Option(Int),
    last_error: Option(String),
    daemon_uptime_s: Option(Int),
    container_uptime_s: Option(Int),
  )
}

pub type Spend {
  Spend(
    requests: Option(Int),
    input_tokens: Option(Int),
    output_tokens: Option(Int),
    balance_usd: Option(Float),
    percent_used: Option(Float),
    used_in_window: Option(Int),
    max_per_minute: Option(Int),
    cached: Bool,
    stale: Bool,
    error: Option(String),
  )
}

pub type Agent {
  Agent(
    name: String,
    branch: String,
    worktree: String,
    reports: Int,
    state: String,
  )
}

/// One agent card, judged by the reader's state enum. `last_reply` is the newest
/// answer entry the registry knows — `None` renders as `—`, never `0`.
pub type AgentCard {
  AgentCard(
    name: String,
    state: String,
    branch: String,
    worktree: String,
    last_reply: Option(Int),
  )
}

/// A held anchor nothing names: prunable, and worth seeing.
pub type Orphan {
  Orphan(anchor: Int, conversation: Option(Int))
}

/// The AGENTS card: pi-spike, the named subagents, the orphans, and the work
/// counter that replaced the old "tasks running" line.
pub type Agents {
  Agents(
    spike_state: String,
    named: List(AgentCard),
    orphans: List(Orphan),
    retired: Option(Int),
    in_flight: Option(Int),
    queued: Option(Int),
  )
}

pub type Queue {
  Queue(
    inbox_depth: Option(Int),
    running: Option(Int),
    pending: Option(Int),
    unanswered: Option(Int),
    errors: List(String),
  )
}

/// One poll's worth of history for the sparklines.
pub type Sample {
  Sample(at: Int, entries: Int, running: Int, requests: Int)
}

/// Where the model's data comes from: the reader, or the built-in fixtures.
pub type Mode {
  LiveMode
  FakeMode
}

pub type Model {
  Model(
    mode: Mode,
    vitals: Option(Vitals),
    spend: Option(Spend),
    agents: Option(Agents),
    queue: Option(Queue),
    samples: List(Sample),
    polls: Int,
    error: Option(String),
    /// Which half of the wall is showing. The dashboard keeps polling either
    /// way, so switching back never shows stale cards.
    tab: Tab,
    filters: LogFilters,
    logs: Option(Logs),
  )
}

pub type Msg {
  /// Poll the reader (`Live`) or nudge the fixtures (`Fake`).
  Tick
  StateArrived(String)
  SpendArrived(String)
  Failed(String)
  ToggleMode
  /// The logs tab: which half shows, what the query is, and the pages it got.
  TabChosen(Tab)
  DirectionChosen(Direction)
  KindToggled(String)
  QueryChanged(String)
  OlderRequested
  LogsArrived(String)
  SpillRequested(Int, String)
  SpillArrived(Int, String)
  SpillFailed(Int, String)
}

// --- init -----------------------------------------------------------------

pub fn initial(mode: Mode) -> Model {
  Model(
    mode: mode,
    vitals: None,
    spend: None,
    agents: None,
    queue: None,
    samples: [],
    polls: 0,
    error: None,
    tab: Dashboard,
    filters: empty_filters(),
    logs: None,
  )
}

// --- history --------------------------------------------------------------

/// Append one sample, keeping at most `history_length` of them (newest last).
/// Samples are only appended for values that actually arrived — a `None` from
/// the reader leaves the sparkline alone instead of drawing a fake zero.
pub fn push_sample(samples: List(Sample), sample: Sample) -> List(Sample) {
  let all = list.append(samples, [sample])
  case list.length(all) > history_length {
    True -> list.drop(all, list.length(all) - history_length)
    False -> all
  }
}

/// The normalised points of a sparkline: `#(x, y)` in a `0..width` × `0..height`
/// box, oldest first, ready for `svg.polyline`. `[]` when there is nothing to
/// draw (fewer than two samples).
pub fn sparkline_points(values: List(Float), width: Int, height: Int) -> List(#(Float, Float)) {
  let count = list.length(values)
  case count < 2 {
    False -> {
      let low = list.fold(values, list.first(values) |> result.unwrap(0.0), float.min)
      let high = list.fold(values, list.first(values) |> result.unwrap(0.0), float.max)
      let span = high -. low
      let box_height = int.to_float(height)
      let step = int.to_float(width) /. int.to_float(count - 1)
      values
      |> list.index_map(fn(value, index) {
        let x = int.to_float(index) *. step
        let share = case span >. 0.0 {
          True -> { value -. low } /. span
          // A flat line sits on the baseline rather than floating mid-box.
          False -> 0.0
        }
        #(x, box_height -. share *. box_height)
      })
    }
    True -> []
  }
}

/// `"0,10 50,20 …"` — the `points` attribute of an `svg.polyline`.
pub fn polyline_points(points: List(#(Float, Float))) -> String {
  points
  |> list.map(fn(point) { float.to_string(point.0) <> "," <> float.to_string(point.1) })
  |> string.join(" ")
}

// --- human formatting -----------------------------------------------------

/// `—` for nothing, `12,043` for counts, `1.2M` above a million.
pub fn format_count(value: Option(Int)) -> String {
  case value {
    None -> "—"
    Some(value) -> {
      let magnitude = int.absolute_value(value)
      case magnitude >= 1_000_000 {
        True -> one_decimal(int.to_float(value) /. 1_000_000.0) <> "M"
        False ->
          case magnitude >= 10_000 {
            True -> one_decimal(int.to_float(value) /. 1_000.0) <> "k"
            False -> group_digits(int.to_string(value))
          }
      }
    }
  }
}

/// `—` for nothing, `820 KB`/`1.4 MB` for byte counts.
pub fn format_bytes(value: Option(Int)) -> String {
  case value {
    None -> "—"
    Some(0) -> "0 B"
    Some(bytes) -> {
      let as_float = int.to_float(bytes)
      case as_float >=. 1024.0 *. 1024.0 {
        True -> one_decimal(as_float /. { 1024.0 *. 1024.0 }) <> " MB"
        False ->
          case as_float >=. 1024.0 {
            True -> one_decimal(as_float /. 1024.0) <> " KB"
            False -> int.to_string(bytes) <> " B"
          }
      }
    }
  }
}

/// `—` for nothing, `7 s`/`42 min`/`3 h 07 m` for durations.
pub fn format_age(seconds: Option(Int)) -> String {
  case seconds {
    None -> "—"
    Some(seconds) ->
      case seconds < 90 {
        True -> int.to_string(seconds) <> " s"
        False ->
          case seconds < 3600 {
            True -> int.to_string(seconds / 60) <> " min"
            False -> int.to_string(seconds / 3600) <> " h " <> pad2(seconds % 3600 / 60) <> " m"
          }
      }
  }
}

/// `$0.00`, always two decimals.
pub fn format_usd(value: Option(Float)) -> String {
  case value {
    None -> "—"
    Some(usd) -> {
      let cents = float.round(usd *. 100.0)
      let sign = case cents < 0 {
        True -> "-"
        False -> ""
      }
      let absolute = int.absolute_value(cents)
      "$" <> sign <> int.to_string(absolute / 100) <> "." <> pad2(absolute % 100)
    }
  }
}

/// `12%`, whole numbers, `—` when unknown.
pub fn format_percent(value: Option(Float)) -> String {
  case value {
    None -> "—"
    Some(percent) -> int.to_string(float.round(percent)) <> "%"
  }
}

/// A budget bar's fill in `0.0..1.0`; clamped, so the bar never overflows.
pub fn budget_fraction(used: Option(Int), limit: Option(Int)) -> Float {
  case used, limit {
    Some(used), Some(limit) ->
      case limit <= 0 {
        True -> 0.0
        False -> float.max(0.0, float.min(1.0, int.to_float(used) /. int.to_float(limit)))
      }
    _, _ -> 0.0
  }
}

pub fn freshness_from_state(text: String) -> Freshness {
  case text {
    "live" -> Live
    "slow" -> Slow
    "stale" -> Stale
    _ -> Unknown
  }
}

// --- the agent-state enum -------------------------------------------------

/// The six states, in precedence order (highest first), plus the seventh the
/// reader sends when it cannot tell. Kept here so the view and the tests agree
/// on the vocabulary instead of repeating string literals.
pub const agent_states = [
  "working",
  "queued",
  "reporting",
  "alive",
  "orphaned",
  "retired",
  "unknown",
]

/// The badge label for a state word. Anything the reader invents beyond the
/// enum renders as `unknown` rather than as a confidently wrong badge.
pub fn agent_state_label(state: String) -> String {
  case state {
    "working" -> "working"
    "queued" -> "queued"
    "reporting" -> "reporting"
    "alive" -> "alive"
    "orphaned" -> "unnamed (prunable)"
    "retired" -> "retired"
    _ -> "unknown"
  }
}

/// The CSS class for a state badge; unknown words get the neutral class.
pub fn agent_state_class(state: String) -> String {
  case state {
    "working" -> "badge state-working"
    "queued" -> "badge state-queued"
    "reporting" -> "badge state-reporting"
    "alive" -> "badge state-alive"
    "orphaned" -> "badge state-orphaned"
    "retired" -> "badge state-retired"
    _ -> "badge state-unknown"
  }
}

/// `work: 3 in flight · 0 queued` — the line that replaced "tasks running".
pub fn work_line(agents: Agents) -> String {
  "work: "
  <> format_count(agents.in_flight)
  <> " in flight · "
  <> format_count(agents.queued)
  <> " queued"
}

/// `work: — in flight · — queued` when there are no agents yet.
pub fn empty_agents() -> Agents {
  Agents(
    spike_state: "unknown",
    named: [],
    orphans: [],
    retired: None,
    in_flight: None,
    queued: None,
  )
}

/// `2 unnamed (prunable)` / `no orphans`, for the one-line summary.
pub fn orphan_summary(agents: Agents) -> String {
  case list.length(agents.orphans) {
    0 -> "no orphans"
    count -> int.to_string(count) <> " unnamed (prunable)"
  }
}

/// One decimal place, with a trailing `.0` dropped: `1.2`, `3`, `5.6`.
fn one_decimal(value: Float) -> String {
  let tenths = float.round(value *. 10.0)
  let whole = tenths / 10
  let fraction = int.absolute_value(tenths % 10)
  case fraction {
    0 -> int.to_string(whole)
    _ -> int.to_string(whole) <> "." <> int.to_string(fraction)
  }
}

fn pad2(value: Int) -> String {
  case value < 10 {
    True -> "0" <> int.to_string(value)
    False -> int.to_string(value)
  }
}

/// `1832` → `1,832`; `1234567` → `1,234,567`; keeps a leading minus.
fn group_digits(text: String) -> String {
  let negative = string.starts_with(text, "-")
  let digits = case negative {
    True -> string.drop_start(text, 1)
    False -> text
  }
  let head_length = case string.length(digits) % 3 {
    0 -> 3
    remainder -> remainder
  }
  let head = string.slice(digits, 0, head_length)
  let tail = chunks_of_three(string.drop_start(digits, head_length), [])
  let grouped = string.join([head, ..tail], ",")
  case negative {
    True -> "-" <> grouped
    False -> grouped
  }
}

fn chunks_of_three(remaining: String, acc: List(String)) -> List(String) {
  case string.length(remaining) {
    0 -> list.reverse(acc)
    _ -> chunks_of_three(string.drop_start(remaining, 3), [string.slice(remaining, 0, 3), ..acc])
  }
}

// --- the logs tab ---------------------------------------------------------
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

pub type Tab {
  Dashboard
  LogsTab
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
