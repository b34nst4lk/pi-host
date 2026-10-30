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
  let _pipe$4 = state.agents.spike_kind;
  $should.equal(_pipe$4, "main");
  let _pipe$5 = state.agents.spike_state;
  $should.equal(_pipe$5, "working");
  let _pipe$6 = state.agents.in_flight;
  $should.equal(_pipe$6, new Some(3));
  let _pipe$7 = state.agents.queued;
  $should.equal(_pipe$7, new Some(0));
  let _pipe$8 = state.agents.retired;
  $should.equal(_pipe$8, new Some(2));
  let _pipe$9 = $list.length(state.agents.named);
  $should.equal(_pipe$9, 5);
  let _pipe$10 = $model.subagent_cards(state.agents);
  let _pipe$11 = $list.length(_pipe$10);
  $should.equal(_pipe$11, 3);
  let _pipe$12 = $model.project_cards(state.agents);
  let _pipe$13 = $list.length(_pipe$12);
  $should.equal(_pipe$13, 2);
  let $ = $list.first(state.agents.named);
  if ($ instanceof Ok) {
    let card = $[0];
    let _pipe$14 = card.name;
    $should.equal(_pipe$14, "reader");
    let _pipe$15 = card.state;
    $should.equal(_pipe$15, "working");
    let _pipe$16 = card.branch;
    $should.equal(_pipe$16, "worktree-reader");
    let _pipe$17 = card.last_reply;
    $should.equal(_pipe$17, new Some(2393));
  } else {
    $should.fail();
  }
  let _pipe$14 = $list.length(state.agents.orphans);
  return $should.equal(_pipe$14, 1);
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
      149,
      "decodes_a_reader_spend_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5033,
        end: 5088,
        pattern_start: 5044,
        pattern_end: 5053
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
      159,
      "tolerates_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5385,
        end: 5445,
        pattern_start: 5396,
        pattern_end: 5405
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
      169,
      "rejects_a_non_json_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5783,
        end: 5855,
        pattern_start: 5794,
        pattern_end: 5808
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
      175,
      "spend_without_money_is_unknown_not_zero_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 6069,
        end: 6156,
        pattern_start: 6080,
        pattern_end: 6089
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
      235,
      "decodes_all_seven_agent_states_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 8261,
        end: 8302,
        pattern_start: 8272,
        pattern_end: 8281
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
      252,
      "agent_without_state_is_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 8670,
        end: 8772,
        pattern_start: 8681,
        pattern_end: 8690
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
    "main",
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
    _record.spike_kind,
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
      one.spike_kind,
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
      290,
      "last_reply_renders_as_entry_or_dash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 9857,
        end: 9912,
        pattern_start: 9868,
        pattern_end: 9877
      }
    )
  }
  let _pipe = $model.subagent_cards(state.agents);
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
      407,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 13704,
        end: 13779,
        pattern_start: 13715,
        pattern_end: 13723
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
      411,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 13908,
        end: 13956,
        pattern_start: 13919,
        pattern_end: 13929
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
      418,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $2,
        start: 14298,
        end: 14365,
        pattern_start: 14309,
        pattern_end: 14320
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
      420,
      "decodes_a_logs_page_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $3,
        start: 14445,
        end: 14508,
        pattern_start: 14456,
        pattern_end: 14463
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
      426,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 14653,
        end: 14795,
        pattern_start: 14664,
        pattern_end: 14672
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
      433,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 14881,
        end: 15034,
        pattern_start: 14892,
        pattern_end: 14904
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
      440,
      "fake_fixtures_honour_the_filters_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $2,
        start: 15130,
        end: 15289,
        pattern_start: 15141,
        pattern_end: 15152
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
      450,
      "tolerates_a_row_with_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15429,
        end: 15512,
        pattern_start: 15440,
        pattern_end: 15448
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
      451,
      "tolerates_a_row_with_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 15515,
        end: 15562,
        pattern_start: 15526,
        pattern_end: 15535
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
      460,
      "a_failed_read_is_a_message_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 15812,
        end: 15928,
        pattern_start: 15823,
        pattern_end: 15831
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
      469,
      "rejects_a_non_json_logs_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 16104,
        end: 16163,
        pattern_start: 16115,
        pattern_end: 16129
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
      478,
      "decodes_a_spill_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 16577,
        end: 16627,
        pattern_start: 16588,
        pattern_end: 16602
      }
    )
  }
  let _pipe$3 = problem;
  let _pipe$4 = $string.starts_with(_pipe$3, "unexpected response shape: ");
  return $should.be_true(_pipe$4);
}

