import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $option from "../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../gleam_stdlib/gleam/option.mjs";
import * as $string from "../gleam_stdlib/gleam/string.mjs";
import * as $should from "../gleeunit/gleeunit/should.mjs";
import * as $element from "../lustre/lustre/element.mjs";
import {
  Ok,
  Error,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  makeError,
} from "./gleam.mjs";
import * as $wall from "./wall.mjs";
import * as $browser from "./wall/browser.mjs";
import * as $decode from "./wall/decode.mjs";
import * as $fake from "./wall/fake.mjs";
import * as $logs from "./wall/logs.mjs";
import * as $model from "./wall/model.mjs";
import * as $view from "./wall/view.mjs";
import * as $wall_fixtures from "./wall_fixtures.mjs";

const FILEPATH = "test/browser_tab_test.gleam";

function sample_conversation(id, kind, title, state) {
  return new $browser.Conversation(
    id,
    kind,
    title,
    state,
    2,
    new Some("2026-10-29T13:02:00.000Z"),
    new Some("2026-10-29T14:29:11.000Z"),
  );
}

/**
 * What two polls of the browser tab leave behind: the rail, the selection, and
 * the selected space's stream.
 * 
 * @ignore
 */
function browser_model() {
  let $ = $decode.conversations($fake.conversations_json());
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      35,
      "browser_model",
      "Pattern match failed, no pattern matched the value.",
      { value: $, start: 918, end: 987, pattern_start: 929, pattern_end: 937 }
    )
  }
  let _block;
  let _record = $browser.empty_browser();
  _block = new $browser.Browser(
    $browser.order_conversations(page.items),
    _record.conversations_error,
    _record.selected,
    _record.stream,
    _record.anchor,
    _record.search,
  );
  let browser = _block;
  let browser$1 = $browser.select_conversation(browser, 1);
  let $1 = $decode.logs($fake.browser_logs_json(1, $logs.empty_filters(), 0));
  let logs;
  if ($1 instanceof Ok) {
    logs = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      42,
      "browser_model",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 1184,
        end: 1269,
        pattern_start: 1195,
        pattern_end: 1203
      }
    )
  }
  let _record$1 = $model.initial($model.Mode$LiveMode$const);
  return new $model.Model(
    _record$1.mode,
    _record$1.vitals,
    _record$1.spend,
    _record$1.agents,
    _record$1.queue,
    _record$1.samples,
    _record$1.polls,
    _record$1.error,
    $logs.Tab$BrowserTab$const,
    _record$1.filters,
    _record$1.logs,
    new $browser.Browser(
      browser$1.conversations,
      browser$1.conversations_error,
      browser$1.selected,
      new Some(
        new $logs.Logs(
          logs.entries,
          logs.next_before,
          true,
          false,
          $List$Empty$const,
          Option$None$const,
        ),
      ),
      browser$1.anchor,
      browser$1.search,
    ),
  );
}

export function the_conversations_decoder_reads_the_rail_test() {
  let $ = $decode.conversations($fake.conversations_json());
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      63,
      "the_conversations_decoder_reads_the_rail_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 1699,
        end: 1768,
        pattern_start: 1710,
        pattern_end: 1718
      }
    )
  }
  let _pipe = page.ok;
  $should.be_true(_pipe);
  let _pipe$1 = page.error;
  $should.equal(_pipe$1, Option$None$const);
  let _pipe$2 = page;
  let _pipe$3 = ((page) => { return $browser.order_conversations(page.items); })(
    _pipe$2,
  );
  let _pipe$4 = $list.map(
    _pipe$3,
    (item) => { return [item.id, item.kind, item.title]; },
  );
  return $should.equal(
    _pipe$4,
    listPrepend(
      [1, "main", "main"],
      listPrepend(
        [2166, "child", "reader"],
        listPrepend(
          [2402, "child", "wall-ui"],
          listPrepend([2775, "child", "conversation 2775"], $List$Empty$const),
        ),
      ),
    ),
  );
}

