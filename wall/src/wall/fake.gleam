//// Built-in fixtures: the wall with no reader behind it (`?fake=1`).
////
//// They are JSON *text*, exactly like the reader's responses, so the fake mode
//// exercises the real decoders instead of a second, parallel code path. Opening
//// `index.html?fake=1` therefore proves the whole model/update/view chain works
//// before the reader exists.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import wall/model

/// A plausible `/api/state` body; `poll` makes the numbers move a little, so the
/// sparklines have something to draw.
pub fn state_json(poll: Int) -> String {
  let entries = 1810 + poll * 3
  let age = case poll % 7 {
    0 -> 4
    1 -> 9
    _ -> 7
  }
  let errors = case poll % 11 {
    0 -> 3
    _ -> 2
  }
  "{\"v\":1,\"ok\":true,"
  <> "\"vitals\":{"
  <> "\"ledger\":{\"ok\":true,\"error\":null,\"path\":\"storage/session.sqlite\",\"bytes\":"
  <> int.to_string(5918720 + poll * 4096)
  <> ",\"wal_bytes\":4161232,\"entries\":"
  <> int.to_string(entries)
  <> ",\"tasks_live\":1,\"submissions_live\":0},"
  <> "\"sync\":{\"ok\":true,\"error\":null,\"batch\":\"s114_0_1_2_3_4_5\",\"seq\":"
  <> int.to_string(41 + poll)
  <> ",\"updated_at\":\"2026-10-29T14:30:55.000Z\",\"age_s\":"
  <> int.to_string(age)
  <> ",\"state\":\"live\"},"
  <> "\"daemon\":{\"ok\":true,\"error\":null,\"log_path\":\"storage/daemon.log\",\"log_bytes\":1974,"
  <> "\"log_updated_at\":\"2026-10-29T03:35:00.000Z\",\"uptime_s\":86400,\"errors_24h\":"
  <> int.to_string(errors)
  <> ",\"last_error_at\":\"2026-10-29T09:12:00.000Z\","
  <> "\"last_error\":\"join attempt failed (will rely on sync retries): connect ECONNREFUSED\"},"
  <> "\"container\":{\"ok\":true,\"error\":null,\"uptime_s\":"
  <> int.to_string(86000 + poll * 10)
  <> ",\"source\":\"/proc/1\"}},"
  <> "\"queue\":{\"ok\":true,\"error\":null,\"inbox_depth\":"
  <> int.to_string(poll % 3)
  <> ",\"tasks\":{\"pending\":1,\"running\":"
  <> int.to_string(poll % 2 + 1)
  <> ",\"waiting\":0,\"completing\":0,\"terminal\":812},"
  <> "\"submissions\":{\"queued\":0,\"placed\":1,\"done\":640,\"unanswered\":3},"
  <> "\"background_live\":1,\"errors\":["
  <> "{\"at\":\"2026-10-29T09:12:00.000Z\",\"status\":\"unanswered\",\"request_id\":\"matrix:$abc\",\"conversation_id\":1},"
  <> "{\"at\":\"2026-10-29T08:47:12.000Z\",\"status\":\"unanswered\",\"request_id\":\"matrix:$def\",\"conversation_id\":1}"
  <> "]},"
  <> "\"fleet\":{\"ok\":true,\"error\":null,\"agents\":["
  <> agent("reader", "worktree-reader", 2)
  <> ","
  <> agent("wall-ui", "worktree-wall-ui", 1)
  <> "]},"
  // The agent-state cards: spike, three named agents in three different states,
  // one orphan, and the run counter that replaced "tasks running".
  <> "\"agents\":{\"ok\":true,\"error\":null,"
  <> "\"spike\":{\"state\":\"working\",\"conversation\":1},"
  <> "\"named\":["
  <> card("reader", "working", "worktree-reader", "/opt/pi-host/workspace/worktrees/reader", 2393)
  <> ","
  <> card("wall-ui", "reporting", "worktree-wall-ui", "/opt/pi-host/workspace/worktrees/wall-ui", 2409)
  <> ","
  <> card("docs", "alive", "worktree-docs", "/opt/pi-host/workspace/worktrees/docs", 2181)
  <> "],"
  <> "\"orphans\":[{\"anchor\":2201,\"conversation\":2202}],"
  <> "\"retired\":2,"
  <> "\"work\":{\"in_flight\":"
  <> int.to_string(poll % 3 + 3)
  <> ",\"queued\":"
  <> int.to_string(poll % 2)
  <> "}}}"
}

fn card(
  name: String,
  state: String,
  branch: String,
  worktree: String,
  last_reply: Int,
) -> String {
  "{\"name\":\""
  <> name
  <> "\",\"state\":\""
  <> state
  <> "\",\"branch\":\""
  <> branch
  <> "\",\"worktree\":\""
  <> worktree
  <> "\",\"last_reply\":"
  <> int.to_string(last_reply)
  <> ",\"conversation\":15,\"anchor\":16}"
}

