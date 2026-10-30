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
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  makeError,
} from "./gleam.mjs";
import * as $wall from "./wall.mjs";
import * as $decode from "./wall/decode.mjs";
import * as $fake from "./wall/fake.mjs";
import * as $model from "./wall/model.mjs";
import * as $pretty from "./wall/pretty.mjs";
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
      121,
      "decodes_a_reader_state_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: result,
        start: 3858,
        end: 3887,
        pattern_start: 3869,
        pattern_end: 3878
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
      144,
      "decodes_a_reader_spend_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 4732,
        end: 4787,
        pattern_start: 4743,
        pattern_end: 4752
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
      154,
      "tolerates_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5084,
        end: 5144,
        pattern_start: 5095,
        pattern_end: 5104
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
      164,
      "rejects_a_non_json_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5482,
        end: 5554,
        pattern_start: 5493,
        pattern_end: 5507
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
      170,
      "spend_without_money_is_unknown_not_zero_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5768,
        end: 5855,
        pattern_start: 5779,
        pattern_end: 5788
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
      230,
      "decodes_all_seven_agent_states_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 7960,
        end: 8001,
        pattern_start: 7971,
        pattern_end: 7980
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
      247,
      "agent_without_state_is_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 8369,
        end: 8471,
        pattern_start: 8380,
        pattern_end: 8389
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
      284,
      "last_reply_renders_as_entry_or_dash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 9532,
        end: 9587,
        pattern_start: 9543,
        pattern_end: 9552
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
      401,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 13363,
        end: 13438,
        pattern_start: 13374,
        pattern_end: 13382
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
      405,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 13567,
        end: 13615,
        pattern_start: 13578,
        pattern_end: 13588
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
      412,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $2,
        start: 13957,
        end: 14024,
        pattern_start: 13968,
        pattern_end: 13979
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
      414,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $3,
        start: 14104,
        end: 14167,
        pattern_start: 14115,
        pattern_end: 14122
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
      420,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 14312,
        end: 14454,
        pattern_start: 14323,
        pattern_end: 14331
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
      427,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 14540,
        end: 14693,
        pattern_start: 14551,
        pattern_end: 14563
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
      434,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $2,
        start: 14789,
        end: 14948,
        pattern_start: 14800,
        pattern_end: 14811
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
      444,
      "tolerates_a_row_with_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15088,
        end: 15171,
        pattern_start: 15099,
        pattern_end: 15107
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
      445,
      "tolerates_a_row_with_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 15174,
        end: 15221,
        pattern_start: 15185,
        pattern_end: 15194
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
      454,
      "a_failed_read_is_a_message_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15471,
        end: 15587,
        pattern_start: 15482,
        pattern_end: 15490
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
      463,
      "rejects_a_non_json_logs_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15763,
        end: 15822,
        pattern_start: 15774,
        pattern_end: 15788
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
      472,
      "decodes_a_spill_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 16236,
        end: 16286,
        pattern_start: 16247,
        pattern_end: 16261
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
    _record.browser,
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

export function a_compact_record_gains_lines_test() {
  let _pipe = $pretty.json("{\"kind\":\"pi.assistant\",\"id\":3610}");
  return $should.equal(
    _pipe,
    "{\n  \"kind\": \"pi.assistant\",\n  \"id\": 3610\n}",
  );
}

export function nesting_adds_a_level_each_time_test() {
  let _pipe = $pretty.json("{\"a\":{\"b\":[1,2]}}");
  return $should.equal(
    _pipe,
    "{\n  \"a\": {\n    \"b\": [\n      1,\n      2\n    ]\n  }\n}",
  );
}

export function empty_containers_stay_on_one_line_test() {
  let _pipe = $pretty.json("{\"a\":{},\"b\":[],\"c\":[{}]}");
  return $should.equal(
    _pipe,
    "{\n  \"a\": {},\n  \"b\": [],\n  \"c\": [\n    {}\n  ]\n}",
  );
}