export function a_conversation_with_drifted_fields_decodes_as_unknown_test() {
  let $ = $decode.conversations(
    "{\"ok\":true,\"conversations\":[{\"id\":\"x\",\"kind\":7,\"title\":null,\"state\":[],\"entries\":\"many\"}]}",
  );
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      80,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 2314,
        end: 2477,
        pattern_start: 2325,
        pattern_end: 2333
      }
    )
  }
  let $1 = page.items;
  let item;
  if ($1 instanceof $Empty) {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      83,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 2480,
        end: 2510,
        pattern_start: 2491,
        pattern_end: 2497
      }
    )
  } else if ($1.tail instanceof $Empty) {
    item = $1.head;
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      83,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 2480,
        end: 2510,
        pattern_start: 2491,
        pattern_end: 2497
      }
    )
  }
  let _pipe = item.id;
  $should.equal(_pipe, 0);
  let _pipe$1 = item.kind;
  $should.equal(_pipe$1, "unknown");
  let _pipe$2 = item.title;
  $should.equal(_pipe$2, "unknown");
  let _pipe$3 = item.state;
  $should.equal(_pipe$3, "unknown");
  let _pipe$4 = item.entries;
  $should.equal(_pipe$4, 0);
  let _pipe$5 = item.first_at;
  $should.equal(_pipe$5, Option$None$const);
  let _pipe$6 = $model.agent_state_label(item.state);
  return $should.equal(_pipe$6, "unknown");
}

export function an_unreadable_conversations_body_is_an_error_not_a_crash_test() {
  let $ = $decode.conversations("<html>not json</html>");
  let problem;
  if ($ instanceof Error) {
    problem = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      94,
      "an_unreadable_conversations_body_is_an_error_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 2874,
        end: 2947,
        pattern_start: 2885,
        pattern_end: 2899
      }
    )
  }
  let _pipe = problem;
  let _pipe$1 = $string.starts_with(_pipe, "unexpected response shape: ");
  $should.be_true(_pipe$1);
  let $1 = $decode.conversations(
    "{\"ok\":false,\"error\":\"ledger is locked\"}",
  );
  let page;
  if ($1 instanceof Ok) {
    page = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      97,
      "an_unreadable_conversations_body_is_an_error_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 3112,
        end: 3203,
        pattern_start: 3123,
        pattern_end: 3131
      }
    )
  }
  let _pipe$2 = page.ok;
  $should.be_false(_pipe$2);
  let _pipe$3 = page.error;
  $should.equal(_pipe$3, new Some("ledger is locked"));
  let _pipe$4 = page.items;
  return $should.equal(_pipe$4, $List$Empty$const);
}

export function the_search_decoder_reads_the_jump_list_test() {
  let $ = $decode.search($fake.search_json("browser"));
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      104,
      "the_search_decoder_reads_the_jump_list_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 3383,
        end: 3447,
        pattern_start: 3394,
        pattern_end: 3402
      }
    )
  }
  let _pipe = page.ok;
  $should.be_true(_pipe);
  let _pipe$1 = page;
  let _pipe$2 = ((page) => {
    return $list.map(
      page.hits,
      (hit) => { return [hit.conversation, hit.entry, hit.conversation_title]; },
    );
  })(_pipe$1);
  return $should.equal(
    _pipe$2,
    listPrepend(
      [new Some(1), 4112, "main"],
      listPrepend(
        [new Some(1), 4110, "main"],
        listPrepend([new Some(2402), 4110, "wall-ui"], $List$Empty$const),
      ),
    ),
  );
}

export function a_drifted_hit_still_renders_but_cannot_be_jumped_to_test() {
  let $ = $decode.search(
    "{\"ok\":true,\"hits\":[{\"entry_id\":\"x\",\"conversation_id\":null,\"text\":7}]}",
  );
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      116,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 3797,
        end: 3926,
        pattern_start: 3808,
        pattern_end: 3816
      }
    )
  }
  let $1 = page.hits;
  let hit;
  if ($1 instanceof $Empty) {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      119,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 3929,
        end: 3957,
        pattern_start: 3940,
        pattern_end: 3945
      }
    )
  } else if ($1.tail instanceof $Empty) {
    hit = $1.head;
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      119,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 3929,
        end: 3957,
        pattern_start: 3940,
        pattern_end: 3945
      }
    )
  }
  let _pipe = hit.conversation;
  $should.equal(_pipe, Option$None$const);
  let _pipe$1 = hit.entry;
  $should.equal(_pipe$1, 0);
  let _pipe$2 = hit.conversation_title;
  $should.equal(_pipe$2, "unknown");
  let _pipe$3 = hit.text;
  $should.equal(_pipe$3, "unknown entry");
  let _pipe$4 = $browser.jump_to_hit(
    $browser.empty_browser(),
    hit.conversation,
    hit.entry,
  );
  return $should.equal(_pipe$4, $browser.empty_browser());
}

