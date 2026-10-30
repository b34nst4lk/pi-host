import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $option from "../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../gleam_stdlib/gleam/option.mjs";
import * as $string from "../gleam_stdlib/gleam/string.mjs";
import * as $should from "../gleeunit/gleeunit/should.mjs";
import * as $element from "../lustre/lustre/element.mjs";
import {
  Ok,
  Error,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  makeError,
} from "./gleam.mjs";
import * as $decode from "./wall/decode.mjs";
import * as $fake from "./wall/fake.mjs";
import * as $logs from "./wall/logs.mjs";
import * as $model from "./wall/model.mjs";
import * as $view from "./wall/view.mjs";
import * as $wall_fixtures from "./wall_fixtures.mjs";

const FILEPATH = "test/logs_tab_test.gleam";

export function empty_filters_send_no_kind_test() {
  let _pipe = $logs.logs_path($logs.empty_filters(), Option$None$const, 50);
  return $should.equal(_pipe, "/api/logs?limit=50&dir=desc");
}

export function direction_narrows_the_kinds_test() {
  let _pipe = $logs.effective_kinds($logs.empty_filters());
  $should.equal(_pipe, $List$Empty$const);
  let _pipe$1 = $logs.effective_kinds(
    new $logs.LogFilters($List$Empty$const, $logs.Direction$Incoming$const, ""),
  );
  $should.equal(_pipe$1, listPrepend("pi.user", $List$Empty$const));
  let _pipe$2 = $logs.effective_kinds(
    new $logs.LogFilters($List$Empty$const, $logs.Direction$Outgoing$const, ""),
  );
  return $should.equal(
    _pipe$2,
    listPrepend("pi.assistant", listPrepend("app.*", $List$Empty$const)),
  );
}

export function chips_and_direction_intersect_test() {
  let _pipe = $logs.effective_kinds(
    new $logs.LogFilters(
      listPrepend("pi.assistant", $List$Empty$const),
      $logs.Direction$Incoming$const,
      "",
    ),
  );
  $should.equal(_pipe, listPrepend("(no such kind)", $List$Empty$const));
  let _pipe$1 = $logs.effective_kinds(
    new $logs.LogFilters(
      listPrepend("pi.user", listPrepend("pi.assistant", $List$Empty$const)),
      $logs.Direction$Outgoing$const,
      "",
    ),
  );
  $should.equal(_pipe$1, listPrepend("pi.assistant", $List$Empty$const));
  let _pipe$2 = $logs.effective_kinds(
    new $logs.LogFilters(
      listPrepend("pi.compaction", $List$Empty$const),
      $logs.Direction$BothWays$const,
      "",
    ),
  );
  return $should.equal(_pipe$2, listPrepend("pi.compaction", $List$Empty$const));
}

export function app_star_matches_the_family_test() {
  let _pipe = $logs.effective_kinds(
    new $logs.LogFilters(
      listPrepend("app.*", listPrepend("pi.user", $List$Empty$const)),
      $logs.Direction$Outgoing$const,
      "",
    ),
  );
  return $should.equal(_pipe, listPrepend("app.*", $List$Empty$const));
}

export function logs_path_carries_the_cursor_and_the_search_test() {
  let filters = new $logs.LogFilters(
    listPrepend("pi.user", listPrepend("app.*", $List$Empty$const)),
    $logs.Direction$BothWays$const,
    "a b&c",
  );
  let _pipe = $logs.logs_path(filters, new Some(3509), 200);
  $should.equal(
    _pipe,
    "/api/logs?limit=200&dir=desc&kind=pi.user,app.*&before=3509&q=a%20b%26c",
  );
  let _pipe$1 = $logs.logs_path(
    new $logs.LogFilters(filters.kinds, filters.direction, "   "),
    Option$None$const,
    50,
  );
  return $should.equal(
    _pipe$1,
    "/api/logs?limit=50&dir=desc&kind=pi.user,app.*",
  );
}

export function url_encode_escapes_the_query_metacharacters_test() {
  let _pipe = $logs.url_encode("%_&?#+=");
  $should.equal(_pipe, "%25_%26%3F%23%2B%3D");
  let _pipe$1 = $logs.url_encode("plain");
  return $should.equal(_pipe$1, "plain");
}

export function short_time_takes_the_clock_out_of_an_iso_stamp_test() {
  let _pipe = $logs.short_time(new Some("2026-10-29T14:30:58.000Z"));
  $should.equal(_pipe, "14:30:58");
  let _pipe$1 = $logs.short_time(new Some("bogus"));
  $should.equal(_pipe$1, "bogus");
  let _pipe$2 = $logs.short_time(Option$None$const);
  return $should.equal(_pipe$2, "—");
}

