import * as $int from "../gleam_stdlib/gleam/int.mjs";
import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $option from "../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../gleam_stdlib/gleam/option.mjs";
import * as $string from "../gleam_stdlib/gleam/string.mjs";
import * as $gleeunit from "../gleeunit/gleeunit.mjs";
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
import * as $model from "./wall/model.mjs";
import * as $view from "./wall/view.mjs";

const FILEPATH = "test/wall_test.gleam";

export function main() {
  return $gleeunit.main();
}

export function format_count_test() {
  let _pipe = $model.format_count(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $model.format_count(new Some(0));
  $should.equal(_pipe$1, "0");
  let _pipe$2 = $model.format_count(new Some(842));
  $should.equal(_pipe$2, "842");
  let _pipe$3 = $model.format_count(new Some(1832));
  $should.equal(_pipe$3, "1,832");
  let _pipe$4 = $model.format_count(new Some(1_234_567));
  $should.equal(_pipe$4, "1.2M");
  let _pipe$5 = $model.format_count(new Some(12_400));
  $should.equal(_pipe$5, "12.4k");
  let _pipe$6 = $model.format_count(new Some(-4_200));
  return $should.equal(_pipe$6, "-4,200");
}

export function format_bytes_test() {
  let _pipe = $model.format_bytes(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $model.format_bytes(new Some(0));
  $should.equal(_pipe$1, "0 B");
  let _pipe$2 = $model.format_bytes(new Some(820));
  $should.equal(_pipe$2, "820 B");
  let _pipe$3 = $model.format_bytes(new Some(2048));
  $should.equal(_pipe$3, "2 KB");
  let _pipe$4 = $model.format_bytes(new Some(5_918_720));
  return $should.equal(_pipe$4, "5.6 MB");
}

export function format_age_test() {
  let _pipe = $model.format_age(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $model.format_age(new Some(7));
  $should.equal(_pipe$1, "7 s");
  let _pipe$2 = $model.format_age(new Some(600));
  $should.equal(_pipe$2, "10 min");
  let _pipe$3 = $model.format_age(new Some(3660));
  return $should.equal(_pipe$3, "1 h 01 m");
}

export function format_usd_test() {
  let _pipe = $model.format_usd(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $model.format_usd(new Some(0.0));
  $should.equal(_pipe$1, "$0.00");
  let _pipe$2 = $model.format_usd(new Some(1.5));
  $should.equal(_pipe$2, "$1.50");
  let _pipe$3 = $model.format_usd(new Some(12.345));
  return $should.equal(_pipe$3, "$12.35");
}

export function format_percent_test() {
  let _pipe = $model.format_percent(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $model.format_percent(new Some(12.5));
  return $should.equal(_pipe$1, "13%");
}

export function budget_fraction_test() {
  let _pipe = $model.budget_fraction(new Some(5), new Some(10));
  $should.equal(_pipe, 0.5);
  let _pipe$1 = $model.budget_fraction(new Some(50), new Some(10));
  $should.equal(_pipe$1, 1.0);
  let _pipe$2 = $model.budget_fraction(new Some(1), new Some(0));
  $should.equal(_pipe$2, 0.0);
  let _pipe$3 = $model.budget_fraction(Option$None$const, new Some(10));
  return $should.equal(_pipe$3, 0.0);
}

function count_up(loop$limit, loop$acc) {
  while (true) {
    let limit = loop$limit;
    let acc = loop$acc;
    let $ = limit <= 0;
    if ($) {
      return acc;
    } else {
      loop$limit = limit - 1;
      loop$acc = listPrepend(limit, acc);
    }
  }
}

export function push_sample_caps_history_test() {
  let _block;
  let _pipe = count_up(100, $List$Empty$const);
  _block = $list.fold(
    _pipe,
    $List$Empty$const,
    (acc, index) => {
      return $model.push_sample(acc, new $model.Sample(index, index, 1, index));
    },
  );
  let samples = _block;
  let _pipe$1 = $list.length(samples);
  $should.equal(_pipe$1, $model.history_length);
  let $ = $list.last(samples);
  if ($ instanceof Ok) {
    let sample = $[0];
    let _pipe$2 = sample.entries;
    $should.equal(_pipe$2, 100);
  } else {
    $should.fail();
  }
  let $1 = $list.first(samples);
  if ($1 instanceof Ok) {
    let sample = $1[0];
    let _pipe$2 = sample.entries;
    return $should.equal(_pipe$2, 41);
  } else {
    return $should.fail();
  }
}

export function sparkline_needs_two_points_test() {
  let _pipe = $model.sparkline_points(
    listPrepend(5.0, $List$Empty$const),
    100,
    24,
  );
  return $should.equal(_pipe, $List$Empty$const);
}

export function sparkline_scales_to_the_box_test() {
  let points = $model.sparkline_points(
    listPrepend(10.0, listPrepend(20.0, listPrepend(30.0, $List$Empty$const))),
    100,
    20,
  );
  let _pipe = points;
  return $should.equal(
    _pipe,
    listPrepend(
      [0.0, 20.0],
      listPrepend([50.0, 10.0], listPrepend([100.0, 0.0], $List$Empty$const)),
    ),
  );
}

export function sparkline_flat_line_sits_on_the_baseline_test() {
  let _pipe = $model.sparkline_points(
    listPrepend(7.0, listPrepend(7.0, $List$Empty$const)),
    10,
    10,
  );
  return $should.equal(
    _pipe,
    listPrepend([0.0, 10.0], listPrepend([10.0, 10.0], $List$Empty$const)),
  );
}

export function polyline_points_joins_with_spaces_test() {
  let _pipe = $model.polyline_points(
    listPrepend([0.0, 20.0], listPrepend([50.0, 10.0], $List$Empty$const)),
  );
  return $should.equal(_pipe, "0.0,20.0 50.0,10.0");
}

export function decodes_a_reader_state_test() {
  let result = $decode.state($fake.state_json(0));
  let state;
  if (result instanceof Ok) {
    state = result[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      119,
      "decodes_a_reader_state_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: result,
        start: 3827,
        end: 3856,
        pattern_start: 3838,
        pattern_end: 3847
      }
    )
  }
  let _pipe = state.vitals.entries;
  $should.equal(_pipe, new Some(1810));
  let _pipe$1 = state.vitals.sync_state;
  $should.equal(_pipe$1, $model.Freshness$Live$const);
  let _pipe$2 = state.vitals.sync_seq;
  $should.equal(_pipe$2, new Some(41));
  let _pipe$3 = state.queue.inbox_depth;
  $should.equal(_pipe$3, new Some(0));
  let _pipe$4 = state.agents.spike_state;
  $should.equal(_pipe$4, "working");
  let _pipe$5 = state.agents.in_flight;
  $should.equal(_pipe$5, new Some(3));
  let _pipe$6 = state.agents.queued;
  $should.equal(_pipe$6, new Some(0));
  let _pipe$7 = state.agents.retired;
  $should.equal(_pipe$7, new Some(2));
  let _pipe$8 = $list.length(state.agents.named);
  $should.equal(_pipe$8, 3);
  let $ = $list.first(state.agents.named);
  if ($ instanceof Ok) {
    let card = $[0];
    let _pipe$9 = card.name;
    $should.equal(_pipe$9, "reader");
    let _pipe$10 = card.state;
    $should.equal(_pipe$10, "working");
    let _pipe$11 = card.branch;
    $should.equal(_pipe$11, "worktree-reader");
    let _pipe$12 = card.last_reply;
    $should.equal(_pipe$12, new Some(2393));
  } else {
    $should.fail();
  }
  let _pipe$9 = $list.length(state.agents.orphans);
  return $should.equal(_pipe$9, 1);
}

export function decodes_a_reader_spend_test() {
  let $ = $decode.spend($fake.spend_json(0));
  let spend;
  if ($ instanceof Ok) {
    spend = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      142,
      "decodes_a_reader_spend_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 4701,
        end: 4756,
        pattern_start: 4712,
        pattern_end: 4721
      }
    )
  }
  let _pipe = spend.requests;
  $should.equal(_pipe, new Some(126));
  let _pipe$1 = spend.balance_usd;
  $should.equal(_pipe$1, new Some(0.0));
  let _pipe$2 = spend.percent_used;
  $should.equal(_pipe$2, new Some(12.5));
  let _pipe$3 = spend.cached;
  $should.equal(_pipe$3, true);
  let _pipe$4 = spend.stale;
  $should.equal(_pipe$4, false);
  let _pipe$5 = spend.error;
  return $should.equal(_pipe$5, Option$None$const);
}

export function tolerates_missing_fields_test() {
  let $ = $decode.state("{\"v\":1,\"ok\":true}");
  let state;
  if ($ instanceof Ok) {
    state = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      152,
      "tolerates_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5053,
        end: 5113,
        pattern_start: 5064,
        pattern_end: 5073
      }
    )
  }
  let _pipe = state.vitals.entries;
  $should.equal(_pipe, Option$None$const);
  let _pipe$1 = state.vitals.sync_state;
  $should.equal(_pipe$1, $model.Freshness$Unknown$const);
  let _pipe$2 = state.vitals.sync_age_s;
  $should.equal(_pipe$2, Option$None$const);
  let _pipe$3 = state.agents.named;
  $should.equal(_pipe$3, $List$Empty$const);
  let _pipe$4 = state.agents.spike_state;
  $should.equal(_pipe$4, "unknown");
  let _pipe$5 = state.agents.in_flight;
  return $should.equal(_pipe$5, Option$None$const);
}

