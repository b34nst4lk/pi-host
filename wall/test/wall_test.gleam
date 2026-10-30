//// Pure-mapping tests: no browser, no network, no reader. Everything asserted
//// here is a function of its arguments, which is the point of keeping the
//// formatters, the history and the decoders out of the view.

import gleam/int
import gleam/list
import gleam/string
import gleam/option.{None, Some}
import gleeunit
import gleeunit/should
import lustre/element
import wall/decode
import wall/fake
import wall/model
import wall/view

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

// --- the logs tab ---------------------------------------------------------
//
// The reader's SQL and its human lines are tested in `tests/wall.test.ts`; what
// is asserted here is this side of the contract: the query the tab builds, the
// filter arithmetic, the decoder's tolerance, and that the view really draws a
// row per entry with the raw record and the spill expander attached.

pub fn empty_filters_send_no_kind_test() {
  model.logs_path(model.empty_filters(), None, 50)
  |> should.equal("/api/logs?limit=50&dir=desc")
}

pub fn direction_narrows_the_kinds_test() {
  model.effective_kinds(model.empty_filters()) |> should.equal([])
  model.effective_kinds(model.LogFilters(
    kinds: [],
    direction: model.Incoming,
    query: "",
  ))
  |> should.equal(["pi.user"])
  model.effective_kinds(model.LogFilters(
    kinds: [],
    direction: model.Outgoing,
    query: "",
  ))
  |> should.equal(["pi.assistant", "app.*"])
}

pub fn chips_and_direction_intersect_test() {
  // "in" plus the assistant chip cannot match anything: ask for a kind nobody
  // wrote, so the tab shows an empty page rather than everything.
  model.effective_kinds(model.LogFilters(
    kinds: ["pi.assistant"],
    direction: model.Incoming,
    query: "",
  ))
  |> should.equal(["(no such kind)"])
  // "out" plus two chips keeps only the chip that is outgoing ("out" is the
  // agent's answers and the apps, not the user's steers or the tool results).
  model.effective_kinds(model.LogFilters(
    kinds: ["pi.user", "pi.assistant"],
    direction: model.Outgoing,
    query: "",
  ))
  |> should.equal(["pi.assistant"])
  // an empty direction leaves the chips alone
  model.effective_kinds(model.LogFilters(
    kinds: ["pi.compaction"],
    direction: model.BothWays,
    query: "",
  ))
  |> should.equal(["pi.compaction"])
}

pub fn app_star_matches_the_family_test() {
  model.effective_kinds(model.LogFilters(
    kinds: ["app.*", "pi.user"],
    direction: model.Outgoing,
    query: "",
  ))
  |> should.equal(["app.*"])
}

pub fn logs_path_carries_the_cursor_and_the_search_test() {
  let filters =
    model.LogFilters(kinds: ["pi.user", "app.*"], direction: model.BothWays, query: "a b&c")
  model.logs_path(filters, Some(3509), 200)
  |> should.equal("/api/logs?limit=200&dir=desc&kind=pi.user,app.*&before=3509&q=a%20b%26c")
  // a blank search is no search at all
  model.logs_path(model.LogFilters(..filters, query: "   "), None, 50)
  |> should.equal("/api/logs?limit=50&dir=desc&kind=pi.user,app.*")
}

pub fn url_encode_escapes_the_query_metacharacters_test() {
  model.url_encode("%_&?#+=") |> should.equal("%25_%26%3F%23%2B%3D")
  model.url_encode("plain") |> should.equal("plain")
}

pub fn short_time_takes_the_clock_out_of_an_iso_stamp_test() {
  model.short_time(Some("2026-10-29T14:30:58.000Z")) |> should.equal("14:30:58")
  model.short_time(Some("bogus")) |> should.equal("bogus")
  model.short_time(None) |> should.equal("—")
}