function sample_projects() {
  let _record = $model.empty_agents();
  return new $model.Agents(
    _record.spike_kind,
    _record.spike_state,
    listPrepend(
      new $model.AgentCard(
        "project",
        "the-wall",
        "working",
        "",
        "",
        Option$None$const,
        new Some("!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU"),
        new Some("/work/projects/the-wall"),
        new Some("the wall: a read-only window on the ledger"),
        new Some(1832),
      ),
      listPrepend(
        new $model.AgentCard(
          "project",
          "docs",
          "retired",
          "",
          "",
          Option$None$const,
          Option$None$const,
          Option$None$const,
          new Some(""),
          Option$None$const,
        ),
        listPrepend(
          new $model.AgentCard(
            "subagent",
            "reader",
            "alive",
            "worktree-reader",
            "/w/reader",
            new Some(2393),
            Option$None$const,
            Option$None$const,
            Option$None$const,
            Option$None$const,
          ),
          $List$Empty$const,
        ),
      ),
    ),
    _record.orphans,
    _record.retired,
    _record.in_flight,
    _record.queued,
  );
}

function projects_model() {
  let _record = $model.initial($model.Mode$LiveMode$const);
  return new $model.Model(
    _record.mode,
    _record.vitals,
    _record.spend,
    new Some(sample_projects()),
    _record.queue,
    _record.samples,
    _record.polls,
    _record.error,
    $model.Tab$ProjectsTab$const,
    _record.filters,
    _record.logs,
    _record.browser,
  );
}

export function room_short_keeps_short_ids_and_clips_long_ones_test() {
  let _pipe = $model.room_short("!docs:jacks.im");
  $should.equal(_pipe, "!docs:jacks.im");
  let _pipe$1 = $model.room_short(
    "!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU",
  );
  $should.equal(_pipe$1, "!ig3PmgqC-r…XpufmU");
  let _pipe$2 = $model.room_short("!abcdefghij:jacks.im");
  return $should.equal(_pipe$2, "!abcdefghij:jacks.im");
}

export function project_line_names_the_room_and_the_history_test() {
  let projects = sample_projects();
  let $ = $model.project_cards(projects);
  let the_wall;
  let docs;
  if ($ instanceof $Empty) {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      553,
      "project_line_names_the_room_and_the_history_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 18894,
        end: 18953,
        pattern_start: 18905,
        pattern_end: 18921
      }
    )
  } else {
    let $1 = $.tail;
    if ($1 instanceof $Empty) {
      throw makeError(
        "let_assert",
        FILEPATH,
        "wall_test",
        553,
        "project_line_names_the_room_and_the_history_test",
        "Pattern match failed, no pattern matched the value.",
        {
          value: $,
          start: 18894,
          end: 18953,
          pattern_start: 18905,
          pattern_end: 18921
        }
      )
    } else if ($1.tail instanceof $Empty) {
      the_wall = $.head;
      docs = $1.head;
    } else {
      throw makeError(
        "let_assert",
        FILEPATH,
        "wall_test",
        553,
        "project_line_names_the_room_and_the_history_test",
        "Pattern match failed, no pattern matched the value.",
        {
          value: $,
          start: 18894,
          end: 18953,
          pattern_start: 18905,
          pattern_end: 18921
        }
      )
    }
  }
  let _pipe = $model.project_line(the_wall);
  $should.equal(_pipe, "the-wall — room !ig3PmgqC-r…XpufmU — 1,832 entries");
  let _pipe$1 = $model.project_line(docs);
  return $should.equal(_pipe$1, "docs — room no room — — entries");
}

export function project_fallbacks_never_invent_a_directory_or_a_summary_test() {
  let $ = $model.project_cards(sample_projects());
  let the_wall;
  let docs;
  if ($ instanceof $Empty) {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      561,
      "project_fallbacks_never_invent_a_directory_or_a_summary_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 19292,
        end: 19360,
        pattern_start: 19303,
        pattern_end: 19319
      }
    )
  } else {
    let $1 = $.tail;
    if ($1 instanceof $Empty) {
      throw makeError(
        "let_assert",
        FILEPATH,
        "wall_test",
        561,
        "project_fallbacks_never_invent_a_directory_or_a_summary_test",
        "Pattern match failed, no pattern matched the value.",
        {
          value: $,
          start: 19292,
          end: 19360,
          pattern_start: 19303,
          pattern_end: 19319
        }
      )
    } else if ($1.tail instanceof $Empty) {
      the_wall = $.head;
      docs = $1.head;
    } else {
      throw makeError(
        "let_assert",
        FILEPATH,
        "wall_test",
        561,
        "project_fallbacks_never_invent_a_directory_or_a_summary_test",
        "Pattern match failed, no pattern matched the value.",
        {
          value: $,
          start: 19292,
          end: 19360,
          pattern_start: 19303,
          pattern_end: 19319
        }
      )
    }
  }
  let _pipe = $model.project_dir(the_wall);
  $should.equal(_pipe, "/work/projects/the-wall");
  let _pipe$1 = $model.project_summary(the_wall);
  $should.equal(_pipe$1, "the wall: a read-only window on the ledger");
  let _pipe$2 = $model.project_dir(docs);
  $should.equal(_pipe$2, "no directory");
  let _pipe$3 = $model.project_summary(docs);
  return $should.equal(_pipe$3, "no AGENTS.md summary yet");
}

