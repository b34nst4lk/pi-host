import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $option from "../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../gleam_stdlib/gleam/option.mjs";
import * as $string from "../gleam_stdlib/gleam/string.mjs";
import * as $should from "../gleeunit/gleeunit/should.mjs";
import * as $element from "../lustre/lustre/element.mjs";
import {
  Ok,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  makeError,
} from "./gleam.mjs";
import * as $decode from "./wall/decode.mjs";
import * as $logs from "./wall/logs.mjs";
import * as $model from "./wall/model.mjs";
import * as $pretty from "./wall/pretty.mjs";
import * as $view from "./wall/view.mjs";
import * as $wall_fixtures from "./wall_fixtures.mjs";

const FILEPATH = "test/projects_view_test.gleam";

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
    $logs.Tab$ProjectsTab$const,
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
      "projects_view_test",
      87,
      "project_line_names_the_room_and_the_history_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 2522,
        end: 2581,
        pattern_start: 2533,
        pattern_end: 2549
      }
    )
  } else {
    let $1 = $.tail;
    if ($1 instanceof $Empty) {
      throw makeError(
        "let_assert",
        FILEPATH,
        "projects_view_test",
        87,
        "project_line_names_the_room_and_the_history_test",
        "Pattern match failed, no pattern matched the value.",
        {
          value: $,
          start: 2522,
          end: 2581,
          pattern_start: 2533,
          pattern_end: 2549
        }
      )
    } else if ($1.tail instanceof $Empty) {
      the_wall = $.head;
      docs = $1.head;
    } else {
      throw makeError(
        "let_assert",
        FILEPATH,
        "projects_view_test",
        87,
        "project_line_names_the_room_and_the_history_test",
        "Pattern match failed, no pattern matched the value.",
        {
          value: $,
          start: 2522,
          end: 2581,
          pattern_start: 2533,
          pattern_end: 2549
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
      "projects_view_test",
      95,
      "project_fallbacks_never_invent_a_directory_or_a_summary_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 2920,
        end: 2988,
        pattern_start: 2931,
        pattern_end: 2947
      }
    )
  } else {
    let $1 = $.tail;
    if ($1 instanceof $Empty) {
      throw makeError(
        "let_assert",
        FILEPATH,
        "projects_view_test",
        95,
        "project_fallbacks_never_invent_a_directory_or_a_summary_test",
        "Pattern match failed, no pattern matched the value.",
        {
          value: $,
          start: 2920,
          end: 2988,
          pattern_start: 2931,
          pattern_end: 2947
        }
      )
    } else if ($1.tail instanceof $Empty) {
      the_wall = $.head;
      docs = $1.head;
    } else {
      throw makeError(
        "let_assert",
        FILEPATH,
        "projects_view_test",
        95,
        "project_fallbacks_never_invent_a_directory_or_a_summary_test",
        "Pattern match failed, no pattern matched the value.",
        {
          value: $,
          start: 2920,
          end: 2988,
          pattern_start: 2931,
          pattern_end: 2947
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
      "projects_view_test",
      114,
      "a_project_card_decodes_its_own_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 3962,
        end: 4003,
        pattern_start: 3973,
        pattern_end: 3982
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
      "projects_view_test",
      115,
      "a_project_card_decodes_its_own_fields_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 4006,
        end: 4058,
        pattern_start: 4017,
        pattern_end: 4025
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
      "projects_view_test",
      129,
      "a_card_without_a_kind_is_a_subagent_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $,
        start: 4651,
        end: 4692,
        pattern_start: 4662,
        pattern_end: 4671
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
      "projects_view_test",
      130,
      "a_card_without_a_kind_is_a_subagent_test",
      "Pattern match failed, no pattern matched the value.",
      {
        value: $1,
        start: 4695,
        end: 4747,
        pattern_start: 4706,
        pattern_end: 4714
      }
    )
  }
  let _pipe = card.kind;
  $should.equal(_pipe, "subagent");
  let _pipe$1 = $model.project_cards(state.agents);
  let _pipe$2 = $list.length(_pipe$1);
  return $should.equal(_pipe$2, 0);
}

export function the_projects_tab_draws_a_row_per_project_test() {
  let _block;
  let _pipe = $view.view(projects_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $wall_fixtures.count_of(_pipe$1, "class=\"project\"");
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
    $logs.Tab$ProjectsTab$const,
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
  let _pipe$2 = $wall_fixtures.count_of(_pipe$1, "class=\"project\"");
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
  let _pipe = $view.view($wall_fixtures.logs_model());
  _block = $element.to_string(_pipe);
  let html = _block;
  let _pipe$1 = html;
  let _pipe$2 = $string.contains(
    _pipe$1,
    "{\n  &quot;kind&quot;: &quot;pi.assistant&quot;\n}",
  );
  return $should.be_true(_pipe$2);
}
