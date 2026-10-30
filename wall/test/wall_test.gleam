//// Pure-mapping tests: no browser, no network, no reader. Everything asserted
//// here is a function of its arguments, which is the point of keeping the
//// formatters, the history and the decoders out of the view.

import gleam/int
import gleam/list
import gleam/string
import gleam/option.{None, Some}
import gleeunit
import gleeunit/should
import wall/decode
import wall/fake
import wall/model

pub fn main() {
  gleeunit.main()
}

// --- formatting -----------------------------------------------------------

pub fn format_count_test() {
  model.format_count(None) |> should.equal("—")
  model.format_count(Some(0)) |> should.equal("0")
  model.format_count(Some(842)) |> should.equal("842")
  model.format_count(Some(1832)) |> should.equal("1,832")
  model.format_count(Some(1_234_567)) |> should.equal("1.2M")
  model.format_count(Some(12_400)) |> should.equal("12.4k")
  model.format_count(Some(-4_200)) |> should.equal("-4,200")
}

pub fn format_bytes_test() {
  model.format_bytes(None) |> should.equal("—")
  model.format_bytes(Some(0)) |> should.equal("0 B")
  model.format_bytes(Some(820)) |> should.equal("820 B")
  model.format_bytes(Some(2048)) |> should.equal("2 KB")
  model.format_bytes(Some(5_918_720)) |> should.equal("5.6 MB")
}

pub fn format_age_test() {
  model.format_age(None) |> should.equal("—")
  model.format_age(Some(7)) |> should.equal("7 s")
  model.format_age(Some(600)) |> should.equal("10 min")
  model.format_age(Some(3660)) |> should.equal("1 h 01 m")
}

pub fn format_usd_test() {
  model.format_usd(None) |> should.equal("—")
  model.format_usd(Some(0.0)) |> should.equal("$0.00")
  model.format_usd(Some(1.5)) |> should.equal("$1.50")
  model.format_usd(Some(12.345)) |> should.equal("$12.35")
}

pub fn format_percent_test() {
  model.format_percent(None) |> should.equal("—")
  model.format_percent(Some(12.5)) |> should.equal("13%")
}

pub fn budget_fraction_test() {
  // clamped both ways, and 0.0 rather than a division by zero
  model.budget_fraction(Some(5), Some(10)) |> should.equal(0.5)
  model.budget_fraction(Some(50), Some(10)) |> should.equal(1.0)
  model.budget_fraction(Some(1), Some(0)) |> should.equal(0.0)
  model.budget_fraction(None, Some(10)) |> should.equal(0.0)
}

// --- history --------------------------------------------------------------

fn count_up(limit: Int, acc: List(Int)) -> List(Int) {
  case limit <= 0 {
    True -> acc
    False -> count_up(limit - 1, [limit, ..acc])
  }
}

pub fn push_sample_caps_history_test() {
  let samples =
    count_up(100, [])
    |> list.fold([], fn(acc, index) {
      model.push_sample(acc, model.Sample(at: index, entries: index, running: 1, requests: index))
    })
  list.length(samples) |> should.equal(model.history_length)
  // newest last, oldest dropped
  case list.last(samples) {
    Ok(sample) -> sample.entries |> should.equal(100)
    Error(_) -> should.fail()
  }
  case list.first(samples) {
    Ok(sample) -> sample.entries |> should.equal(41)
    Error(_) -> should.fail()
  }
}

pub fn sparkline_needs_two_points_test() {
  model.sparkline_points([5.0], 100, 24) |> should.equal([])
}

