//// The BROWSER tab: decoding the picker and a space's stream, the rail, the jump
//// to a hit, and back to the tail.

import gleam/list
import gleam/string
import gleam/option.{None, Some}
import gleeunit/should
import lustre/element
import wall
import wall/decode
import wall/fake
import wall/model
import wall/view
import wall/browser
import wall/logs
import wall_fixtures

// --- the browser tab: decoding, the rail, the jump ------------------------

fn sample_conversation(id: Int, kind: String, title: String, state: String) -> browser.Conversation {
  browser.Conversation(
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
    browser.Browser(
      ..browser.empty_browser(),
      conversations: browser.order_conversations(page.items),
    )
  let browser = browser.select_conversation(browser, 1)
  let assert Ok(logs) = decode.logs(fake.browser_logs_json(1, logs.empty_filters(), 0))
  model.Model(
    ..model.initial(model.LiveMode),
    tab: logs.BrowserTab,
    browser: browser.Browser(
      ..browser,
      stream: Some(
        logs.Logs(
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
    |> fn(page) { browser.order_conversations(page.items) }
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
  browser.jump_to_hit(browser.empty_browser(), hit.conversation, hit.entry)
  |> should.equal(browser.empty_browser())
}

pub fn the_rail_pins_main_first_then_children_in_id_order_test() {
  [
    sample_conversation(9, "child", "b", "alive"),
    sample_conversation(3, "child", "a", "alive"),
    sample_conversation(1, "main", "main", "working"),
    sample_conversation(2, "child", "c", "alive"),
  ]
  |> browser.order_conversations
  |> list.map(fn(item) { item.id })
  |> should.equal([1, 2, 3, 9])

  browser.conversation_line(sample_conversation(1, "main", "main", "working"))
  |> should.equal("2 entries")
  browser.conversation_span(sample_conversation(1, "main", "main", "working"))
  |> should.equal("10-29 13:02 → 10-29 14:29")
}

pub fn the_browser_asks_for_one_conversation_and_a_window_test() {
  // The LOGS tab is unchanged: no conversation, no window.
  logs.logs_path(logs.empty_filters(), None, 50)
  |> should.equal("/api/logs?limit=50&dir=desc")
  browser.logs_path_for(logs.empty_filters(), Some(2166), None, 50, None)
  |> should.equal("/api/logs?limit=50&dir=desc&conversation=2166")
  // Landing on a hit: the same page, as a window around that entry.
  browser.logs_path_for(logs.empty_filters(), Some(2166), None, 50, Some(4110))
  |> should.equal("/api/logs?limit=50&dir=desc&conversation=2166&around=4110")
  // The search is over everything, so it carries no kind filter.
  browser.search_path("  wall & browser  ", 25)
  |> should.equal("/api/search?limit=25&q=wall%20%26%20browser")
  browser.search_path("", 25) |> should.equal("/api/search?limit=25&q=")
}

pub fn a_hit_selects_its_conversation_and_opens_a_window_test() {
  let start = browser_model()
  start.browser.selected |> should.equal(Some(1))

  let #(landed, _load) = wall.update(start, model.HitChosen(Some(2166), 4110))
  landed.tab |> should.equal(logs.BrowserTab)
  landed.browser.selected |> should.equal(Some(2166))
  landed.browser.anchor |> should.equal(Some(4110))

  // The window arrives: it is *not* a tail, so the 10 s poll cannot move the
  // rows out from under the reader.
  let assert Ok(page) = decode.logs(fake.browser_logs_json(2166, logs.empty_filters(), 0))
  let #(window, _) = wall.update(landed, model.BrowserLogsArrived(fake.browser_logs_json(2166, logs.empty_filters(), 0)))
  let assert Some(stream) = window.browser.stream
  stream.tailing |> should.be_false()
  stream.entries |> list.length |> should.equal(list.length(page.entries))

  // "back to the tail" drops the window and follows the space again.
  let #(tailing, _) = wall.update(window, model.BrowserTailRequested)
  tailing.browser.anchor |> should.equal(None)
}

pub fn compaction_entries_are_dividers_in_the_browser_only_test() {
  browser.is_divider("pi.compaction") |> should.be_true()
  browser.is_divider("pi.user") |> should.be_false()
  browser.divider_label(0) |> should.equal("— summarized history begins —")
  browser.divider_label(3) |> should.equal("— summarized history continues —")

  let html = view.view(browser_model()) |> element.to_string
  // Two compaction rows in the fixture: two dividers, first/continues.
  html |> wall_fixtures.count_of("class=\"log-divider\"") |> should.equal(2)
  html |> string.contains("— summarized history begins —") |> should.be_true()
  html |> string.contains("— summarized history continues —") |> should.be_true()
  // The other five entries are ordinary rows: nothing is collapsed or hidden.
  html |> wall_fixtures.count_of("class=\"log-row\"") |> should.equal(5)
  html |> string.contains("the browser tab is up") |> should.be_true()
  html |> string.contains("system: preamble + 12 tools") |> should.be_true()
}

pub fn the_same_rows_render_in_the_logs_tab_without_dividers_test() {
  let assert Ok(page) = decode.logs(fake.browser_logs_json(1, logs.empty_filters(), 0))
  let logs =
    logs.Logs(
      entries: page.entries,
      next_before: page.next_before,
      tailing: True,
      appending: False,
      spills: [],
      error: None,
    )
  let html =
    view.view(model.Model(..model.initial(model.LiveMode), tab: logs.LogsTab, logs: Some(logs)))
    |> element.to_string
  html |> wall_fixtures.count_of("class=\"log-divider\"") |> should.equal(0)
  html |> string.contains("pi.compaction") |> should.be_true()
  html |> wall_fixtures.count_of("class=\"log-row\"") |> should.equal(7)
}

pub fn the_rail_renders_one_card_per_space_with_its_state_test() {
  let html = view.view(browser_model()) |> element.to_string
  html |> wall_fixtures.count_of("space-card") |> should.equal(4)
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
  browser.search_line(with_hits.browser.search) |> should.equal("3 hits for brow")

  // The hits list names the space each hit lives in.
  let html = view.view(with_hits) |> element.to_string
  html |> wall_fixtures.count_of("class=\"hit\"") |> should.equal(3)
  html |> string.contains("main") |> should.be_true()
  html |> string.contains("wall-ui") |> should.be_true()
}

pub fn an_empty_search_is_a_mistake_and_says_so_test() {
  let #(next, _) = wall.update(browser_model(), model.SearchSubmitted)
  next.browser.search.loading |> should.be_false()
  next.browser.search.asked |> should.equal("")
  next.browser.search.error |> should.equal(Some("type something to search for"))
  browser.search_line(next.browser.search) |> should.equal("search every conversation")

  // The reader's own refusal is shown too, not swallowed.
  let #(typed, _) = wall.update(browser_model(), model.SearchChanged("wall"))
  let #(asked, _) = wall.update(typed, model.SearchSubmitted)
  let #(refused, _) = wall.update(asked, model.SearchArrived(fake.search_json("")))
  refused.browser.search.error |> should.equal(Some("q is required"))
  refused.browser.search.loading |> should.be_false()
}

pub fn arriving_conversations_selects_main_and_asks_for_it_test() {
  let #(next, _load) = wall.update(
    model.Model(..model.initial(model.LiveMode), tab: logs.BrowserTab),
    model.ConversationsArrived(fake.conversations_json()),
  )
  next.browser.conversations |> list.length |> should.equal(4)
  // The ordering pins main first, so "the first card" is the main space.
  next.browser.selected |> should.equal(Some(1))
  next.browser.stream |> should.equal(Some(logs.empty_logs()))
}

pub fn the_browser_tab_keeps_the_dashboard_and_logs_tabs_test() {
  let html = view.view(model.initial(model.LiveMode)) |> element.to_string
  html |> string.contains(">BROWSER<") |> should.be_true()
  html |> string.contains(">LOGS<") |> should.be_true()
  logs.tab_label(logs.BrowserTab) |> should.equal("browser")
}
