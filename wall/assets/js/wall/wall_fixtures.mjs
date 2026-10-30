import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $option from "../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../gleam_stdlib/gleam/option.mjs";
import * as $string from "../gleam_stdlib/gleam/string.mjs";
import { List$Empty$const as $List$Empty$const, prepend as listPrepend } from "./gleam.mjs";
import * as $logs from "./wall/logs.mjs";
import * as $model from "./wall/model.mjs";

export function sample_logs() {
  return new $logs.Logs(
    listPrepend(
      new $logs.LogEntry(
        12,
        "pi.assistant",
        new Some("2026-10-29T14:30:58.000Z"),
        "answered: the wall is up",
        new Some("wall-ui"),
        Option$None$const,
        "{\"kind\":\"pi.assistant\"}",
      ),
      listPrepend(
        new $logs.LogEntry(
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

export function logs_model() {
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
    new Some(sample_logs()),
    _record.browser,
  );
}

export function count_of(haystack, needle) {
  let _pipe = $string.split(haystack, needle);
  let _pipe$1 = $list.length(_pipe);
  return ((parts) => { return parts - 1; })(_pipe$1);
}