pub fn logs_line_counts_and_names_the_mode_test() {
  model.logs_line(model.empty_logs()) |> should.equal("0 entries · live tail")
  let one =
    model.Logs(
      ..model.empty_logs(),
      entries: [
        model.LogEntry(
          id: 1,
          kind: "pi.user",
          at: None,
          text: "hi",
          thread: None,
          spill: None,
          raw: "{}",
        ),
      ],
    )
  model.logs_line(one) |> should.equal("1 entry · live tail")
  model.logs_line(model.Logs(..one, tailing: False)) |> should.equal("1 entry · paged back")
}

pub fn decodes_a_logs_page_test() {
  let assert Ok(page) = decode.logs(fake.logs_json(model.empty_filters(), 0))
  page.ok |> should.equal(True)
  page.next_before |> should.equal(Some(3604))
  list.length(page.entries) |> should.equal(6)
  let assert Ok(newest) = list.first(page.entries)
  newest.kind |> should.equal("pi.assistant")
  newest.at |> should.equal(Some("2026-10-29T14:30:10.000Z"))
  newest.thread |> should.equal(None)
  newest.spill |> should.equal(None)
  // every row keeps its raw record verbatim, so the expander has something to show
  newest.raw |> should.equal("{\"kind\":\"pi.assistant\",\"id\":3610}")
  let assert Ok(spilled) = page.entries |> list.drop(1) |> list.first
  spilled.spill |> should.equal(Some("/opt/pi-host/storage/spill/full.log"))
  let assert Ok(app) = page.entries |> list.drop(5) |> list.first
  app.kind |> should.equal("app.subagents")
  app.thread |> should.equal(Some("wall-ui"))
}

pub fn fake_fixtures_honour_the_filters_test() {
  let assert Ok(page) =
    decode.logs(fake.logs_json(
      model.LogFilters(kinds: [], direction: model.Incoming, query: ""),
      0,
    ))
  page.entries |> list.map(fn(entry) { entry.kind }) |> should.equal(["pi.user"])

  let assert Ok(searched) =
    decode.logs(fake.logs_json(
      model.LogFilters(kinds: [], direction: model.BothWays, query: "COMPACT"),
      0,
    ))
  searched.entries |> list.map(fn(entry) { entry.kind }) |> should.equal(["pi.compaction"])

  let assert Ok(nothing) =
    decode.logs(fake.logs_json(
      model.LogFilters(kinds: ["pi.assistant"], direction: model.Incoming, query: ""),
      0,
    ))
  nothing.entries |> should.equal([])
  nothing.next_before |> should.equal(None)
}

pub fn tolerates_a_row_with_missing_fields_test() {
  let assert Ok(page) = decode.logs("{\"v\":1,\"ok\":true,\"entries\":[{\"id\":7}]}")
  let assert Ok(entry) = list.first(page.entries)
  entry.id |> should.equal(7)
  entry.kind |> should.equal("unknown")
  entry.text |> should.equal("unknown entry")
  entry.raw |> should.equal("")
  page.next_before |> should.equal(None)
}

pub fn a_failed_read_is_a_message_not_a_crash_test() {
  let assert Ok(page) = decode.logs(
    "{\"v\":1,\"ok\":false,\"error\":\"ledger unavailable\",\"entries\":[]}",
  )
  page.ok |> should.equal(False)
  page.error |> should.equal(Some("ledger unavailable"))
  page.entries |> should.equal([])
}

pub fn rejects_a_non_json_logs_body_test() {
  let assert Error(problem) = decode.logs("<html>502</html>")
  problem |> string.starts_with("unexpected response shape: UnexpectedByte") |> should.be_true()
}

pub fn decodes_a_spill_test() {
  decode.spill(fake.spill_json()) |> should.equal(Ok("line one\nline two\n"))
  decode.spill("{\"ok\":false,\"error\":\"path outside the allowlist\"}")
  |> should.equal(Error("path outside the allowlist"))
  decode.spill("{\"ok\":false}") |> should.equal(Error("no such file"))
  let assert Error(problem) = decode.spill("<html>")
  problem |> string.starts_with("unexpected response shape: ") |> should.be_true()
}

