//// The LOGS tab: which kinds a filter asks for, how the path is built, how a page
//// decodes, and how the rows render — including a failed read and a spill.

import gleam/list
import gleam/string
import gleam/option.{None, Some}
import gleeunit/should
import lustre/element
import wall/decode
import wall/fake
import wall/model
import wall/view
import wall/logs
import wall_fixtures

// --- the logs tab ---------------------------------------------------------
//
// The reader's SQL and its human lines are tested in `tests/wall.test.ts`; what
// is asserted here is this side of the contract: the query the tab builds, the
// filter arithmetic, the decoder's tolerance, and that the view really draws a
// row per entry with the raw record and the spill expander attached.

pub fn empty_filters_send_no_kind_test() {
  logs.logs_path(logs.empty_filters(), None, 50)
  |> should.equal("/api/logs?limit=50&dir=desc")
}

pub fn direction_narrows_the_kinds_test() {
  logs.effective_kinds(logs.empty_filters()) |> should.equal([])
  logs.effective_kinds(logs.LogFilters(
    kinds: [],
    direction: logs.Incoming,
    query: "",
  ))
  |> should.equal(["pi.user"])
  logs.effective_kinds(logs.LogFilters(
    kinds: [],
    direction: logs.Outgoing,
    query: "",
  ))
  |> should.equal(["pi.assistant", "app.*"])
}

pub fn chips_and_direction_intersect_test() {
  // "in" plus the assistant chip cannot match anything: ask for a kind nobody
  // wrote, so the tab shows an empty page rather than everything.
  logs.effective_kinds(logs.LogFilters(
    kinds: ["pi.assistant"],
    direction: logs.Incoming,
    query: "",
  ))
  |> should.equal(["(no such kind)"])
  // "out" plus two chips keeps only the chip that is outgoing ("out" is the
  // agent's answers and the apps, not the user's steers or the tool results).
  logs.effective_kinds(logs.LogFilters(
    kinds: ["pi.user", "pi.assistant"],
    direction: logs.Outgoing,
    query: "",
  ))
  |> should.equal(["pi.assistant"])
  // an empty direction leaves the chips alone
  logs.effective_kinds(logs.LogFilters(
    kinds: ["pi.compaction"],
    direction: logs.BothWays,
    query: "",
  ))
  |> should.equal(["pi.compaction"])
}

pub fn app_star_matches_the_family_test() {
  logs.effective_kinds(logs.LogFilters(
    kinds: ["app.*", "pi.user"],
    direction: logs.Outgoing,
    query: "",
  ))
  |> should.equal(["app.*"])
}

pub fn logs_path_carries_the_cursor_and_the_search_test() {
  let filters =
    logs.LogFilters(kinds: ["pi.user", "app.*"], direction: logs.BothWays, query: "a b&c")
  logs.logs_path(filters, Some(3509), 200)
  |> should.equal("/api/logs?limit=200&dir=desc&kind=pi.user,app.*&before=3509&q=a%20b%26c")
  // a blank search is no search at all
  logs.logs_path(logs.LogFilters(..filters, query: "   "), None, 50)
  |> should.equal("/api/logs?limit=50&dir=desc&kind=pi.user,app.*")
}

pub fn url_encode_escapes_the_query_metacharacters_test() {
  logs.url_encode("%_&?#+=") |> should.equal("%25_%26%3F%23%2B%3D")
  logs.url_encode("plain") |> should.equal("plain")
}

pub fn short_time_takes_the_clock_out_of_an_iso_stamp_test() {
  logs.short_time(Some("2026-10-29T14:30:58.000Z")) |> should.equal("14:30:58")
  logs.short_time(Some("bogus")) |> should.equal("bogus")
  logs.short_time(None) |> should.equal("—")
}