export function logs_line_counts_and_names_the_mode_test() {
  let _pipe = $logs.logs_line($logs.empty_logs());
  $should.equal(_pipe, "0 entries · live tail");
  let _block;
  let _record = $logs.empty_logs();
  _block = new $logs.Logs(
    listPrepend(
      new $logs.LogEntry(
        1,
        "pi.user",
        Option$None$const,
        "hi",
        Option$None$const,
        Option$None$const,
        "{}",
      ),
      $List$Empty$const,
    ),
    _record.next_before,
    _record.tailing,
    _record.appending,
    _record.spills,
    _record.error,
  );
  let one = _block;
  let _pipe$1 = $logs.logs_line(one);
  $should.equal(_pipe$1, "1 entry · live tail");
  let _pipe$2 = $logs.logs_line(
    new $logs.Logs(
      one.entries,
      one.next_before,
      false,
      one.appending,
      one.spills,
      one.error,
    ),
  );
  return $should.equal(_pipe$2, "1 entry · paged back");
}

export function decodes_a_logs_page_test() {
  let $ = $decode.logs($fake.logs_json($logs.empty_filters(), 0));
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      122,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 3918,
        end: 3992,
        pattern_start: 3929,
        pattern_end: 3937
      }
    )
  }
  let _pipe = page.ok;
  $should.equal(_pipe, true);
  let _pipe$1 = page.next_before;
  $should.equal(_pipe$1, new Some(3604));
  let _pipe$2 = $list.length(page.entries);
  $should.equal(_pipe$2, 6);
  let $1 = $list.first(page.entries);
  let newest;
  if ($1 instanceof Ok) {
    newest = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      126,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 4121,
        end: 4169,
        pattern_start: 4132,
        pattern_end: 4142
      }
    )
  }
  let _pipe$3 = newest.kind;
  $should.equal(_pipe$3, "pi.assistant");
  let _pipe$4 = newest.at;
  $should.equal(_pipe$4, new Some("2026-10-29T14:30:10.000Z"));
  let _pipe$5 = newest.thread;
  $should.equal(_pipe$5, Option$None$const);
  let _pipe$6 = newest.spill;
  $should.equal(_pipe$6, Option$None$const);
  let _pipe$7 = newest.raw;
  $should.equal(_pipe$7, "{\"kind\":\"pi.assistant\",\"id\":3610}");
  let _block;
  let _pipe$8 = page.entries;
  let _pipe$9 = $list.drop(_pipe$8, 1);
  _block = $list.first(_pipe$9);
  let $2 = _block;
  let spilled;
  if ($2 instanceof Ok) {
    spilled = $2[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      133,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $2,
        start: 4511,
        end: 4578,
        pattern_start: 4522,
        pattern_end: 4533
      }
    )
  }
  let _pipe$10 = spilled.spill;
  $should.equal(_pipe$10, new Some("/opt/pi-host/storage/spill/full.log"));
  let _block$1;
  let _pipe$11 = page.entries;
  let _pipe$12 = $list.drop(_pipe$11, 5);
  _block$1 = $list.first(_pipe$12);
  let $3 = _block$1;
  let app;
  if ($3 instanceof Ok) {
    app = $3[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      135,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $3,
        start: 4658,
        end: 4721,
        pattern_start: 4669,
        pattern_end: 4676
      }
    )
  }
  let _pipe$13 = app.kind;
  $should.equal(_pipe$13, "app.subagents");
  let _pipe$14 = app.thread;
  return $should.equal(_pipe$14, new Some("wall-ui"));
}