export function the_rail_pins_main_first_then_children_in_id_order_test() {
  let _pipe = listPrepend(
    sample_conversation(9, "child", "b", "alive"),
    listPrepend(
      sample_conversation(3, "child", "a", "alive"),
      listPrepend(
        sample_conversation(1, "main", "main", "working"),
        listPrepend(
          sample_conversation(2, "child", "c", "alive"),
          $List$Empty$const,
        ),
      ),
    ),
  );
  let _pipe$1 = $browser.order_conversations(_pipe);
  let _pipe$2 = $list.map(_pipe$1, (item) => { return item.id; });
  $should.equal(
    _pipe$2,
    listPrepend(
      1,
      listPrepend(2, listPrepend(3, listPrepend(9, $List$Empty$const))),
    ),
  );
  let _pipe$3 = $browser.conversation_line(
    sample_conversation(1, "main", "main", "working"),
  );
  $should.equal(_pipe$3, "2 entries");
  let _pipe$4 = $browser.conversation_span(
    sample_conversation(1, "main", "main", "working"),
  );
  return $should.equal(_pipe$4, "10-29 13:02 → 10-29 14:29");
}

export function the_browser_asks_for_one_conversation_and_a_window_test() {
  let _pipe = $logs.logs_path($logs.empty_filters(), Option$None$const, 50);
  $should.equal(_pipe, "/api/logs?limit=50&dir=desc");
  let _pipe$1 = $browser.logs_path_for(
    $logs.empty_filters(),
    new Some(2166),
    Option$None$const,
    50,
    Option$None$const,
  );
  $should.equal(_pipe$1, "/api/logs?limit=50&dir=desc&conversation=2166");
  let _pipe$2 = $browser.logs_path_for(
    $logs.empty_filters(),
    new Some(2166),
    Option$None$const,
    50,
    new Some(4110),
  );
  $should.equal(
    _pipe$2,
    "/api/logs?limit=50&dir=desc&conversation=2166&around=4110",
  );
  let _pipe$3 = $browser.search_path("  wall & browser  ", 25);
  $should.equal(_pipe$3, "/api/search?limit=25&q=wall%20%26%20browser");
  let _pipe$4 = $browser.search_path("", 25);
  return $should.equal(_pipe$4, "/api/search?limit=25&q=");
}

export function a_hit_selects_its_conversation_and_opens_a_window_test() {
  let start = browser_model();
  let _pipe = start.browser.selected;
  $should.equal(_pipe, new Some(1));
  let $ = $wall.update(start, new $model.HitChosen(new Some(2166), 4110));
  let landed = $[0];
  let _pipe$1 = landed.tab;
  $should.equal(_pipe$1, $logs.Tab$BrowserTab$const);
  let _pipe$2 = landed.browser.selected;
  $should.equal(_pipe$2, new Some(2166));
  let _pipe$3 = landed.browser.anchor;
  $should.equal(_pipe$3, new Some(4110));
  let $1 = $decode.logs($fake.browser_logs_json(2166, $logs.empty_filters(), 0));
  let page;
  if ($1 instanceof Ok) {
    page = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      172,
      "a_hit_selects_its_conversation_and_opens_a_window_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 6296,
        end: 6384,
        pattern_start: 6307,
        pattern_end: 6315
      }
    )
  }
  let $2 = $wall.update(
    landed,
    new $model.BrowserLogsArrived(
      $fake.browser_logs_json(2166, $logs.empty_filters(), 0),
    ),
  );
  let window = $2[0];
  let $3 = window.browser.stream;
  let stream;
  if ($3 instanceof Some) {
    stream = $3[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      174,
      "a_hit_selects_its_conversation_and_opens_a_window_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $3,
        start: 6509,
        end: 6556,
        pattern_start: 6520,
        pattern_end: 6532
      }
    )
  }
  let _pipe$4 = stream.tailing;
  $should.be_false(_pipe$4);
  let _pipe$5 = stream.entries;
  let _pipe$6 = $list.length(_pipe$5);
  $should.equal(_pipe$6, $list.length(page.entries));
  let $4 = $wall.update(window, $model.Msg$BrowserTailRequested$const);
  let tailing = $4[0];
  let _pipe$7 = tailing.browser.anchor;
  return $should.equal(_pipe$7, Option$None$const);
}