export function project_count_line_teaches_the_command_when_empty_test() {
  let _pipe = $model.project_count_line($List$Empty$const);
  $should.equal(
    _pipe,
    "no projects yet — bind one with /project new <name> in a room",
  );
  let _pipe$1 = $model.project_count_line(
    $model.project_cards(sample_projects()),
  );
  return $should.equal(_pipe$1, "2 projects");
}

export function a_project_card_decodes_its_own_fields_test() {
  let json = "{\"v\":1,\"ok\":true,\"agents\":{\"named\":[{\"kind\":\"project\",\"name\":\"the-wall\",\"state\":\"working\",\"branch\":\"\",\"worktree\":null,\"last_reply\":null,\"room\":\"!r:jacks.im\",\"cwd\":\"/w/p\",\"summary\":\"s\",\"entries\":7}]}}";
  let $ = $decode.state(json);
  let state;
  if ($ instanceof Ok) {
    state = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      580,
      "a_project_card_decodes_its_own_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 20334,
        end: 20375,
        pattern_start: 20345,
        pattern_end: 20354
      }
    )
  }
  let $1 = $list.first(state.agents.named);
  let card;
  if ($1 instanceof Ok) {
    card = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      581,
      "a_project_card_decodes_its_own_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 20378,
        end: 20430,
        pattern_start: 20389,
        pattern_end: 20397
      }
    )
  }
  let _pipe = card.kind;
  $should.equal(_pipe, "project");
  let _pipe$1 = card.room;
  $should.equal(_pipe$1, new Some("!r:jacks.im"));
  let _pipe$2 = card.cwd;
  $should.equal(_pipe$2, new Some("/w/p"));
  let _pipe$3 = card.summary;
  $should.equal(_pipe$3, new Some("s"));
  let _pipe$4 = card.entries;
  $should.equal(_pipe$4, new Some(7));
  let _pipe$5 = card.worktree;
  $should.equal(_pipe$5, "");
  let _pipe$6 = card.last_reply;
  return $should.equal(_pipe$6, Option$None$const);
}

export function a_card_without_a_kind_is_a_subagent_test() {
  let json = "{\"v\":1,\"ok\":true,\"agents\":{\"named\":[{\"name\":\"reader\",\"state\":\"alive\"}]}}";
  let $ = $decode.state(json);
  let state;
  if ($ instanceof Ok) {
    state = $[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      595,
      "a_card_without_a_kind_is_a_subagent_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 21023,
        end: 21064,
        pattern_start: 21034,
        pattern_end: 21043
      }
    )
  }
  let $1 = $list.first(state.agents.named);
  let card;
  if ($1 instanceof Ok) {
    card = $1[0];
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      596,
      "a_card_without_a_kind_is_a_subagent_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 21067,
        end: 21119,
        pattern_start: 21078,
        pattern_end: 21086
      }
    )
  }
  let _pipe = card.kind;
  $should.equal(_pipe, "subagent");
  let _pipe$1 = $model.project_cards(state.agents);
  let _pipe$2 = $list.length(_pipe$1);
  return $should.equal(_pipe$2, 0);
}

function count_of(haystack, needle) {
  let _pipe = $string.split(haystack, needle);
  let _pipe$1 = $list.length(_pipe);
  return ((parts) => { return parts - 1; })(_pipe$1);
}

