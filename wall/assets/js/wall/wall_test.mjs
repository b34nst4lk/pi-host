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
import * as $model from "./wall/model.mjs";

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
      116,
      "decodes_a_reader_state_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: result,
        start: 3771,
        end: 3800,
        pattern_start: 3782,
        pattern_end: 3791
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
  let _pipe$4 = $list.length(state.fleet);
  $should.equal(_pipe$4, 2);
  let $ = $list.first(state.fleet);
  if ($ instanceof Ok) {
    let agent = $[0];
    let _pipe$5 = agent.name;
    $should.equal(_pipe$5, "reader");
    let _pipe$6 = agent.branch;
    $should.equal(_pipe$6, "worktree-reader");
    let _pipe$7 = agent.reports;
    return $should.equal(_pipe$7, 2);
  } else {
    return $should.fail();
  }
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
      133,
      "decodes_a_reader_spend_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 4325,
        end: 4380,
        pattern_start: 4336,
        pattern_end: 4345
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
      143,
      "tolerates_missing_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 4677,
        end: 4737,
        pattern_start: 4688,
        pattern_end: 4697
      }
    )
  }
  let _pipe = state.vitals.entries;
  $should.equal(_pipe, Option$None$const);
  let _pipe$1 = state.vitals.sync_state;
  $should.equal(_pipe$1, $model.Freshness$Unknown$const);
  let _pipe$2 = state.vitals.sync_age_s;
  $should.equal(_pipe$2, Option$None$const);
  let _pipe$3 = state.fleet;
  return $should.equal(_pipe$3, $List$Empty$const);
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
      151,
      "rejects_a_non_json_body_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 4967,
        end: 5039,
        pattern_start: 4978,
        pattern_end: 4992
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
      157,
      "spend_without_money_is_unknown_not_zero_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 5253,
        end: 5340,
        pattern_start: 5264,
        pattern_end: 5273
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