export function compaction_entries_are_dividers_in_the_browser_only_test() {
  let _pipe = $browser.is_divider("pi.compaction");
  $should.be_true(_pipe);
  let _pipe$1 = $browser.is_divider("pi.user");
  $should.be_false(_pipe$1);
  let _pipe$2 = $browser.divider_label(0);
  $should.equal(_pipe$2, "— summarized history begins —");
  let _pipe$3 = $browser.divider_label(3);
  $should.equal(_pipe$3, "— summarized history continues —");
  let _block;
  let _pipe$4 = $view.view(browser_model());
  _block = $element.to_string(_pipe$4);
  let html = _block;
  let _pipe$5 = html;
  let _pipe$6 = $wall_fixtures.count_of(_pipe$5, "class=\"log-divider\"");
  $should.equal(_pipe$6, 2);
  let _pipe$7 = html;
  let _pipe$8 = $string.contains(_pipe$7, "— summarized history begins —");
  $should.be_true(_pipe$8);
  let _pipe$9 = html;
  let _pipe$10 = $string.contains(_pipe$9, "— summarized history continues —");
  $should.be_true(_pipe$10);
  let _pipe$11 = html;
  let _pipe$12 = $wall_fixtures.count_of(_pipe$11, "class=\"log-row\"");
  $should.equal(_pipe$12, 5);
  let _pipe$13 = html;
  let _pipe$14 = $string.contains(_pipe$13, "the browser tab is up");
  $should.be_true(_pipe$14);
  let _pipe$15 = html;
  let _pipe$16 = $string.contains(_pipe$15, "system: preamble + 12 tools");
  return $should.be_true(_pipe$16);
}

export function the_same_rows_render_in_the_logs_tab_without_dividers_test() {
  let $ = $decode.logs($fake.browser_logs_json(1, $logs.empty_filters(), 0));
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "browser_tab_test",
      201,
      "the_same_rows_render_in_the_logs_tab_without_dividers_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 7958,
        end: 8043,
        pattern_start: 7969,
        pattern_end: 7977
      }
    )
  }
  let logs = new $logs.Logs(
    page.entries,
    page.next_before,
    true,
    false,
    $List$Empty$const,
    Option$None$const,
  );
  let _block;
  let _pipe = $view.view(
    (() => {
      let _record = $model.initial($model.Mode$LiveMode$const);
      return new $model.Model(
        _record.mode,
        _record.vitals,
        _record.spend,
        _record.agents,
        _record.queue,
        _record.samples,
        _record.polls,
        _record.error,
        $logs.Tab$LogsTab$const,
        _record.filters,
        new Some(logs),
        _record.browser,
      );
    })(),
  );
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $wall_fixtures.count_of(_pipe$1, "class=\"log-divider\"");
  $should.equal(_pipe$2, 0);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "pi.compaction");
  $should.be_true(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = $wall_fixtures.count_of(_pipe$5, "class=\"log-row\"");
  return $should.equal(_pipe$6, 7);
}

