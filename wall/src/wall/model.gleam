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
    fleet: List(Agent),
    queue: Option(Queue),
    samples: List(Sample),
    polls: Int,
    error: Option(String),
  )
}

pub type Msg {
  /// Poll the reader (`Live`) or nudge the fixtures (`Fake`).
  Tick
  StateArrived(String)
  SpendArrived(String)
  Failed(String)
  ToggleMode
}

// --- init -----------------------------------------------------------------

pub fn initial(mode: Mode) -> Model {
  Model(
    mode: mode,
    vitals: None,
    spend: None,
    fleet: [],
    queue: None,
    samples: [],
    polls: 0,
    error: None,
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