export function fake_fixtures_honour_the_filters_test() {
  let $ = $decode.logs(
    $fake.logs_json(
      new $logs.LogFilters(
        $List$Empty$const,
        $logs.Direction$Incoming$const,
        "",
      ),
      0,
    ),
  );
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      141,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 4866,
        end: 5006,
        pattern_start: 4877,
        pattern_end: 4885
      }
    )
  }
  let _pipe = page.entries;
  let _pipe$1 = $list.map(_pipe, (entry) => { return entry.kind; });
  $should.equal(_pipe$1, listPrepend("pi.user", $List$Empty$const));
  let $1 = $decode.logs(
    $fake.logs_json(
      new $logs.LogFilters(
        $List$Empty$const,
        $logs.Direction$BothWays$const,
        "COMPACT",
      ),
      0,
    ),
  );
  let searched;
  if ($1 instanceof Ok) {
    searched = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      148,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 5092,
        end: 5243,
        pattern_start: 5103,
        pattern_end: 5115
      }
    )
  }
  let _pipe$2 = searched.entries;
  let _pipe$3 = $list.map(_pipe$2, (entry) => { return entry.kind; });
  $should.equal(_pipe$3, listPrepend("pi.compaction", $List$Empty$const));
  let $2 = $decode.logs(
    $fake.logs_json(
      new $logs.LogFilters(
        listPrepend("pi.assistant", $List$Empty$const),
        $logs.Direction$Incoming$const,
        "",
      ),
      0,
    ),
  );
  let nothing;
  if ($2 instanceof Ok) {
    nothing = $2[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      155,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $2,
        start: 5339,
        end: 5496,
        pattern_start: 5350,
        pattern_end: 5361
      }
    )
  }
  let _pipe$4 = nothing.entries;
  $should.equal(_pipe$4, $List$Empty$const);
  let _pipe$5 = nothing.next_before;
  return $should.equal(_pipe$5, Option$None$const);
}

export function tolerates_a_row_with_missing_fields_test() {
  let $ = $decode.logs("{\"v\":1,\"ok\":true,\"entries\":[{\"id\":7}]}");
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      165,
      "tolerates_a_row_with_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5636,
        end: 5719,
        pattern_start: 5647,
        pattern_end: 5655
      }
    )
  }
  let $1 = $list.first(page.entries);
  let entry;
  if ($1 instanceof Ok) {
    entry = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      166,
      "tolerates_a_row_with_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 5722,
        end: 5769,
        pattern_start: 5733,
        pattern_end: 5742
      }
    )
  }
  let _pipe = entry.id;
  $should.equal(_pipe, 7);
  let _pipe$1 = entry.kind;
  $should.equal(_pipe$1, "unknown");
  let _pipe$2 = entry.text;
  $should.equal(_pipe$2, "unknown entry");
  let _pipe$3 = entry.raw;
  $should.equal(_pipe$3, "");
  let _pipe$4 = page.next_before;
  return $should.equal(_pipe$4, Option$None$const);
}

export function a_failed_read_is_a_message_not_a_crash_test() {
  let $ = $decode.logs(
    "{\"v\":1,\"ok\":false,\"error\":\"ledger unavailable\",\"entries\":[]}",
  );
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      175,
      "a_failed_read_is_a_message_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 6019,
        end: 6135,
        pattern_start: 6030,
        pattern_end: 6038
      }
    )
  }
  let _pipe = page.ok;
  $should.equal(_pipe, false);
  let _pipe$1 = page.error;
  $should.equal(_pipe$1, new Some("ledger unavailable"));
  let _pipe$2 = page.entries;
  return $should.equal(_pipe$2, $List$Empty$const);
}

export function rejects_a_non_json_logs_body_test() {
  let $ = $decode.logs("<html>502</html>");
  let problem;
  if ($ instanceof Error) {
    problem = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      184,
      "rejects_a_non_json_logs_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 6311,
        end: 6370,
        pattern_start: 6322,
        pattern_end: 6336
      }
    )
  }
  let _pipe = problem;
  let _pipe$1 = $string.starts_with(
    _pipe,
    "unexpected response shape: UnexpectedByte",
  );
  return $should.be_true(_pipe$1);
}

export function decodes_a_spill_test() {
  let _pipe = $decode.spill($fake.spill_json());
  $should.equal(_pipe, new Ok("line one\nline two\n"));
  let _pipe$1 = $decode.spill(
    "{\"ok\":false,\"error\":\"path outside the allowlist\"}",
  );
  $should.equal(_pipe$1, new Error("path outside the allowlist"));
  let _pipe$2 = $decode.spill("{\"ok\":false}");
  $should.equal(_pipe$2, new Error("no such file"));
  let $ = $decode.spill("<html>");
  let problem;
  if ($ instanceof Error) {
    problem = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "logs_tab_test",
      193,
      "decodes_a_spill_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 6784,
        end: 6834,
        pattern_start: 6795,
        pattern_end: 6809
      }
    )
  }
  let _pipe$3 = problem;
  let _pipe$4 = $string.starts_with(_pipe$3, "unexpected response shape: ");
  return $should.be_true(_pipe$4);
}