export function the_rail_renders_one_card_per_space_with_its_state_test() {
  let _block;
  let _pipe = $view.view(browser_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $wall_fixtures.count_of(_pipe$1, "space-card");
  $should.equal(_pipe$2, 4);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "space-card selected");
  $should.be_true(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = $string.contains(_pipe$5, "reader");
  $should.be_true(_pipe$6);
  let _pipe$7 = html;
  let _pipe$8 = $string.contains(_pipe$7, ">working<");
  $should.be_true(_pipe$8);
  let _pipe$9 = html;
  let _pipe$10 = $string.contains(_pipe$9, "main · working");
  $should.be_true(_pipe$10);
  let _pipe$11 = html;
  let _pipe$12 = $string.contains(_pipe$11, "conversation 2775");
  return $should.be_true(_pipe$12);
}

export function the_search_box_searches_once_on_enter_test() {
  let start = browser_model();
  let $ = $wall.update(start, new $model.SearchChanged("brow"));
  let typed = $[0];
  let _pipe = typed.browser.search.query;
  $should.equal(_pipe, "brow");
  let _pipe$1 = typed.browser.search.asked;
  $should.equal(_pipe$1, "");
  let $1 = $wall.update(typed, new $model.SearchKeyed("Enter"));
  let asked = $1[0];
  let _pipe$2 = asked.browser.search.asked;
  $should.equal(_pipe$2, "brow");
  let _pipe$3 = asked.browser.search.loading;
  $should.be_true(_pipe$3);
  let $2 = $wall.update(
    asked,
    new $model.SearchArrived($fake.search_json("browser")),
  );
  let with_hits = $2[0];
  let _pipe$4 = with_hits.browser.search.loading;
  $should.be_false(_pipe$4);
  let _pipe$5 = with_hits.browser.search.hits;
  let _pipe$6 = $list.length(_pipe$5);
  $should.equal(_pipe$6, 3);
  let _pipe$7 = with_hits.browser.search.error;
  $should.equal(_pipe$7, Option$None$const);
  let _pipe$8 = $browser.search_line(with_hits.browser.search);
  $should.equal(_pipe$8, "3 hits for brow");
  let _block;
  let _pipe$9 = $view.view(with_hits);
  _block = $element.to_string(_pipe$9);
  let html = _block;
  let _pipe$10 = html;
  let _pipe$11 = $wall_fixtures.count_of(_pipe$10, "class=\"hit\"");
  $should.equal(_pipe$11, 3);
  let _pipe$12 = html;
  let _pipe$13 = $string.contains(_pipe$12, "main");
  $should.be_true(_pipe$13);
  let _pipe$14 = html;
  let _pipe$15 = $string.contains(_pipe$14, "wall-ui");
  return $should.be_true(_pipe$15);
}

export function an_empty_search_is_a_mistake_and_says_so_test() {
  let $ = $wall.update(browser_model(), $model.Msg$SearchSubmitted$const);
  let next = $[0];
  let _pipe = next.browser.search.loading;
  $should.be_false(_pipe);
  let _pipe$1 = next.browser.search.asked;
  $should.equal(_pipe$1, "");
  let _pipe$2 = next.browser.search.error;
  $should.equal(_pipe$2, new Some("type something to search for"));
  let _pipe$3 = $browser.search_line(next.browser.search);
  $should.equal(_pipe$3, "search every conversation");
  let $1 = $wall.update(browser_model(), new $model.SearchChanged("wall"));
  let typed = $1[0];
  let $2 = $wall.update(typed, $model.Msg$SearchSubmitted$const);
  let asked = $2[0];
  let $3 = $wall.update(asked, new $model.SearchArrived($fake.search_json("")));
  let refused = $3[0];
  let _pipe$4 = refused.browser.search.error;
  $should.equal(_pipe$4, new Some("q is required"));
  let _pipe$5 = refused.browser.search.loading;
  return $should.be_false(_pipe$5);
}

export function arriving_conversations_selects_main_and_asks_for_it_test() {
  let $ = $wall.update(
    (() => {
      let _record = $model.initial($model.Mode$LiveMode$const);
      return new $model.Model(
        _record.mode,
        _record.vitals,
        _record.spend,
        _record.agents,
        _record.queue,
        _record.samples,
        _record.polls,
        _record.error,
        $logs.Tab$BrowserTab$const,
        _record.filters,
        _record.logs,
        _record.browser,
      );
    })(),
    new $model.ConversationsArrived($fake.conversations_json()),
  );
  let next = $[0];
  let _pipe = next.browser.conversations;
  let _pipe$1 = $list.length(_pipe);
  $should.equal(_pipe$1, 4);
  let _pipe$2 = next.browser.selected;
  $should.equal(_pipe$2, new Some(1));
  let _pipe$3 = next.browser.stream;
  return $should.equal(_pipe$3, new Some($logs.empty_logs()));
}

export function the_browser_tab_keeps_the_dashboard_and_logs_tabs_test() {
  let _block;
  let _pipe = $view.view($model.initial($model.Mode$LiveMode$const));
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $string.contains(_pipe$1, ">BROWSER<");
  $should.be_true(_pipe$2);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, ">LOGS<");
  $should.be_true(_pipe$4);
  let _pipe$5 = $logs.tab_label($logs.Tab$BrowserTab$const);
  return $should.equal(_pipe$5, "browser");
}