pub fn logs_line_counts_and_names_the_mode_test() {
  logs.logs_line(logs.empty_logs()) |> should.equal("0 entries · live tail")
  let one =
    logs.Logs(
      ..logs.empty_logs(),
      entries: [
        logs.LogEntry(
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
  logs.logs_line(one) |> should.equal("1 entry · live tail")
  logs.logs_line(logs.Logs(..one, tailing: False)) |> should.equal("1 entry · paged back")
}

pub fn decodes_a_logs_page_test() {
  let assert Ok(page) = decode.logs(fake.logs_json(logs.empty_filters(), 0))
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
      logs.LogFilters(kinds: [], direction: logs.Incoming, query: ""),
      0,
    ))
  page.entries |> list.map(fn(entry) { entry.kind }) |> should.equal(["pi.user"])

  let assert Ok(searched) =
    decode.logs(fake.logs_json(
      logs.LogFilters(kinds: [], direction: logs.BothWays, query: "COMPACT"),
      0,
    ))
  searched.entries |> list.map(fn(entry) { entry.kind }) |> should.equal(["pi.compaction"])

  let assert Ok(nothing) =
    decode.logs(fake.logs_json(
      logs.LogFilters(kinds: ["pi.assistant"], direction: logs.Incoming, query: ""),
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

pub fn the_dashboard_is_the_tab_by_default_test() {
  let html = view.view(model.initial(model.LiveMode)) |> element.to_string
  html |> string.contains("VITALS") |> should.be_true()
  html |> string.contains(">LOGS<") |> should.be_true()
  html |> string.contains(">DASHBOARD<") |> should.be_true()
  html |> wall_fixtures.count_of("log-row") |> should.equal(0)
}

pub fn the_logs_tab_draws_every_row_test() {
  let html = view.view(wall_fixtures.logs_model()) |> element.to_string
  // one <details> per entry, and the dashboard is off the page
  html |> wall_fixtures.count_of("<details") |> should.equal(3)
  html |> string.contains("VITALS") |> should.be_false()
  html |> string.contains("14:30:58") |> should.be_true()
  html |> string.contains("answered: the wall is up") |> should.be_true()
  html |> string.contains("@wall-ui") |> should.be_true()
  html |> string.contains("bash: full output (18 bytes)") |> should.be_true()
  html |> string.contains("2 entries · live tail") |> should.be_true()
  html |> string.contains("older entries available") |> should.be_true()
}

pub fn every_row_carries_its_raw_record_test() {
  let html = view.view(wall_fixtures.logs_model()) |> element.to_string
  html |> string.contains("log-raw") |> should.be_true()
  html |> string.contains("pi.assistant") |> should.be_true()
}

pub fn only_a_spilled_row_gets_an_expander_test() {
  let html = view.view(wall_fixtures.logs_model()) |> element.to_string
  html |> wall_fixtures.count_of("log-spill") |> should.equal(1)
  html |> string.contains("/opt/pi-host/storage/spill/full.log") |> should.be_true()
  // fetched already, so the expander shows the text rather than "press to load"
  html |> string.contains("line one") |> should.be_true()
  html |> string.contains("press to load") |> should.be_false()
}

pub fn the_controls_show_the_current_filters_test() {
  let model_with_filters =
    model.Model(
      ..wall_fixtures.logs_model(),
      filters: logs.LogFilters(
        kinds: ["pi.user"],
        direction: logs.Incoming,
        query: "spill",
      ),
    )
  let html = view.view(model_with_filters) |> element.to_string
  html |> string.contains("type=\"search\"") |> should.be_true()
  html |> string.contains("value=\"spill\"") |> should.be_true()
  // the "in" chip and the "pi.user" chip are both active
  html |> wall_fixtures.count_of("chip active") |> should.equal(2)
}

pub fn an_empty_page_says_so_test() {
  let html =
    view.view(
      model.Model(
        ..wall_fixtures.logs_model(),
        logs: Some(logs.Logs(..logs.empty_logs(), error: Some("ledger unavailable"))),
      ),
    )
    |> element.to_string
  html |> string.contains("no entries match") |> should.be_true()
  html |> string.contains("ledger unavailable") |> should.be_true()
}