export function the_dashboard_is_the_tab_by_default_test() {
  let _block;
  let _pipe = $view.view($model.initial($model.Mode$LiveMode$const));
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $string.contains(_pipe$1, "VITALS");
  $should.be_true(_pipe$2);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, ">LOGS<");
  $should.be_true(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = $string.contains(_pipe$5, ">DASHBOARD<");
  $should.be_true(_pipe$6);
  let _pipe$7 = html;
  let _pipe$8 = $wall_fixtures.count_of(_pipe$7, "log-row");
  return $should.equal(_pipe$8, 0);
}

export function the_logs_tab_draws_every_row_test() {
  let _block;
  let _pipe = $view.view($wall_fixtures.logs_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $wall_fixtures.count_of(_pipe$1, "<details");
  $should.equal(_pipe$2, 3);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "VITALS");
  $should.be_false(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = $string.contains(_pipe$5, "14:30:58");
  $should.be_true(_pipe$6);
  let _pipe$7 = html;
  let _pipe$8 = $string.contains(_pipe$7, "answered: the wall is up");
  $should.be_true(_pipe$8);
  let _pipe$9 = html;
  let _pipe$10 = $string.contains(_pipe$9, "@wall-ui");
  $should.be_true(_pipe$10);
  let _pipe$11 = html;
  let _pipe$12 = $string.contains(_pipe$11, "bash: full output (18 bytes)");
  $should.be_true(_pipe$12);
  let _pipe$13 = html;
  let _pipe$14 = $string.contains(_pipe$13, "2 entries · live tail");
  $should.be_true(_pipe$14);
  let _pipe$15 = html;
  let _pipe$16 = $string.contains(_pipe$15, "older entries available");
  return $should.be_true(_pipe$16);
}

export function every_row_carries_its_raw_record_test() {
  let _block;
  let _pipe = $view.view($wall_fixtures.logs_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $string.contains(_pipe$1, "log-raw");
  $should.be_true(_pipe$2);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "pi.assistant");
  return $should.be_true(_pipe$4);
}

export function only_a_spilled_row_gets_an_expander_test() {
  let _block;
  let _pipe = $view.view($wall_fixtures.logs_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $wall_fixtures.count_of(_pipe$1, "log-spill");
  $should.equal(_pipe$2, 1);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "/opt/pi-host/storage/spill/full.log");
  $should.be_true(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = $string.contains(_pipe$5, "line one");
  $should.be_true(_pipe$6);
  let _pipe$7 = html;
  let _pipe$8 = $string.contains(_pipe$7, "press to load");
  return $should.be_false(_pipe$8);
}

export function the_controls_show_the_current_filters_test() {
  let _block;
  let _record = $wall_fixtures.logs_model();
  _block = new $model.Model(
    _record.mode,
    _record.vitals,
    _record.spend,
    _record.agents,
    _record.queue,
    _record.samples,
    _record.polls,
    _record.error,
    _record.tab,
    new $logs.LogFilters(
      listPrepend("pi.user", $List$Empty$const),
      $logs.Direction$Incoming$const,
      "spill",
    ),
    _record.logs,
    _record.browser,
  );
  let model_with_filters = _block;
  let _block$1;
  let _pipe = $view.view(model_with_filters);
  _block$1 = $element.to_string(_pipe);
  let html = _block$1;
  let _pipe$1 = html;
  let _pipe$2 = $string.contains(_pipe$1, "type=\"search\"");
  $should.be_true(_pipe$2);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "value=\"spill\"");
  $should.be_true(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = $wall_fixtures.count_of(_pipe$5, "chip active");
  return $should.equal(_pipe$6, 2);
}

export function an_empty_page_says_so_test() {
  let _block;
  let _pipe = $view.view(
    (() => {
      let _record = $wall_fixtures.logs_model();
      return new $model.Model(
        _record.mode,
        _record.vitals,
        _record.spend,
        _record.agents,
        _record.queue,
        _record.samples,
        _record.polls,
        _record.error,
        _record.tab,
        _record.filters,
        new Some(
          (() => {
            let _record$1 = $logs.empty_logs();
            return new $logs.Logs(
              _record$1.entries,
              _record$1.next_before,
              _record$1.tailing,
              _record$1.appending,
              _record$1.spills,
              new Some("ledger unavailable"),
            );
          })(),
        ),
        _record.browser,
      );
    })(),
  );
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $string.contains(_pipe$1, "no entries match");
  $should.be_true(_pipe$2);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "ledger unavailable");
  return $should.be_true(_pipe$4);
}
