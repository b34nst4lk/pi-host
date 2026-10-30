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
import wall
import wall/decode
import wall/fake
import wall/model
import wall/pretty
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

// --- pretty-printing an expanded record ------------------------------------
//
// The reader stores each record verbatim and compact; the row's expander indents
// it for a human without ever touching the wire shape.

pub fn a_compact_record_gains_lines_test() {
  pretty.json("{\"kind\":\"pi.assistant\",\"id\":3610}")
  |> should.equal("{\n  \"kind\": \"pi.assistant\",\n  \"id\": 3610\n}")
}

pub fn nesting_adds_a_level_each_time_test() {
  pretty.json("{\"a\":{\"b\":[1,2]}}")
  |> should.equal(
    "{\n  \"a\": {\n    \"b\": [\n      1,\n      2\n    ]\n  }\n}",
  )
}

pub fn empty_containers_stay_on_one_line_test() {
  pretty.json("{\"a\":{},\"b\":[],\"c\":[{}]}")
  |> should.equal("{\n  \"a\": {},\n  \"b\": [],\n  \"c\": [\n    {}\n  ]\n}")
}

pub fn string_literals_are_never_reformatted_test() {
  // braces, commas, colons and escaped quotes inside a string are content
  pretty.json("{\"t\":\"a {b}, c: \\\"d\\\"\"}")
  |> should.equal("{\n  \"t\": \"a {b}, c: \\\"d\\\"\"\n}")
  // an escaped backslash does not unescape the quote after it
  pretty.json("{\"t\":\"back\\\\\"}")
  |> should.equal("{\n  \"t\": \"back\\\\\"\n}")
}

pub fn top_level_shapes_are_kept_test() {
  pretty.json("[]") |> should.equal("[]")
  pretty.json("[1,true,null]") |> should.equal("[\n  1,\n  true,\n  null\n]")
  // already indented input is re-indented, not doubled
  pretty.json("{ \"a\" : 1 }") |> should.equal("{\n  \"a\": 1\n}")
}

pub fn a_record_that_is_not_json_is_left_alone_test() {
  pretty.json("not a record at all") |> should.equal("not a record at all")
  pretty.json("") |> should.equal("")
  pretty.json("{\"truncated\":") |> should.equal("{\"truncated\":")
}

pub fn an_enormous_record_is_not_indented_test() {
  let huge = "{\"a\":\"" <> string.repeat("x", pretty.max_pretty_chars) <> "\"}"
  pretty.json(huge) |> should.equal(huge)
}

pub fn the_expander_shows_the_indented_record_test() {
  let html = view.view(logs_model()) |> element.to_string
  html
  |> string.contains("{\n  &quot;kind&quot;: &quot;pi.assistant&quot;\n}")
  |> should.be_true()
}

// --- the browser tab: decoding, the rail, the jump ------------------------

fn sample_conversation(id: Int, kind: String, title: String, state: String) -> model.Conversation {
  model.Conversation(
    id: id,
    kind: kind,
    title: title,
    state: state,
    entries: 2,
    first_at: Some("2026-10-29T13:02:00.000Z"),
    last_at: Some("2026-10-29T14:29:11.000Z"),
  )
}

/// What two polls of the browser tab leave behind: the rail, the selection, and
/// the selected space's stream.
fn browser_model() -> model.Model {
  let assert Ok(page) = decode.conversations(fake.conversations_json())
  let browser =
    model.Browser(
      ..model.empty_browser(),
      conversations: model.order_conversations(page.items),
    )
  let browser = model.select_conversation(browser, 1)
  let assert Ok(logs) = decode.logs(fake.browser_logs_json(1, model.empty_filters(), 0))
  model.Model(
    ..model.initial(model.LiveMode),
    tab: model.BrowserTab,
    browser: model.Browser(
      ..browser,
      stream: Some(
        model.Logs(
          entries: logs.entries,
          next_before: logs.next_before,
          tailing: True,
          appending: False,
          spills: [],
          error: None,
        ),
      ),
    ),
  )
}

