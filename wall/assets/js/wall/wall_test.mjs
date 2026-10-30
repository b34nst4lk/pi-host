import * as $int from "../gleam_stdlib/gleam/int.mjs";
import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $option from "../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../gleam_stdlib/gleam/option.mjs";
import * as $string from "../gleam_stdlib/gleam/string.mjs";
import * as $gleeunit from "../gleeunit/gleeunit.mjs";
import * as $should from "../gleeunit/gleeunit/should.mjs";
import {
  Ok,
  Error,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  makeError,
} from "./gleam.mjs";
import * as $decode from "./wall/decode.mjs";
import * as $fake from "./wall/fake.mjs";
import * as $format from "./wall/format.mjs";
import * as $model from "./wall/model.mjs";

const FILEPATH = "test/wall_test.gleam";

export function main() {
  return $gleeunit.main();
}

export function format_count_test() {
  let _pipe = $format.format_count(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $format.format_count(new Some(0));
  $should.equal(_pipe$1, "0");
  let _pipe$2 = $format.format_count(new Some(842));
  $should.equal(_pipe$2, "842");
  let _pipe$3 = $format.format_count(new Some(1832));
  $should.equal(_pipe$3, "1,832");
  let _pipe$4 = $format.format_count(new Some(1_234_567));
  $should.equal(_pipe$4, "1.2M");
  let _pipe$5 = $format.format_count(new Some(12_400));
  $should.equal(_pipe$5, "12.4k");
  let _pipe$6 = $format.format_count(new Some(-4_200));
  return $should.equal(_pipe$6, "-4,200");
}

export function format_bytes_test() {
  let _pipe = $format.format_bytes(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $format.format_bytes(new Some(0));
  $should.equal(_pipe$1, "0 B");
  let _pipe$2 = $format.format_bytes(new Some(820));
  $should.equal(_pipe$2, "820 B");
  let _pipe$3 = $format.format_bytes(new Some(2048));
  $should.equal(_pipe$3, "2 KB");
  let _pipe$4 = $format.format_bytes(new Some(5_918_720));
  return $should.equal(_pipe$4, "5.6 MB");
}

export function format_age_test() {
  let _pipe = $format.format_age(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $format.format_age(new Some(7));
  $should.equal(_pipe$1, "7 s");
  let _pipe$2 = $format.format_age(new Some(600));
  $should.equal(_pipe$2, "10 min");
  let _pipe$3 = $format.format_age(new Some(3660));
  return $should.equal(_pipe$3, "1 h 01 m");
}

export function format_usd_test() {
  let _pipe = $format.format_usd(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $format.format_usd(new Some(0.0));
  $should.equal(_pipe$1, "$0.00");
  let _pipe$2 = $format.format_usd(new Some(1.5));
  $should.equal(_pipe$2, "$1.50");
  let _pipe$3 = $format.format_usd(new Some(12.345));
  return $should.equal(_pipe$3, "$12.35");
}

export function format_percent_test() {
  let _pipe = $format.format_percent(Option$None$const);
  $should.equal(_pipe, "—");
  let _pipe$1 = $format.format_percent(new Some(12.5));
  return $should.equal(_pipe$1, "13%");
}

export function budget_fraction_test() {
  let _pipe = $format.budget_fraction(new Some(5), new Some(10));
  $should.equal(_pipe, 0.5);
  let _pipe$1 = $format.budget_fraction(new Some(50), new Some(10));
  $should.equal(_pipe$1, 1.0);
  let _pipe$2 = $format.budget_fraction(new Some(1), new Some(0));
  $should.equal(_pipe$2, 0.0);
  let _pipe$3 = $format.budget_fraction(Option$None$const, new Some(10));
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
      123,
      "decodes_a_reader_state_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: result,
        start: 3982,
        end: 4011,
        pattern_start: 3993,
        pattern_end: 4002
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
      151,
      "decodes_a_reader_spend_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5157,
        end: 5212,
        pattern_start: 5168,
        pattern_end: 5177
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
      161,
      "tolerates_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5509,
        end: 5569,
        pattern_start: 5520,
        pattern_end: 5529
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
      171,
      "rejects_a_non_json_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5907,
        end: 5979,
        pattern_start: 5918,
        pattern_end: 5932
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
      177,
      "spend_without_money_is_unknown_not_zero_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 6193,
        end: 6280,
        pattern_start: 6204,
        pattern_end: 6213
      }
    )
  }
  let _pipe = spend.requests;
  $should.equal(_pipe, new Some(3));
  let _pipe$1 = spend.balance_usd;
  $should.equal(_pipe$1, Option$None$const);
  let _pipe$2 = $format.format_usd(spend.balance_usd);
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
      238,
      "decodes_all_seven_agent_states_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 8387,
        end: 8428,
        pattern_start: 8398,
        pattern_end: 8407
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
      255,
      "agent_without_state_is_unknown_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 8796,
        end: 8898,
        pattern_start: 8807,
        pattern_end: 8816
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
      293,
      "last_reply_renders_as_entry_or_dash_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 9983,
        end: 10038,
        pattern_start: 9994,
        pattern_end: 10003
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