export function string_literals_are_never_reformatted_test() {
  let _pipe = $pretty.json("{\"t\":\"a {b}, c: \\\"d\\\"\"}");
  $should.equal(_pipe, "{\n  \"t\": \"a {b}, c: \\\"d\\\"\"\n}");
  let _pipe$1 = $pretty.json("{\"t\":\"back\\\\\"}");
  return $should.equal(_pipe$1, "{\n  \"t\": \"back\\\\\"\n}");
}

export function top_level_shapes_are_kept_test() {
  let _pipe = $pretty.json("[]");
  $should.equal(_pipe, "[]");
  let _pipe$1 = $pretty.json("[1,true,null]");
  $should.equal(_pipe$1, "[\n  1,\n  true,\n  null\n]");
  let _pipe$2 = $pretty.json("{ \"a\" : 1 }");
  return $should.equal(_pipe$2, "{\n  \"a\": 1\n}");
}

export function a_record_that_is_not_json_is_left_alone_test() {
  let _pipe = $pretty.json("not a record at all");
  $should.equal(_pipe, "not a record at all");
  let _pipe$1 = $pretty.json("");
  $should.equal(_pipe$1, "");
  let _pipe$2 = $pretty.json("{\"truncated\":");
  return $should.equal(_pipe$2, "{\"truncated\":");
}

export function an_enormous_record_is_not_indented_test() {
  let huge = ("{\"a\":\"" + $string.repeat("x", $pretty.max_pretty_chars)) + "\"}";
  let _pipe = $pretty.json(huge);
  return $should.equal(_pipe, huge);
}

export function the_expander_shows_the_indented_record_test() {
  let _block;
  let _pipe = $view.view(logs_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $string.contains(
    _pipe$1,
    "{\n  &quot;kind&quot;: &quot;pi.assistant&quot;\n}",
  );
  return $should.be_true(_pipe$2);
}

function sample_conversation(id, kind, title, state) {
  return new $model.Conversation(
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
      "wall_test",
      662,
      "browser_model",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 22857,
        end: 22926,
        pattern_start: 22868,
        pattern_end: 22876
      }
    )
  }
  let _block;
  let _record = $model.empty_browser();
  _block = new $model.Browser(
    $model.order_conversations(page.items),
    _record.conversations_error,
    _record.selected,
    _record.stream,
    _record.anchor,
    _record.search,
  );
  let browser = _block;
  let browser$1 = $model.select_conversation(browser, 1);
  let $1 = $decode.logs($fake.browser_logs_json(1, $model.empty_filters(), 0));
  let logs;
  if ($1 instanceof Ok) {
    logs = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      669,
      "browser_model",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 23115,
        end: 23201,
        pattern_start: 23126,
        pattern_end: 23134
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
    $model.Tab$BrowserTab$const,
    _record$1.filters,
    _record$1.logs,
    new $model.Browser(
      browser$1.conversations,
      browser$1.conversations_error,
      browser$1.selected,
      new Some(
        new $model.Logs(
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
      "wall_test",
      690,
      "the_conversations_decoder_reads_the_rail_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 23631,
        end: 23700,
        pattern_start: 23642,
        pattern_end: 23650
      }
    )
  }
  let _pipe = page.ok;
  $should.be_true(_pipe);
  let _pipe$1 = page.error;
  $should.equal(_pipe$1, Option$None$const);
  let _pipe$2 = page;
  let _pipe$3 = ((page) => { return $model.order_conversations(page.items); })(
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
      "wall_test",
      707,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 24244,
        end: 24407,
        pattern_start: 24255,
        pattern_end: 24263
      }
    )
  }
  let $1 = page.items;
  let item;
  if ($1 instanceof $Empty) {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      710,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 24410,
        end: 24440,
        pattern_start: 24421,
        pattern_end: 24427
      }
    )
  } else if ($1.tail instanceof $Empty) {
    item = $1.head;
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      710,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 24410,
        end: 24440,
        pattern_start: 24421,
        pattern_end: 24427
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
      "wall_test",
      721,
      "an_unreadable_conversations_body_is_an_error_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 24804,
        end: 24877,
        pattern_start: 24815,
        pattern_end: 24829
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
      "wall_test",
      724,
      "an_unreadable_conversations_body_is_an_error_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 25042,
        end: 25133,
        pattern_start: 25053,
        pattern_end: 25061
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
      "wall_test",
      731,
      "the_search_decoder_reads_the_jump_list_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 25313,
        end: 25377,
        pattern_start: 25324,
        pattern_end: 25332
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
      "wall_test",
      743,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 25727,
        end: 25856,
        pattern_start: 25738,
        pattern_end: 25746
      }
    )
  }
  let $1 = page.hits;
  let hit;
  if ($1 instanceof $Empty) {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      746,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 25859,
        end: 25887,
        pattern_start: 25870,
        pattern_end: 25875
      }
    )
  } else if ($1.tail instanceof $Empty) {
    hit = $1.head;
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      746,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 25859,
        end: 25887,
        pattern_start: 25870,
        pattern_end: 25875
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
  let _pipe$4 = $model.jump_to_hit(
    $model.empty_browser(),
    hit.conversation,
    hit.entry,
  );
  return $should.equal(_pipe$4, $model.empty_browser());
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
  let _pipe$1 = $model.order_conversations(_pipe);
  let _pipe$2 = $list.map(_pipe$1, (item) => { return item.id; });
  $should.equal(
    _pipe$2,
    listPrepend(
      1,
      listPrepend(2, listPrepend(3, listPrepend(9, $List$Empty$const))),
    ),
  );
  let _pipe$3 = $model.conversation_line(
    sample_conversation(1, "main", "main", "working"),
  );
  $should.equal(_pipe$3, "2 entries");
  let _pipe$4 = $model.conversation_span(
    sample_conversation(1, "main", "main", "working"),
  );
  return $should.equal(_pipe$4, "10-29 13:02 → 10-29 14:29");
}