export function rejects_a_non_json_body_test() {
  let $ = $decode.state("<html>502 Bad Gateway</html>");
  let problem;
  if ($ instanceof Error) {
    problem = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      162,
      "rejects_a_non_json_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5451,
        end: 5523,
        pattern_start: 5462,
        pattern_end: 5476
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

export function spend_without_money_is_unknown_not_zero_test() {
  let $ = $decode.spend("{\"v\":1,\"ok\":true,\"usage\":{\"requests\":3}}");
  let spend;
  if ($ instanceof Ok) {
    spend = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      168,
      "spend_without_money_is_unknown_not_zero_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5737,
        end: 5824,
        pattern_start: 5748,
        pattern_end: 5757
      }
    )
  }
  let _pipe = spend.requests;
  $should.equal(_pipe, new Some(3));
  let _pipe$1 = spend.balance_usd;
  $should.equal(_pipe$1, Option$None$const);
  let _pipe$2 = $model.format_usd(spend.balance_usd);
  return $should.equal(_pipe$2, "—");
}

export function every_agent_state_has_a_badge_test() {
  let _pipe = $model.agent_states;
  let _pipe$1 = $list.map(_pipe, $model.agent_state_label);
  return $should.equal(
    _pipe$1,
    listPrepend(
      "working",
      listPrepend(
        "queued",
        listPrepend(
          "reporting",
          listPrepend(
            "alive",
            listPrepend(
              "unnamed (prunable)",
              listPrepend("retired", listPrepend("unknown", $List$Empty$const)),
            ),
          ),
        ),
      ),
    ),
  );
}