pub fn the_conversations_decoder_reads_the_rail_test() {
  let assert Ok(page) = decode.conversations(fake.conversations_json())
  page.ok |> should.be_true()
  page.error |> should.equal(None)
  page
    |> fn(page) { model.order_conversations(page.items) }
    |> list.map(fn(item) { #(item.id, item.kind, item.title) })
    |> should.equal([
      #(1, "main", "main"),
      #(2166, "child", "reader"),
      #(2402, "child", "wall-ui"),
      #(2775, "child", "conversation 2775"),
    ])
}

pub fn a_conversation_with_drifted_fields_decodes_as_unknown_test() {
  // Every field is the wrong type: the card must say it does not know rather
  // than crash the tab.
  let assert Ok(page) = decode.conversations(
    "{\"ok\":true,\"conversations\":[{\"id\":\"x\",\"kind\":7,\"title\":null,\"state\":[],\"entries\":\"many\"}]}",
  )
  let assert [item] = page.items
  item.id |> should.equal(0)
  item.kind |> should.equal("unknown")
  item.title |> should.equal("unknown")
  item.state |> should.equal("unknown")
  item.entries |> should.equal(0)
  item.first_at |> should.equal(None)
  model.agent_state_label(item.state) |> should.equal("unknown")
}

pub fn an_unreadable_conversations_body_is_an_error_not_a_crash_test() {
  let assert Error(problem) = decode.conversations("<html>not json</html>")
  problem |> string.starts_with("unexpected response shape: ") |> should.be_true()
  // `ok:false` is data, not a decode failure: the rail shows why it is empty.
  let assert Ok(page) = decode.conversations("{\"ok\":false,\"error\":\"ledger is locked\"}")
  page.ok |> should.be_false()
  page.error |> should.equal(Some("ledger is locked"))
  page.items |> should.equal([])
}

pub fn the_search_decoder_reads_the_jump_list_test() {
  let assert Ok(page) = decode.search(fake.search_json("browser"))
  page.ok |> should.be_true()
  page
    |> fn(page) { list.map(page.hits, fn(hit) { #(hit.conversation, hit.entry, hit.conversation_title) }) }
    |> should.equal([
      #(Some(1), 4112, "main"),
      #(Some(1), 4110, "main"),
      #(Some(2402), 4110, "wall-ui"),
    ])
}

pub fn a_drifted_hit_still_renders_but_cannot_be_jumped_to_test() {
  let assert Ok(page) = decode.search(
    "{\"ok\":true,\"hits\":[{\"entry_id\":\"x\",\"conversation_id\":null,\"text\":7}]}",
  )
  let assert [hit] = page.hits
  hit.conversation |> should.equal(None)
  hit.entry |> should.equal(0)
  hit.conversation_title |> should.equal("unknown")
  hit.text |> should.equal("unknown entry")
  // A hit with no conversation is inert: jumping to `None` changes nothing.
  model.jump_to_hit(model.empty_browser(), hit.conversation, hit.entry)
  |> should.equal(model.empty_browser())
}

pub fn the_rail_pins_main_first_then_children_in_id_order_test() {
  [
    sample_conversation(9, "child", "b", "alive"),
    sample_conversation(3, "child", "a", "alive"),
    sample_conversation(1, "main", "main", "working"),
    sample_conversation(2, "child", "c", "alive"),
  ]
  |> model.order_conversations
  |> list.map(fn(item) { item.id })
  |> should.equal([1, 2, 3, 9])

  model.conversation_line(sample_conversation(1, "main", "main", "working"))
  |> should.equal("2 entries")
  model.conversation_span(sample_conversation(1, "main", "main", "working"))
  |> should.equal("10-29 13:02 → 10-29 14:29")
}

pub fn the_browser_asks_for_one_conversation_and_a_window_test() {
  // The LOGS tab is unchanged: no conversation, no window.
  model.logs_path(model.empty_filters(), None, 50)
  |> should.equal("/api/logs?limit=50&dir=desc")
  model.logs_path_for(model.empty_filters(), Some(2166), None, 50, None)
  |> should.equal("/api/logs?limit=50&dir=desc&conversation=2166")
  // Landing on a hit: the same page, as a window around that entry.
  model.logs_path_for(model.empty_filters(), Some(2166), None, 50, Some(4110))
  |> should.equal("/api/logs?limit=50&dir=desc&conversation=2166&around=4110")
  // The search is over everything, so it carries no kind filter.
  model.search_path("  wall & browser  ", 25)
  |> should.equal("/api/search?limit=25&q=wall%20%26%20browser")
  model.search_path("", 25) |> should.equal("/api/search?limit=25&q=")
}

pub fn a_hit_selects_its_conversation_and_opens_a_window_test() {
  let start = browser_model()
  start.browser.selected |> should.equal(Some(1))

  let #(landed, _load) = wall.update(start, model.HitChosen(Some(2166), 4110))
  landed.tab |> should.equal(model.BrowserTab)
  landed.browser.selected |> should.equal(Some(2166))
  landed.browser.anchor |> should.equal(Some(4110))

  // The window arrives: it is *not* a tail, so the 10 s poll cannot move the
  // rows out from under the reader.
  let assert Ok(page) = decode.logs(fake.browser_logs_json(2166, model.empty_filters(), 0))
  let #(window, _) = wall.update(landed, model.BrowserLogsArrived(fake.browser_logs_json(2166, model.empty_filters(), 0)))
  let assert Some(stream) = window.browser.stream
  stream.tailing |> should.be_false()
  stream.entries |> list.length |> should.equal(list.length(page.entries))

  // "back to the tail" drops the window and follows the space again.
  let #(tailing, _) = wall.update(window, model.BrowserTailRequested)
  tailing.browser.anchor |> should.equal(None)
}

pub fn compaction_entries_are_dividers_in_the_browser_only_test() {
  model.is_divider("pi.compaction") |> should.be_true()
  model.is_divider("pi.user") |> should.be_false()
  model.divider_label(0) |> should.equal("— summarized history begins —")
  model.divider_label(3) |> should.equal("— summarized history continues —")

  let html = view.view(browser_model()) |> element.to_string
  // Two compaction rows in the fixture: two dividers, first/continues.
  html |> count_of("class=\"log-divider\"") |> should.equal(2)
  html |> string.contains("— summarized history begins —") |> should.be_true()
  html |> string.contains("— summarized history continues —") |> should.be_true()
  // The other five entries are ordinary rows: nothing is collapsed or hidden.
  html |> count_of("class=\"log-row\"") |> should.equal(5)
  html |> string.contains("the browser tab is up") |> should.be_true()
  html |> string.contains("system: preamble + 12 tools") |> should.be_true()
}

pub fn the_same_rows_render_in_the_logs_tab_without_dividers_test() {
  let assert Ok(page) = decode.logs(fake.browser_logs_json(1, model.empty_filters(), 0))
  let logs =
    model.Logs(
      entries: page.entries,
      next_before: page.next_before,
      tailing: True,
      appending: False,
      spills: [],
      error: None,
    )
  let html =
    view.view(model.Model(..model.initial(model.LiveMode), tab: model.LogsTab, logs: Some(logs)))
    |> element.to_string
  html |> count_of("class=\"log-divider\"") |> should.equal(0)
  html |> string.contains("pi.compaction") |> should.be_true()
  html |> count_of("class=\"log-row\"") |> should.equal(7)
}

pub fn the_rail_renders_one_card_per_space_with_its_state_test() {
  let html = view.view(browser_model()) |> element.to_string
  html |> count_of("space-card") |> should.equal(4)
  // The selected card is marked, and main is the first one drawn.
  html |> string.contains("space-card selected") |> should.be_true()
  html |> string.contains("reader") |> should.be_true()
  html |> string.contains(">working<") |> should.be_true()
  html |> string.contains("main · working") |> should.be_true()
  // An unnamed space says so instead of guessing a name.
  html |> string.contains("conversation 2775") |> should.be_true()
}

pub fn the_search_box_searches_once_on_enter_test() {
  let start = browser_model()

  // Typing changes the box, not the hits.
  let #(typed, _) = wall.update(start, model.SearchChanged("brow"))
  typed.browser.search.query |> should.equal("brow")
  typed.browser.search.asked |> should.equal("")

  // Enter submits what is in the box.
  let #(asked, _search) = wall.update(typed, model.SearchKeyed("Enter"))
  asked.browser.search.asked |> should.equal("brow")
  asked.browser.search.loading |> should.be_true()

  let #(with_hits, _) = wall.update(asked, model.SearchArrived(fake.search_json("browser")))
  with_hits.browser.search.loading |> should.be_false()
  with_hits.browser.search.hits |> list.length |> should.equal(3)
  with_hits.browser.search.error |> should.equal(None)
  model.search_line(with_hits.browser.search) |> should.equal("3 hits for brow")

  // The hits list names the space each hit lives in.
  let html = view.view(with_hits) |> element.to_string
  html |> count_of("class=\"hit\"") |> should.equal(3)
  html |> string.contains("main") |> should.be_true()
  html |> string.contains("wall-ui") |> should.be_true()
}

pub fn an_empty_search_is_a_mistake_and_says_so_test() {
  let #(next, _) = wall.update(browser_model(), model.SearchSubmitted)
  next.browser.search.loading |> should.be_false()
  next.browser.search.asked |> should.equal("")
  next.browser.search.error |> should.equal(Some("type something to search for"))
  model.search_line(next.browser.search) |> should.equal("search every conversation")

  // The reader's own refusal is shown too, not swallowed.
  let #(typed, _) = wall.update(browser_model(), model.SearchChanged("wall"))
  let #(asked, _) = wall.update(typed, model.SearchSubmitted)
  let #(refused, _) = wall.update(asked, model.SearchArrived(fake.search_json("")))
  refused.browser.search.error |> should.equal(Some("q is required"))
  refused.browser.search.loading |> should.be_false()
}

pub fn arriving_conversations_selects_main_and_asks_for_it_test() {
  let #(next, _load) = wall.update(
    model.Model(..model.initial(model.LiveMode), tab: model.BrowserTab),
    model.ConversationsArrived(fake.conversations_json()),
  )
  next.browser.conversations |> list.length |> should.equal(4)
  // The ordering pins main first, so "the first card" is the main space.
  next.browser.selected |> should.equal(Some(1))
  next.browser.stream |> should.equal(Some(model.empty_logs()))
}

pub fn the_browser_tab_keeps_the_dashboard_and_logs_tabs_test() {
  let html = view.view(model.initial(model.LiveMode)) |> element.to_string
  html |> string.contains(">BROWSER<") |> should.be_true()
  html |> string.contains(">LOGS<") |> should.be_true()
  model.tab_label(model.BrowserTab) |> should.equal("browser")
}