export function the_browser_asks_for_one_conversation_and_a_window_test() {
  let _pipe = $model.logs_path($model.empty_filters(), Option$None$const, 50);
  $should.equal(_pipe, "/api/logs?limit=50&dir=desc");
  let _pipe$1 = $model.logs_path_for(
    $model.empty_filters(),
    new Some(2166),
    Option$None$const,
    50,
    Option$None$const,
  );
  $should.equal(_pipe$1, "/api/logs?limit=50&dir=desc&conversation=2166");
  let _pipe$2 = $model.logs_path_for(
    $model.empty_filters(),
    new Some(2166),
    Option$None$const,
    50,
    new Some(4110),
  );
  $should.equal(
    _pipe$2,
    "/api/logs?limit=50&dir=desc&conversation=2166&around=4110",
  );
  let _pipe$3 = $model.search_path("  wall & browser  ", 25);
  $should.equal(_pipe$3, "/api/search?limit=25&q=wall%20%26%20browser");
  let _pipe$4 = $model.search_path("", 25);
  return $should.equal(_pipe$4, "/api/search?limit=25&q=");
}

export function a_hit_selects_its_conversation_and_opens_a_window_test() {
  let start = browser_model();
  let _pipe = start.browser.selected;
  $should.equal(_pipe, new Some(1));
  let $ = $wall.update(start, new $model.HitChosen(new Some(2166), 4110));
  let landed = $[0];
  let _pipe$1 = landed.tab;
  $should.equal(_pipe$1, $model.Tab$BrowserTab$const);
  let _pipe$2 = landed.browser.selected;
  $should.equal(_pipe$2, new Some(2166));
  let _pipe$3 = landed.browser.anchor;
  $should.equal(_pipe$3, new Some(4110));
  let $1 = $decode.logs(
    $fake.browser_logs_json(2166, $model.empty_filters(), 0),
  );
  let page;
  if ($1 instanceof Ok) {
    page = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      799,
      "a_hit_selects_its_conversation_and_opens_a_window_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 28211,
        end: 28300,
        pattern_start: 28222,
        pattern_end: 28230
      }
    )
  }
  let $2 = $wall.update(
    landed,
    new $model.BrowserLogsArrived(
      $fake.browser_logs_json(2166, $model.empty_filters(), 0),
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
      "wall_test",
      801,
      "a_hit_selects_its_conversation_and_opens_a_window_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $3,
        start: 28426,
        end: 28473,
        pattern_start: 28437,
        pattern_end: 28449
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
  let _pipe = $model.is_divider("pi.compaction");
  $should.be_true(_pipe);
  let _pipe$1 = $model.is_divider("pi.user");
  $should.be_false(_pipe$1);
  let _pipe$2 = $model.divider_label(0);
  $should.equal(_pipe$2, "— summarized history begins —");
  let _pipe$3 = $model.divider_label(3);
  $should.equal(_pipe$3, "— summarized history continues —");
  let _block;
  let _pipe$4 = $view.view(browser_model());
  _block = $element.to_string(_pipe$4);
  let html = _block;
  let _pipe$5 = html;
  let _pipe$6 = count_of(_pipe$5, "class=\"log-divider\"");
  $should.equal(_pipe$6, 2);
  let _pipe$7 = html;
  let _pipe$8 = $string.contains(_pipe$7, "— summarized history begins —");
  $should.be_true(_pipe$8);
  let _pipe$9 = html;
  let _pipe$10 = $string.contains(_pipe$9, "— summarized history continues —");
  $should.be_true(_pipe$10);
  let _pipe$11 = html;
  let _pipe$12 = count_of(_pipe$11, "class=\"log-row\"");
  $should.equal(_pipe$12, 5);
  let _pipe$13 = html;
  let _pipe$14 = $string.contains(_pipe$13, "the browser tab is up");
  $should.be_true(_pipe$14);
  let _pipe$15 = html;
  let _pipe$16 = $string.contains(_pipe$15, "system: preamble + 12 tools");
  return $should.be_true(_pipe$16);
}

export function the_same_rows_render_in_the_logs_tab_without_dividers_test() {
  let $ = $decode.logs($fake.browser_logs_json(1, $model.empty_filters(), 0));
  let page;
  if ($ instanceof Ok) {
    page = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      828,
      "the_same_rows_render_in_the_logs_tab_without_dividers_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 29839,
        end: 29925,
        pattern_start: 29850,
        pattern_end: 29858
      }
    )
  }
  let logs = new $model.Logs(
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
        $model.Tab$LogsTab$const,
        _record.filters,
        new Some(logs),
        _record.browser,
      );
    })(),
  );
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = count_of(_pipe$1, "class=\"log-divider\"");
  $should.equal(_pipe$2, 0);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "pi.compaction");
  $should.be_true(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = count_of(_pipe$5, "class=\"log-row\"");
  return $should.equal(_pipe$6, 7);
}

export function the_rail_renders_one_card_per_space_with_its_state_test() {
  let _block;
  let _pipe = $view.view(browser_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = count_of(_pipe$1, "space-card");
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
  let _pipe$8 = $model.search_line(with_hits.browser.search);
  $should.equal(_pipe$8, "3 hits for brow");
  let _block;
  let _pipe$9 = $view.view(with_hits);
  _block = $element.to_string(_pipe$9);
  let html = _block;
  let _pipe$10 = html;
  let _pipe$11 = count_of(_pipe$10, "class=\"hit\"");
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
  let _pipe$3 = $model.search_line(next.browser.search);
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
        $model.Tab$BrowserTab$const,
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
  return $should.equal(_pipe$3, new Some($model.empty_logs()));
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
  let _pipe$5 = $model.tab_label($model.Tab$BrowserTab$const);
  return $should.equal(_pipe$5, "browser");
}