export function agent_state_classes_are_distinct_test() {
  let classes = $list.map($model.agent_states, $model.agent_state_class);
  let _pipe = classes;
  return $should.equal(
    _pipe,
    listPrepend(
      "badge state-working",
      listPrepend(
        "badge state-queued",
        listPrepend(
          "badge state-reporting",
          listPrepend(
            "badge state-alive",
            listPrepend(
              "badge state-orphaned",
              listPrepend(
                "badge state-retired",
                listPrepend("badge state-unknown", $List$Empty$const),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

export function unknown_agent_state_degrades_test() {
  let _pipe = $model.agent_state_label("thinking");
  $should.equal(_pipe, "unknown");
  let _pipe$1 = $model.agent_state_label("");
  $should.equal(_pipe$1, "unknown");
  let _pipe$2 = $model.agent_state_class("thinking");
  return $should.equal(_pipe$2, "badge state-unknown");
}

/**
 * One fixture per state: the decoder must carry each state through untouched, so
 * a card never gets the badge of the card above it.
 */
export function decodes_all_seven_agent_states_test() {
  let json = (((((((("{\"v\":1,\"ok\":true,\"agents\":{\"spike\":{\"state\":\"queued\",\"conversation\":1}," + "\"named\":[") + "{\"name\":\"a\",\"state\":\"working\"},") + "{\"name\":\"b\",\"state\":\"queued\"},") + "{\"name\":\"c\",\"state\":\"reporting\"},") + "{\"name\":\"d\",\"state\":\"alive\"},") + "{\"name\":\"e\",\"state\":\"orphaned\"},") + "{\"name\":\"f\",\"state\":\"retired\"},") + "{\"name\":\"g\",\"state\":\"unknown\"}],") + "\"orphans\":[],\"retired\":0,\"work\":{\"in_flight\":0,\"queued\":1}}}";
  let $ = $decode.state(json);
  let state;
  if ($ instanceof Ok) {
    state = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      228,
      "decodes_all_seven_agent_states_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 7929,
        end: 7970,
        pattern_start: 7940,
        pattern_end: 7949
      }
    )
  }
  let _pipe = state.agents.spike_state;
  $should.equal(_pipe, "queued");
  let _pipe$1 = state.agents.named;
  let _pipe$2 = $list.map(_pipe$1, (card) => { return card.state; });
  return $should.equal(
    _pipe$2,
    listPrepend(
      "working",
      listPrepend(
        "queued",
        listPrepend(
          "reporting",
          listPrepend(
            "alive",
            listPrepend(
              "orphaned",
              listPrepend("retired", listPrepend("unknown", $List$Empty$const)),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * A card with no `state` (an older reader) is unknown, never "alive".
 */
export function agent_without_state_is_unknown_test() {
  let $ = $decode.state(
    "{\"v\":1,\"ok\":true,\"agents\":{\"named\":[{\"name\":\"x\"}]}}",
  );
  let state;
  if ($ instanceof Ok) {
    state = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      245,
      "agent_without_state_is_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 8338,
        end: 8440,
        pattern_start: 8349,
        pattern_end: 8358
      }
    )
  }
  let $1 = $list.first(state.agents.named);
  if ($1 instanceof Ok) {
    let card = $1[0];
    let _pipe = card.state;
    return $should.equal(_pipe, "unknown");
  } else {
    return $should.fail();
  }
}

export function work_line_test() {
  let agents = new $model.Agents(
    "working",
    $List$Empty$const,
    $List$Empty$const,
    new Some(0),
    new Some(3),
    new Some(1),
  );
  let _pipe = $model.work_line(agents);
  $should.equal(_pipe, "work: 3 in flight · 1 queued");
  let _pipe$1 = $model.work_line($model.empty_agents());
  return $should.equal(_pipe$1, "work: — in flight · — queued");
}

export function orphan_summary_test() {
  let _block;
  let _record = $model.empty_agents();
  _block = new $model.Agents(
    _record.spike_state,
    _record.named,
    listPrepend(new $model.Orphan(2201, new Some(2202)), $List$Empty$const),
    _record.retired,
    _record.in_flight,
    _record.queued,
  );
  let one = _block;
  let _pipe = $model.orphan_summary($model.empty_agents());
  $should.equal(_pipe, "no orphans");
  let _pipe$1 = $model.orphan_summary(one);
  $should.equal(_pipe$1, "1 unnamed (prunable)");
  let _pipe$2 = $model.orphan_summary(
    new $model.Agents(
      one.spike_state,
      one.named,
      listPrepend(
        new $model.Orphan(1, Option$None$const),
        listPrepend(new $model.Orphan(2, new Some(3)), $List$Empty$const),
      ),
      one.retired,
      one.in_flight,
      one.queued,
    ),
  );
  return $should.equal(_pipe$2, "2 unnamed (prunable)");
}

/**
 * A named agent's last answer is an entry id or `—`; there is no zero.
 */
export function last_reply_renders_as_entry_or_dash_test() {
  let $ = $decode.state($fake.state_json(0));
  let state;
  if ($ instanceof Ok) {
    state = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      282,
      "last_reply_renders_as_entry_or_dash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 9501,
        end: 9556,
        pattern_start: 9512,
        pattern_end: 9521
      }
    )
  }
  let _pipe = state.agents.named;
  let _pipe$1 = $list.map(
    _pipe,
    (card) => {
      let $1 = card.last_reply;
      if ($1 instanceof $option.Some) {
        let entry = $1[0];
        return $int.to_string(entry);
      } else {
        return "—";
      }
    },
  );
  return $should.equal(
    _pipe$1,
    listPrepend(
      "2393",
      listPrepend("2409", listPrepend("2181", $List$Empty$const)),
    ),
  );
}

export function empty_filters_send_no_kind_test() {
  let _pipe = $model.logs_path($model.empty_filters(), Option$None$const, 50);
  return $should.equal(_pipe, "/api/logs?limit=50&dir=desc");
}

export function direction_narrows_the_kinds_test() {
  let _pipe = $model.effective_kinds($model.empty_filters());
  $should.equal(_pipe, $List$Empty$const);
  let _pipe$1 = $model.effective_kinds(
    new $model.LogFilters(
      $List$Empty$const,
      $model.Direction$Incoming$const,
      "",
    ),
  );
  $should.equal(_pipe$1, listPrepend("pi.user", $List$Empty$const));
  let _pipe$2 = $model.effective_kinds(
    new $model.LogFilters(
      $List$Empty$const,
      $model.Direction$Outgoing$const,
      "",
    ),
  );
  return $should.equal(
    _pipe$2,
    listPrepend("pi.assistant", listPrepend("app.*", $List$Empty$const)),
  );
}

export function chips_and_direction_intersect_test() {
  let _pipe = $model.effective_kinds(
    new $model.LogFilters(
      listPrepend("pi.assistant", $List$Empty$const),
      $model.Direction$Incoming$const,
      "",
    ),
  );
  $should.equal(_pipe, listPrepend("(no such kind)", $List$Empty$const));
  let _pipe$1 = $model.effective_kinds(
    new $model.LogFilters(
      listPrepend("pi.user", listPrepend("pi.assistant", $List$Empty$const)),
      $model.Direction$Outgoing$const,
      "",
    ),
  );
  $should.equal(_pipe$1, listPrepend("pi.assistant", $List$Empty$const));
  let _pipe$2 = $model.effective_kinds(
    new $model.LogFilters(
      listPrepend("pi.compaction", $List$Empty$const),
      $model.Direction$BothWays$const,
      "",
    ),
  );
  return $should.equal(_pipe$2, listPrepend("pi.compaction", $List$Empty$const));
}

export function app_star_matches_the_family_test() {
  let _pipe = $model.effective_kinds(
    new $model.LogFilters(
      listPrepend("app.*", listPrepend("pi.user", $List$Empty$const)),
      $model.Direction$Outgoing$const,
      "",
    ),
  );
  return $should.equal(_pipe, listPrepend("app.*", $List$Empty$const));
}

export function logs_path_carries_the_cursor_and_the_search_test() {
  let filters = new $model.LogFilters(
    listPrepend("pi.user", listPrepend("app.*", $List$Empty$const)),
    $model.Direction$BothWays$const,
    "a b&c",
  );
  let _pipe = $model.logs_path(filters, new Some(3509), 200);
  $should.equal(
    _pipe,
    "/api/logs?limit=200&dir=desc&kind=pi.user,app.*&before=3509&q=a%20b%26c",
  );
  let _pipe$1 = $model.logs_path(
    new $model.LogFilters(filters.kinds, filters.direction, "   "),
    Option$None$const,
    50,
  );
  return $should.equal(
    _pipe$1,
    "/api/logs?limit=50&dir=desc&kind=pi.user,app.*",
  );
}

export function url_encode_escapes_the_query_metacharacters_test() {
  let _pipe = $model.url_encode("%_&?#+=");
  $should.equal(_pipe, "%25_%26%3F%23%2B%3D");
  let _pipe$1 = $model.url_encode("plain");
  return $should.equal(_pipe$1, "plain");
}

export function short_time_takes_the_clock_out_of_an_iso_stamp_test() {
  let _pipe = $model.short_time(new Some("2026-10-29T14:30:58.000Z"));
  $should.equal(_pipe, "14:30:58");
  let _pipe$1 = $model.short_time(new Some("bogus"));
  $should.equal(_pipe$1, "bogus");
  let _pipe$2 = $model.short_time(Option$None$const);
  return $should.equal(_pipe$2, "—");
}

export function logs_line_counts_and_names_the_mode_test() {
  let _pipe = $model.logs_line($model.empty_logs());
  $should.equal(_pipe, "0 entries · live tail");
  let _block;
  let _record = $model.empty_logs();
  _block = new $model.Logs(
    listPrepend(
      new $model.LogEntry(
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
  let _pipe$1 = $model.logs_line(one);
  $should.equal(_pipe$1, "1 entry · live tail");
  let _pipe$2 = $model.logs_line(
    new $model.Logs(
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
  let $ = $decode.logs($fake.logs_json($model.empty_filters(), 0));
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      399,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 13332,
        end: 13407,
        pattern_start: 13343,
        pattern_end: 13351
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
      "wall_test",
      403,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 13536,
        end: 13584,
        pattern_start: 13547,
        pattern_end: 13557
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
      "wall_test",
      410,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $2,
        start: 13926,
        end: 13993,
        pattern_start: 13937,
        pattern_end: 13948
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
      "wall_test",
      412,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $3,
        start: 14073,
        end: 14136,
        pattern_start: 14084,
        pattern_end: 14091
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
      new $model.LogFilters(
        $List$Empty$const,
        $model.Direction$Incoming$const,
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
      "wall_test",
      418,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 14281,
        end: 14423,
        pattern_start: 14292,
        pattern_end: 14300
      }
    )
  }
  let _pipe = page.entries;
  let _pipe$1 = $list.map(_pipe, (entry) => { return entry.kind; });
  $should.equal(_pipe$1, listPrepend("pi.user", $List$Empty$const));
  let $1 = $decode.logs(
    $fake.logs_json(
      new $model.LogFilters(
        $List$Empty$const,
        $model.Direction$BothWays$const,
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
      "wall_test",
      425,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 14509,
        end: 14662,
        pattern_start: 14520,
        pattern_end: 14532
      }
    )
  }
  let _pipe$2 = searched.entries;
  let _pipe$3 = $list.map(_pipe$2, (entry) => { return entry.kind; });
  $should.equal(_pipe$3, listPrepend("pi.compaction", $List$Empty$const));
  let $2 = $decode.logs(
    $fake.logs_json(
      new $model.LogFilters(
        listPrepend("pi.assistant", $List$Empty$const),
        $model.Direction$Incoming$const,
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
      "wall_test",
      432,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $2,
        start: 14758,
        end: 14917,
        pattern_start: 14769,
        pattern_end: 14780
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
      "wall_test",
      442,
      "tolerates_a_row_with_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15057,
        end: 15140,
        pattern_start: 15068,
        pattern_end: 15076
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
      "wall_test",
      443,
      "tolerates_a_row_with_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 15143,
        end: 15190,
        pattern_start: 15154,
        pattern_end: 15163
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
      "wall_test",
      452,
      "a_failed_read_is_a_message_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15440,
        end: 15556,
        pattern_start: 15451,
        pattern_end: 15459
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
      "wall_test",
      461,
      "rejects_a_non_json_logs_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15732,
        end: 15791,
        pattern_start: 15743,
        pattern_end: 15757
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
      "wall_test",
      470,
      "decodes_a_spill_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 16205,
        end: 16255,
        pattern_start: 16216,
        pattern_end: 16230
      }
    )
  }
  let _pipe$3 = problem;
  let _pipe$4 = $string.starts_with(_pipe$3, "unexpected response shape: ");
  return $should.be_true(_pipe$4);
}

function sample_logs() {
  return new $model.Logs(
    listPrepend(
      new $model.LogEntry(
        12,
        "pi.assistant",
        new Some("2026-10-29T14:30:58.000Z"),
        "answered: the wall is up",
        new Some("wall-ui"),
        Option$None$const,
        "{\"kind\":\"pi.assistant\"}",
      ),
      listPrepend(
        new $model.LogEntry(
          11,
          "pi.tool-result",
          Option$None$const,
          "bash: full output (18 bytes)",
          Option$None$const,
          new Some("/opt/pi-host/storage/spill/full.log"),
          "{}",
        ),
        $List$Empty$const,
      ),
    ),
    new Some(10),
    true,
    false,
    listPrepend([11, "line one\nline two\n"], $List$Empty$const),
    Option$None$const,
  );
}

function logs_model() {
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
    $model.Tab$LogsTab$const,
    _record.filters,
    new Some(sample_logs()),
  );
}

function count_of(haystack, needle) {
  let _pipe = $string.split(haystack, needle);
  let _pipe$1 = $list.length(_pipe);
  return ((parts) => { return parts - 1; })(_pipe$1);
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
  let _pipe$8 = count_of(_pipe$7, "log-row");
  return $should.equal(_pipe$8, 0);
}

export function the_logs_tab_draws_every_row_test() {
  let _block;
  let _pipe = $view.view(logs_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = count_of(_pipe$1, "<details");
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
  let _pipe = $view.view(logs_model());
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
  let _pipe = $view.view(logs_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = count_of(_pipe$1, "log-spill");
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
  let _record = logs_model();
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
    new $model.LogFilters(
      listPrepend("pi.user", $List$Empty$const),
      $model.Direction$Incoming$const,
      "spill",
    ),
    _record.logs,
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
  let _pipe$6 = count_of(_pipe$5, "chip active");
  return $should.equal(_pipe$6, 2);
}

export function an_empty_page_says_so_test() {
  let _block;
  let _pipe = $view.view(
    (() => {
      let _record = logs_model();
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
            let _record$1 = $model.empty_logs();
            return new $model.Logs(
              _record$1.entries,
              _record$1.next_before,
              _record$1.tailing,
              _record$1.appending,
              _record$1.spills,
              new Some("ledger unavailable"),
            );
          })(),
        ),
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