// --- the logs tab: rendering ----------------------------------------------
//
// `element.to_string` renders the virtual DOM the browser would get, so these
// assertions are about the page a reader actually sees.

fn sample_logs() -> model.Logs {
  model.Logs(
    entries: [
      model.LogEntry(
        id: 12,
        kind: "pi.assistant",
        at: Some("2026-10-29T14:30:58.000Z"),
        text: "answered: the wall is up",
        thread: Some("wall-ui"),
        spill: None,
        raw: "{\"kind\":\"pi.assistant\"}",
      ),
      model.LogEntry(
        id: 11,
        kind: "pi.tool-result",
        at: None,
        text: "bash: full output (18 bytes)",
        thread: None,
        spill: Some("/opt/pi-host/storage/spill/full.log"),
        raw: "{}",
      ),
    ],
    next_before: Some(10),
    tailing: True,
    appending: False,
    spills: [#(11, "line one\nline two\n")],
    error: None,
  )
}

fn logs_model() -> model.Model {
  model.Model(
    ..model.initial(model.LiveMode),
    tab: model.LogsTab,
    logs: Some(sample_logs()),
  )
}

fn count_of(haystack: String, needle: String) -> Int {
  string.split(haystack, needle) |> list.length |> fn(parts) { parts - 1 }
}

pub fn the_dashboard_is_the_tab_by_default_test() {
  let html = view.view(model.initial(model.LiveMode)) |> element.to_string
  html |> string.contains("VITALS") |> should.be_true()
  html |> string.contains(">LOGS<") |> should.be_true()
  html |> string.contains(">DASHBOARD<") |> should.be_true()
  html |> count_of("log-row") |> should.equal(0)
}

pub fn the_logs_tab_draws_every_row_test() {
  let html = view.view(logs_model()) |> element.to_string
  // one <details> per entry, and the dashboard is off the page
  html |> count_of("<details") |> should.equal(3)
  html |> string.contains("VITALS") |> should.be_false()
  html |> string.contains("14:30:58") |> should.be_true()
  html |> string.contains("answered: the wall is up") |> should.be_true()
  html |> string.contains("@wall-ui") |> should.be_true()
  html |> string.contains("bash: full output (18 bytes)") |> should.be_true()
  html |> string.contains("2 entries · live tail") |> should.be_true()
  html |> string.contains("older entries available") |> should.be_true()
}

pub fn every_row_carries_its_raw_record_test() {
  let html = view.view(logs_model()) |> element.to_string
  html |> string.contains("log-raw") |> should.be_true()
  html |> string.contains("pi.assistant") |> should.be_true()
}

pub fn only_a_spilled_row_gets_an_expander_test() {
  let html = view.view(logs_model()) |> element.to_string
  html |> count_of("log-spill") |> should.equal(1)
  html |> string.contains("/opt/pi-host/storage/spill/full.log") |> should.be_true()
  // fetched already, so the expander shows the text rather than "press to load"
  html |> string.contains("line one") |> should.be_true()
  html |> string.contains("press to load") |> should.be_false()
}

pub fn the_controls_show_the_current_filters_test() {
  let model_with_filters =
    model.Model(
      ..logs_model(),
      filters: model.LogFilters(
        kinds: ["pi.user"],
        direction: model.Incoming,
        query: "spill",
      ),
    )
  let html = view.view(model_with_filters) |> element.to_string
  html |> string.contains("type=\"search\"") |> should.be_true()
  html |> string.contains("value=\"spill\"") |> should.be_true()
  // the "in" chip and the "pi.user" chip are both active
  html |> count_of("chip active") |> should.equal(2)
}

pub fn an_empty_page_says_so_test() {
  let html =
    view.view(
      model.Model(
        ..logs_model(),
        logs: Some(model.Logs(..model.empty_logs(), error: Some("ledger unavailable"))),
      ),
    )
    |> element.to_string
  html |> string.contains("no entries match") |> should.be_true()
  html |> string.contains("ledger unavailable") |> should.be_true()
}