pub fn sparkline_scales_to_the_box_test() {
  let points = model.sparkline_points([10.0, 20.0, 30.0], 100, 20)
  points
  |> should.equal([#(0.0, 20.0), #(50.0, 10.0), #(100.0, 0.0)])
}

pub fn sparkline_flat_line_sits_on_the_baseline_test() {
  model.sparkline_points([7.0, 7.0], 10, 10)
  |> should.equal([#(0.0, 10.0), #(10.0, 10.0)])
}

pub fn polyline_points_joins_with_spaces_test() {
  model.polyline_points([#(0.0, 20.0), #(50.0, 10.0)])
  |> should.equal("0.0,20.0 50.0,10.0")
}

// --- decoding -------------------------------------------------------------

pub fn decodes_a_reader_state_test() {
  let result = decode.state(fake.state_json(0))
  let assert Ok(state) = result
  state.vitals.entries |> should.equal(Some(1810))
  state.vitals.sync_state |> should.equal(model.Live)
  state.vitals.sync_seq |> should.equal(Some(41))
  state.queue.inbox_depth |> should.equal(Some(0))
  state.agents.spike_state |> should.equal("working")
  state.agents.in_flight |> should.equal(Some(3))
  state.agents.queued |> should.equal(Some(0))
  state.agents.retired |> should.equal(Some(2))
  list.length(state.agents.named) |> should.equal(3)
  case list.first(state.agents.named) {
    Ok(card) -> {
      card.name |> should.equal("reader")
      card.state |> should.equal("working")
      card.branch |> should.equal("worktree-reader")
      card.last_reply |> should.equal(Some(2393))
    }
    Error(_) -> should.fail()
  }
  list.length(state.agents.orphans) |> should.equal(1)
}

pub fn decodes_a_reader_spend_test() {
  let assert Ok(spend) = decode.spend(fake.spend_json(0))
  spend.requests |> should.equal(Some(126))
  spend.balance_usd |> should.equal(Some(0.0))
  spend.percent_used |> should.equal(Some(12.5))
  spend.cached |> should.equal(True)
  spend.stale |> should.equal(False)
  spend.error |> should.equal(None)
}

pub fn tolerates_missing_fields_test() {
  let assert Ok(state) = decode.state("{\"v\":1,\"ok\":true}")
  state.vitals.entries |> should.equal(None)
  state.vitals.sync_state |> should.equal(model.Unknown)
  state.vitals.sync_age_s |> should.equal(None)
  state.agents.named |> should.equal([])
  state.agents.spike_state |> should.equal("unknown")
  state.agents.in_flight |> should.equal(None)
}

pub fn rejects_a_non_json_body_test() {
  let assert Error(problem) = decode.state("<html>502 Bad Gateway</html>")
  // one line, no stack, and it names the failure kind
  problem |> string.starts_with("unexpected response shape: UnexpectedByte") |> should.be_true()
}

pub fn spend_without_money_is_unknown_not_zero_test() {
  let assert Ok(spend) = decode.spend("{\"v\":1,\"ok\":true,\"usage\":{\"requests\":3}}")
  spend.requests |> should.equal(Some(3))
  spend.balance_usd |> should.equal(None)
  model.format_usd(spend.balance_usd) |> should.equal("—")
}

// --- the agent-state enum -------------------------------------------------
//
// The precedence itself lives in the reader (`src/wall/agents.ts`, tested in
// `tests/wall.test.ts`); what is asserted here is the vocabulary: every state the
// reader can send renders as exactly one badge, and a state it invents falls back
// to `unknown` instead of a confidently wrong label.

pub fn every_agent_state_has_a_badge_test() {
  model.agent_states
  |> list.map(model.agent_state_label)
  |> should.equal([
    "working",
    "queued",
    "reporting",
    "alive",
    "unnamed (prunable)",
    "retired",
    "unknown",
  ])
}

pub fn agent_state_classes_are_distinct_test() {
  let classes = list.map(model.agent_states, model.agent_state_class)
  classes |> should.equal([
    "badge state-working",
    "badge state-queued",
    "badge state-reporting",
    "badge state-alive",
    "badge state-orphaned",
    "badge state-retired",
    "badge state-unknown",
  ])
}

pub fn unknown_agent_state_degrades_test() {
  model.agent_state_label("thinking") |> should.equal("unknown")
  model.agent_state_label("") |> should.equal("unknown")
  model.agent_state_class("thinking") |> should.equal("badge state-unknown")
}

/// One fixture per state: the decoder must carry each state through untouched, so
/// a card never gets the badge of the card above it.
pub fn decodes_all_seven_agent_states_test() {
  let json =
    "{\"v\":1,\"ok\":true,\"agents\":{\"spike\":{\"state\":\"queued\",\"conversation\":1},"
    <> "\"named\":["
    <> "{\"name\":\"a\",\"state\":\"working\"},"
    <> "{\"name\":\"b\",\"state\":\"queued\"},"
    <> "{\"name\":\"c\",\"state\":\"reporting\"},"
    <> "{\"name\":\"d\",\"state\":\"alive\"},"
    <> "{\"name\":\"e\",\"state\":\"orphaned\"},"
    <> "{\"name\":\"f\",\"state\":\"retired\"},"
    <> "{\"name\":\"g\",\"state\":\"unknown\"}],"
    <> "\"orphans\":[],\"retired\":0,\"work\":{\"in_flight\":0,\"queued\":1}}}"
  let assert Ok(state) = decode.state(json)
  state.agents.spike_state |> should.equal("queued")
  state.agents.named
  |> list.map(fn(card) { card.state })
  |> should.equal([
    "working",
    "queued",
    "reporting",
    "alive",
    "orphaned",
    "retired",
    "unknown",
  ])
}

/// A card with no `state` (an older reader) is unknown, never "alive".
pub fn agent_without_state_is_unknown_test() {
  let assert Ok(state) = decode.state("{\"v\":1,\"ok\":true,\"agents\":{\"named\":[{\"name\":\"x\"}]}}")
  case list.first(state.agents.named) {
    Ok(card) -> card.state |> should.equal("unknown")
    Error(_) -> should.fail()
  }
}

pub fn work_line_test() {
  let agents = model.Agents(
    spike_state: "working",
    named: [],
    orphans: [],
    retired: Some(0),
    in_flight: Some(3),
    queued: Some(1),
  )
  model.work_line(agents) |> should.equal("work: 3 in flight · 1 queued")
  model.work_line(model.empty_agents())
  |> should.equal("work: — in flight · — queued")
}

pub fn orphan_summary_test() {
  let one = model.Agents(
    ..model.empty_agents(),
    orphans: [model.Orphan(2201, Some(2202))],
  )
  model.orphan_summary(model.empty_agents()) |> should.equal("no orphans")
  model.orphan_summary(one) |> should.equal("1 unnamed (prunable)")
  model.orphan_summary(model.Agents(
    ..one,
    orphans: [model.Orphan(1, None), model.Orphan(2, Some(3))],
  ))
  |> should.equal("2 unnamed (prunable)")
}

/// A named agent's last answer is an entry id or `—`; there is no zero.
pub fn last_reply_renders_as_entry_or_dash_test() {
  let assert Ok(state) = decode.state(fake.state_json(0))
  state.agents.named
  |> list.map(fn(card) {
    case card.last_reply {
      option.Some(entry) -> int.to_string(entry)
      option.None -> "—"
    }
  })
  |> should.equal(["2393", "2409", "2181"])
}
