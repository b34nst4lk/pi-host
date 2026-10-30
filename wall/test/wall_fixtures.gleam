//// Builders shared by the tab tests: a logs page, a model showing it, and a
//// substring counter. Not a `_test` module, so `gleeunit` never runs it.

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import wall/logs
import wall/model

pub fn sample_logs() -> logs.Logs {
  logs.Logs(
    entries: [
      logs.LogEntry(
        id: 12,
        kind: "pi.assistant",
        at: Some("2026-10-29T14:30:58.000Z"),
        text: "answered: the wall is up",
        thread: Some("wall-ui"),
        spill: None,
        raw: "{\"kind\":\"pi.assistant\"}",
      ),
      logs.LogEntry(
        id: 11,
        kind: "pi.tool-result",
        at: None,
        text: "bash: full output (18 bytes)",
        thread: None,
        spill: Some("/opt/pi-host/storage/spill/full.log"),
        raw: "{}",
      ),
    ],
    next_before: Some(10),
    tailing: True,
    appending: False,
    spills: [#(11, "line one\nline two\n")],
    error: None,
  )
}

pub fn logs_model() -> model.Model {
  model.Model(
    ..model.initial(model.LiveMode),
    tab: logs.LogsTab,
    logs: Some(sample_logs()),
  )
}

pub fn count_of(haystack: String, needle: String) -> Int {
  string.split(haystack, needle) |> list.length |> fn(parts) { parts - 1 }
}