fn agent(name: String, branch: String, reports: Int) -> String {
  "{\"name\":\""
  <> name
  <> "\",\"branch\":\""
  <> branch
  <> "\",\"worktree\":\"/opt/pi-host/worktrees/"
  <> name
  <> "\",\"conversation_id\":15,\"reports\":"
  <> int.to_string(reports)
  <> ",\"last_report_entry\":51,\"state\":\"reported\"}"
}

/// A plausible `/api/spend` body.
pub fn spend_json(poll: Int) -> String {
  let requests = 126 + poll % 5
  "{\"v\":1,\"ok\":true,\"generated_at\":\"2026-10-29T14:31:02.512Z\","
  <> "\"fetched_at\":\"2026-10-29T14:30:58.000Z\",\"age_s\":"
  <> int.to_string(4 + poll % 9)
  <> ",\"cached\":true,\"stale\":false,\"error\":null,"
  <> "\"limits\":{\"window_s\":60,\"max_per_minute\":10,\"used_in_window\":"
  <> int.to_string(poll % 4)
  <> "},"
  <> "\"usage\":{\"range\":\"24h\",\"requests\":"
  <> int.to_string(requests)
  <> ",\"input_tokens\":1234567,\"output_tokens\":"
  <> int.to_string(98765 + poll * 120)
  <> ",\"raw\":{}},"
  <> "\"balance\":{\"balance_usd\":0,\"purchased_usd\":0,\"percent_used\":"
  <> string.concat([int.to_string(12), ".5"])
  <> ",\"currency\":\"USD\",\"raw\":{}}}"
}

// --- the logs tab ---------------------------------------------------------

/// A plausible `/api/logs` page: every kind the reader can send, one row with a
/// spill path and one with a thread, all newest-first. `poll` bumps the ids so
/// the live tail visibly moves; the filters are applied here too, so the chips
/// and the search box do something in fake mode instead of looking broken.
pub fn logs_json(filters: model.LogFilters, poll: Int) -> String {
  let base = 3610 + poll
  let rows = [
    #(base, "pi.assistant", "answered: the wall is up", None, None),
    #(
      base - 1,
      "pi.tool-result",
      "bash: full output (18 bytes)",
      None,
      Some("/opt/pi-host/storage/spill/full.log"),
    ),
    #(base - 2, "pi.user", "steer: show me the last twenty entries", None, None),
    #(base - 3, "pi.compaction", "compaction: 41 entries summarised", None, None),
    #(base - 4, "pi.system", "system: preamble + 12 tools", None, None),
    #(base - 5, "app.subagents", "spawn wall-ui", Some("wall-ui"), None),
  ]
  let kinds = model.effective_kinds(filters)
  let kept =
    list.filter(rows, fn(row) {
      kind_selected(kinds, row.1) && text_matches(filters.query, row.2)
    })
  "{\"v\":1,\"ok\":true,\"entries\":["
  <> string.join(list.map(kept, entry), ",")
  <> "]"
  <> case list.is_empty(kept) {
    True -> ""
    False -> ",\"next_before\":" <> int.to_string(base - 6)
  }
  <> "}"
}

fn kind_selected(kinds: List(String), kind: String) -> Bool {
  case kinds {
    [] -> True
    _ ->
      list.any(kinds, fn(pattern) {
        case pattern {
          "app.*" -> string.starts_with(kind, "app.")
          _ -> pattern == kind
        }
      })
  }
}

fn text_matches(query: String, text: String) -> Bool {
  case string.trim(query) {
    "" -> True
    query -> string.contains(string.lowercase(text), string.lowercase(query))
  }
}

/// `#(id, kind, text, thread, spill)` → one row of the page.
fn entry(row: #(Int, String, String, Option(String), Option(String))) -> String {
  let #(id, kind, text, thread, spill) = row
  "{\"id\":"
  <> int.to_string(id)
  <> ",\"kind\":\""
  <> kind
  <> "\",\"at\":\"2026-10-29T14:30:"
  <> pad2(id % 60)
  <> ".000Z\",\"text\":\""
  <> text
  <> "\""
  <> case thread {
    option.Some(name) -> ",\"thread\":\"" <> name <> "\""
    option.None -> ""
  }
  <> case spill {
    option.Some(path) -> ",\"spill\":\"" <> path <> "\""
    option.None -> ""
  }
  <> ",\"raw\":\""
  <> escape("{\"kind\":\"" <> kind <> "\",\"id\":" <> int.to_string(id) <> "}")
  <> "\"}"
}

/// A plausible `/api/spill` body.
pub fn spill_json() -> String {
  "{\"v\":1,\"ok\":true,\"path\":\"/opt/pi-host/storage/spill/full.log\",\"bytes\":18,"
  <> "\"truncated\":false,\"text\":\""
  <> escape("line one\nline two\n")
  <> "\"}"
}

fn pad2(value: Int) -> String {
  case value < 10 {
    True -> "0" <> int.to_string(value)
    False -> int.to_string(value)
  }
}

/// JSON-escape a value that goes *inside* a fixture string.
fn escape(value: String) -> String {
  value
  |> string.replace("\\", "\\\\")
  |> string.replace("\"", "\\\"")
  |> string.replace("\n", "\\n")
}