export function the_projects_tab_draws_a_row_per_project_test() {
  let _block;
  let _pipe = $view.view(projects_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = count_of(_pipe$1, "class=\"project\"");
  $should.equal(_pipe$2, 2);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "PROJECTS");
  $should.be_true(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = $string.contains(_pipe$5, "2 projects");
  $should.be_true(_pipe$6);
  let _pipe$7 = html;
  let _pipe$8 = $string.contains(_pipe$7, "the-wall");
  $should.be_true(_pipe$8);
  let _pipe$9 = html;
  let _pipe$10 = $string.contains(_pipe$9, "!ig3PmgqC-r…XpufmU");
  $should.be_true(_pipe$10);
  let _pipe$11 = html;
  let _pipe$12 = $string.contains(_pipe$11, "/work/projects/the-wall");
  $should.be_true(_pipe$12);
  let _pipe$13 = html;
  let _pipe$14 = $string.contains(_pipe$13, "1,832 entries");
  $should.be_true(_pipe$14);
  let _pipe$15 = html;
  let _pipe$16 = $string.contains(_pipe$15, "state-working");
  $should.be_true(_pipe$16);
  let _pipe$17 = html;
  let _pipe$18 = $string.contains(_pipe$17, "no directory");
  $should.be_true(_pipe$18);
  let _pipe$19 = html;
  let _pipe$20 = $string.contains(_pipe$19, "worktree-reader");
  $should.be_false(_pipe$20);
  let _pipe$21 = html;
  let _pipe$22 = $string.contains(_pipe$21, "VITALS");
  return $should.be_false(_pipe$22);
}

export function an_empty_projects_tab_teaches_the_command_test() {
  let _block;
  let _record = $model.initial($model.Mode$LiveMode$const);
  _block = new $model.Model(
    _record.mode,
    _record.vitals,
    _record.spend,
    new Some($model.empty_agents()),
    _record.queue,
    _record.samples,
    _record.polls,
    _record.error,
    $model.Tab$ProjectsTab$const,
    _record.filters,
    _record.logs,
    _record.browser,
  );
  let empty = _block;
  let _block$1;
  let _pipe = $view.view(empty);
  _block$1 = $element.to_string(_pipe);
  let html = _block$1;
  let _pipe$1 = html;
  let _pipe$2 = count_of(_pipe$1, "class=\"project\"");
  $should.equal(_pipe$2, 0);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "/project new");
  $should.be_true(_pipe$4);
  let _pipe$5 = html;
  let _pipe$6 = $string.contains(_pipe$5, "no projects yet");
  return $should.be_true(_pipe$6);
}

export function the_dashboard_agents_card_points_at_the_projects_tab_test() {
  let _block;
  let _pipe = $view.view(
    (() => {
      let _record = $model.initial($model.Mode$LiveMode$const);
      return new $model.Model(
        _record.mode,
        _record.vitals,
        _record.spend,
        new Some(sample_projects()),
        _record.queue,
        _record.samples,
        _record.polls,
        _record.error,
        _record.tab,
        _record.filters,
        _record.logs,
        _record.browser,
      );
    })(),
  );
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $string.contains(_pipe$1, "worktree-reader");
  $should.be_true(_pipe$2);
  let _pipe$3 = html;
  let _pipe$4 = $string.contains(_pipe$3, "2 project(s) — see the PROJECTS tab");
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
      826,
      "browser_model",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 29498,
        end: 29567,
        pattern_start: 29509,
        pattern_end: 29517
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
      833,
      "browser_model",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 29756,
        end: 29842,
        pattern_start: 29767,
        pattern_end: 29775
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
      854,
      "the_conversations_decoder_reads_the_rail_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 30272,
        end: 30341,
        pattern_start: 30283,
        pattern_end: 30291
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
      871,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 30885,
        end: 31048,
        pattern_start: 30896,
        pattern_end: 30904
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
      874,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 31051,
        end: 31081,
        pattern_start: 31062,
        pattern_end: 31068
      }
    )
  } else if ($1.tail instanceof $Empty) {
    item = $1.head;
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      874,
      "a_conversation_with_drifted_fields_decodes_as_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 31051,
        end: 31081,
        pattern_start: 31062,
        pattern_end: 31068
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
      885,
      "an_unreadable_conversations_body_is_an_error_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 31445,
        end: 31518,
        pattern_start: 31456,
        pattern_end: 31470
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
      888,
      "an_unreadable_conversations_body_is_an_error_not_a_crash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 31683,
        end: 31774,
        pattern_start: 31694,
        pattern_end: 31702
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
      895,
      "the_search_decoder_reads_the_jump_list_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 31954,
        end: 32018,
        pattern_start: 31965,
        pattern_end: 31973
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
      907,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 32368,
        end: 32497,
        pattern_start: 32379,
        pattern_end: 32387
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
      910,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 32500,
        end: 32528,
        pattern_start: 32511,
        pattern_end: 32516
      }
    )
  } else if ($1.tail instanceof $Empty) {
    hit = $1.head;
  } else {
    throw makeError(
      "let_assert",
      FILEPATH,
      "wall_test",
      910,
      "a_drifted_hit_still_renders_but_cannot_be_jumped_to_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 32500,
        end: 32528,
        pattern_start: 32511,
        pattern_end: 32516
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
      963,
      "a_hit_selects_its_conversation_and_opens_a_window_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 34852,
        end: 34941,
        pattern_start: 34863,
        pattern_end: 34871
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
      965,
      "a_hit_selects_its_conversation_and_opens_a_window_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $3,
        start: 35067,
        end: 35114,
        pattern_start: 35078,
        pattern_end: 35090
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
      992,
      "the_same_rows_render_in_the_logs_tab_without_dividers_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 36480,
        end: 36566,
        pattern_start: 36491,
        pattern_end: 36499
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
