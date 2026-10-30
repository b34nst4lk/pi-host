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
import wall/browser
import wall/format
import wall/logs

/// How often the wall polls the reader: 10 s, the pace the sparklines assume.
pub const poll_interval_ms = 10_000

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
///
/// `kind` is what the card IS (`"main"`, `"project"`, `"subagent"`), so one list
/// of cards and one enum cover the fleet: the PROJECTS view is the same list
/// filtered by kind. The last four fields are project-only and `None` elsewhere.
pub type AgentCard {
  AgentCard(
    kind: String,
    name: String,
    state: String,
    branch: String,
    worktree: String,
    last_reply: Option(Int),
    room: Option(String),
    cwd: Option(String),
    summary: Option(String),
    entries: Option(Int),
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
    /// Always "main" in practice; carried so the dashboard can print it.
    spike_kind: String,
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
    tab: logs.Tab,
    /// The LOGS tab's chips and query. The browser's pane shares them, so the two
    /// tabs filter the same way and switching never surprises.
    filters: logs.LogFilters,
    logs: Option(logs.Logs),
    browser: browser.Browser,
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
  TabChosen(logs.Tab)
  DirectionChosen(logs.Direction)
  KindToggled(String)
  QueryChanged(String)
  OlderRequested
  LogsArrived(String)
  SpillRequested(Int, String)
  SpillArrived(Int, String)
  SpillFailed(Int, String)
  /// The browser tab: the picker, the selected space, its stream, the jump list.
  ConversationsArrived(String)
  ConversationChosen(Int)
  BrowserLogsArrived(String)
  /// Landing on a hit: which space it lives in, and which entry to open around.
  HitChosen(Option(Int), Int)
  /// "Back to the tail": drop the window and follow the space again.
  BrowserTailRequested
  SearchChanged(String)
  /// A keypress in the search box; `Enter` submits.
  SearchKeyed(String)
  SearchSubmitted
  SearchArrived(String)
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
    tab: logs.Dashboard,
    filters: logs.empty_filters(),
    logs: None,
    browser: browser.empty_browser(),
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
  <> format.format_count(agents.in_flight)
  <> " in flight · "
  <> format.format_count(agents.queued)
  <> " queued"
}

/// `work: — in flight · — queued` when there are no agents yet.
pub fn empty_agents() -> Agents {
  Agents(
    spike_kind: "main",
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


/// The cards that are projects: the AGENTS list, filtered by kind.
pub fn project_cards(agents: Agents) -> List(AgentCard) {
  list.filter(agents.named, fn(card) { card.kind == "project" })
}

/// The subagent cards, same list, the other side of the filter.
pub fn subagent_cards(agents: Agents) -> List(AgentCard) {
  list.filter(agents.named, fn(card) { card.kind != "project" })
}

/// `!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU` → `!ig3PmgqC-r…XpufmU`.
/// A short id (`!short:jacks.im`) is already readable, so it comes back whole.
pub fn room_short(room: String) -> String {
  case string.length(room) > 20 {
    False -> room
    True ->
      string.slice(room, 0, 11)
      <> "…"
      <> string.slice(room, string.length(room) - 6, string.length(room))
  }
}

/// `app — room !ig3PmgqC-r…XpufmU — 12 entries`: what the projects pane prints
/// above a card's directory. Unknowns say so instead of printing `None`.
pub fn project_line(card: AgentCard) -> String {
  let room = case card.room {
    Some(room) -> room_short(room)
    None -> "no room"
  }
  card.name
  <> " — room "
  <> room
  <> " — "
  <> format.format_count(card.entries)
  <> " entries"
}

/// The directory a project works in, or a plain statement that nothing said.
pub fn project_dir(card: AgentCard) -> String {
  case card.cwd {
    Some(cwd) -> cwd
    None -> "no directory"
  }
}

/// The one-line summary from `AGENTS.md`, or a nudge to write one.
pub fn project_summary(card: AgentCard) -> String {
  case card.summary {
    Some(summary) if summary != "" -> summary
    _ -> "no AGENTS.md summary yet"
  }
}

/// `2 projects` / `no projects yet`, the pane's heading line.
pub fn project_count_line(cards: List(AgentCard)) -> String {
  case cards {
    [] -> "no projects yet — bind one with /project new <name> in a room"
    [_] -> "1 project"
    _ -> int.to_string(list.length(cards)) <> " projects"
  }
}
