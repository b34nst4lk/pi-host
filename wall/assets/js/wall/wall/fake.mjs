import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
} from "../gleam.mjs";
import * as $model from "../wall/model.mjs";

function card(name, state, branch, worktree, last_reply) {
  return ((((((((("{\"name\":\"" + name) + "\",\"state\":\"") + state) + "\",\"branch\":\"") + branch) + "\",\"worktree\":\"") + worktree) + "\",\"last_reply\":") + $int.to_string(
    last_reply,
  )) + ",\"conversation\":15,\"anchor\":16}";
}

function agent(name, branch, reports) {
  return ((((((("{\"name\":\"" + name) + "\",\"branch\":\"") + branch) + "\",\"worktree\":\"/opt/pi-host/worktrees/") + name) + "\",\"conversation_id\":15,\"reports\":") + $int.to_string(
    reports,
  )) + ",\"last_report_entry\":51,\"state\":\"reported\"}";
}

/**
 * A plausible `/api/state` body; `poll` makes the numbers move a little, so the
 * sparklines have something to draw.
 */
export function state_json(poll) {
  let entries = 1810 + poll * 3;
  let _block;
  let $ = poll % 7;
  if ($ === 0) {
    _block = 4;
  } else if ($ === 1) {
    _block = 9;
  } else {
    _block = 7;
  }
  let age = _block;
  let _block$1;
  let $1 = poll % 11;
  if ($1 === 0) {
    _block$1 = 3;
  } else {
    _block$1 = 2;
  }
  let errors = _block$1;
  return ((((((((((((((((((((((((((((((((((((((((((((((((("{\"v\":1,\"ok\":true," + "\"vitals\":{") + "\"ledger\":{\"ok\":true,\"error\":null,\"path\":\"storage/session.sqlite\",\"bytes\":") + $int.to_string(
    5918720 + poll * 4096,
  )) + ",\"wal_bytes\":4161232,\"entries\":") + $int.to_string(entries)) + ",\"tasks_live\":1,\"submissions_live\":0},") + "\"sync\":{\"ok\":true,\"error\":null,\"batch\":\"s114_0_1_2_3_4_5\",\"seq\":") + $int.to_string(
    41 + poll,
  )) + ",\"updated_at\":\"2026-10-29T14:30:55.000Z\",\"age_s\":") + $int.to_string(
    age,
  )) + ",\"state\":\"live\"},") + "\"daemon\":{\"ok\":true,\"error\":null,\"log_path\":\"storage/daemon.log\",\"log_bytes\":1974,") + "\"log_updated_at\":\"2026-10-29T03:35:00.000Z\",\"uptime_s\":86400,\"errors_24h\":") + $int.to_string(
    errors,
  )) + ",\"last_error_at\":\"2026-10-29T09:12:00.000Z\",") + "\"last_error\":\"join attempt failed (will rely on sync retries): connect ECONNREFUSED\"},") + "\"container\":{\"ok\":true,\"error\":null,\"uptime_s\":") + $int.to_string(
    86000 + poll * 10,
  )) + ",\"source\":\"/proc/1\"}},") + "\"queue\":{\"ok\":true,\"error\":null,\"inbox_depth\":") + $int.to_string(
    poll % 3,
  )) + ",\"tasks\":{\"pending\":1,\"running\":") + $int.to_string(
    (poll % 2) + 1,
  )) + ",\"waiting\":0,\"completing\":0,\"terminal\":812},") + "\"submissions\":{\"queued\":0,\"placed\":1,\"done\":640,\"unanswered\":3},") + "\"background_live\":1,\"errors\":[") + "{\"at\":\"2026-10-29T09:12:00.000Z\",\"status\":\"unanswered\",\"request_id\":\"matrix:$abc\",\"conversation_id\":1},") + "{\"at\":\"2026-10-29T08:47:12.000Z\",\"status\":\"unanswered\",\"request_id\":\"matrix:$def\",\"conversation_id\":1}") + "]},") + "\"fleet\":{\"ok\":true,\"error\":null,\"agents\":[") + agent(
    "reader",
    "worktree-reader",
    2,
  )) + ",") + agent("wall-ui", "worktree-wall-ui", 1)) + "]},") + "\"agents\":{\"ok\":true,\"error\":null,") + "\"spike\":{\"state\":\"working\",\"conversation\":1},") + "\"named\":[") + card(
    "reader",
    "working",
    "worktree-reader",
    "/opt/pi-host/workspace/worktrees/reader",
    2393,
  )) + ",") + card(
    "wall-ui",
    "reporting",
    "worktree-wall-ui",
    "/opt/pi-host/workspace/worktrees/wall-ui",
    2409,
  )) + ",") + card(
    "docs",
    "alive",
    "worktree-docs",
    "/opt/pi-host/workspace/worktrees/docs",
    2181,
  )) + "],") + "\"orphans\":[{\"anchor\":2201,\"conversation\":2202}],") + "\"retired\":2,") + "\"work\":{\"in_flight\":") + $int.to_string(
    (poll % 3) + 3,
  )) + ",\"queued\":") + $int.to_string(poll % 2)) + "}}}";
}

/**
 * A plausible `/api/spend` body.
 */
export function spend_json(poll) {
  let requests = 126 + (poll % 5);
  return ((((((((((((("{\"v\":1,\"ok\":true,\"generated_at\":\"2026-10-29T14:31:02.512Z\"," + "\"fetched_at\":\"2026-10-29T14:30:58.000Z\",\"age_s\":") + $int.to_string(
    4 + (poll % 9),
  )) + ",\"cached\":true,\"stale\":false,\"error\":null,") + "\"limits\":{\"window_s\":60,\"max_per_minute\":10,\"used_in_window\":") + $int.to_string(
    poll % 4,
  )) + "},") + "\"usage\":{\"range\":\"24h\",\"requests\":") + $int.to_string(
    requests,
  )) + ",\"input_tokens\":1234567,\"output_tokens\":") + $int.to_string(
    98765 + poll * 120,
  )) + ",\"raw\":{}},") + "\"balance\":{\"balance_usd\":0,\"purchased_usd\":0,\"percent_used\":") + $string.concat(
    listPrepend($int.to_string(12), listPrepend(".5", $List$Empty$const)),
  )) + ",\"currency\":\"USD\",\"raw\":{}}}";
}

/**
 * JSON-escape a value that goes *inside* a fixture string.
 * 
 * @ignore
 */
function escape(value) {
  let _pipe = value;
  let _pipe$1 = $string.replace(_pipe, "\\", "\\\\");
  let _pipe$2 = $string.replace(_pipe$1, "\"", "\\\"");
  return $string.replace(_pipe$2, "\n", "\\n");
}

function pad2(value) {
  let $ = value < 10;
  if ($) {
    return "0" + $int.to_string(value);
  } else {
    return $int.to_string(value);
  }
}

/**
 * `#(id, kind, text, thread, spill)` → one row of the page.
 * 
 * @ignore
 */
function entry(row) {
  let id = row[0];
  let kind = row[1];
  let text = row[2];
  let thread = row[3];
  let spill = row[4];
  return (((((((((((("{\"id\":" + $int.to_string(id)) + ",\"kind\":\"") + kind) + "\",\"at\":\"2026-10-29T14:30:") + pad2(
    id % 60,
  )) + ".000Z\",\"text\":\"") + text) + "\"") + (() => {
    if (thread instanceof $option.Some) {
      let name = thread[0];
      return (",\"thread\":\"" + name) + "\"";
    } else {
      return "";
    }
  })()) + (() => {
    if (spill instanceof $option.Some) {
      let path = spill[0];
      return (",\"spill\":\"" + path) + "\"";
    } else {
      return "";
    }
  })()) + ",\"raw\":\"") + escape(
    ((("{\"kind\":\"" + kind) + "\",\"id\":") + $int.to_string(id)) + "}",
  )) + "\"}";
}

function text_matches(query, text) {
  let $ = $string.trim(query);
  if ($ === "") {
    return true;
  } else {
    let query$1 = $;
    return $string.contains($string.lowercase(text), $string.lowercase(query$1));
  }
}

function kind_selected(kinds, kind) {
  if (kinds instanceof $Empty) {
    return true;
  } else {
    return $list.any(
      kinds,
      (pattern) => {
        if (pattern === "app.*") {
          return $string.starts_with(kind, "app.");
        } else {
          return pattern === kind;
        }
      },
    );
  }
}

/**
 * A plausible `/api/logs` page: every kind the reader can send, one row with a
 * spill path and one with a thread, all newest-first. `poll` bumps the ids so
 * the live tail visibly moves; the filters are applied here too, so the chips
 * and the search box do something in fake mode instead of looking broken.
 */
export function logs_json(filters, poll) {
  let base = 3610 + poll;
  let rows = listPrepend(
    [
      base,
      "pi.assistant",
      "answered: the wall is up",
      Option$None$const,
      Option$None$const,
    ],
    listPrepend(
      [
        base - 1,
        "pi.tool-result",
        "bash: full output (18 bytes)",
        Option$None$const,
        new Some("/opt/pi-host/storage/spill/full.log"),
      ],
      listPrepend(
        [
          base - 2,
          "pi.user",
          "steer: show me the last twenty entries",
          Option$None$const,
          Option$None$const,
        ],
        listPrepend(
          [
            base - 3,
            "pi.compaction",
            "compaction: 41 entries summarised",
            Option$None$const,
            Option$None$const,
          ],
          listPrepend(
            [
              base - 4,
              "pi.system",
              "system: preamble + 12 tools",
              Option$None$const,
              Option$None$const,
            ],
            listPrepend(
              [
                base - 5,
                "app.subagents",
                "spawn wall-ui",
                new Some("wall-ui"),
                Option$None$const,
              ],
              $List$Empty$const,
            ),
          ),
        ),
      ),
    ),
  );
  let kinds = $model.effective_kinds(filters);
  let kept = $list.filter(
    rows,
    (row) => {
      return kind_selected(kinds, row[1]) && text_matches(filters.query, row[2]);
    },
  );
  return ((("{\"v\":1,\"ok\":true,\"entries\":[" + $string.join(
    $list.map(kept, entry),
    ",",
  )) + "]") + (() => {
    let $ = $list.is_empty(kept);
    if ($) {
      return "";
    } else {
      return ",\"next_before\":" + $int.to_string(base - 6);
    }
  })()) + "}";
}

/**
 * A plausible `/api/spill` body.
 */
export function spill_json() {
  return (("{\"v\":1,\"ok\":true,\"path\":\"/opt/pi-host/storage/spill/full.log\",\"bytes\":18," + "\"truncated\":false,\"text\":\"") + escape(
    "line one\nline two\n",
  )) + "\"}";
}

function space(id, kind, title, state, entries, first_at, last_at) {
  return ((((((((((((("{\"id\":" + $int.to_string(id)) + ",\"kind\":\"") + kind) + "\",\"title\":\"") + title) + "\",\"state\":\"") + state) + "\",\"entries\":") + $int.to_string(
    entries,
  )) + ",\"first_at\":\"") + first_at) + "\",\"last_at\":\"") + last_at) + "\"}";
}

/**
 * A plausible `/api/conversations` body: the main space with two compaction
 * boundaries in its stream, and two named children — the demo the browser tab
 * exists for, with no reader running.
 */
export function conversations_json() {
  return ((((((("{\"v\":1,\"ok\":true,\"generated_at\":\"2026-10-29T14:31:02.512Z\",\"conversations\":[" + space(
    1,
    "main",
    "main",
    "working",
    2051,
    "2026-10-27T09:12:00.000Z",
    "2026-10-29T14:30:55.000Z",
  )) + ",") + space(
    2166,
    "child",
    "reader",
    "working",
    3,
    "2026-10-29T13:02:00.000Z",
    "2026-10-29T14:29:11.000Z",
  )) + ",") + space(
    2402,
    "child",
    "wall-ui",
    "reporting",
    1,
    "2026-10-29T14:11:00.000Z",
    "2026-10-29T14:12:30.000Z",
  )) + ",") + space(
    2775,
    "child",
    "conversation 2775",
    "unknown",
    1,
    "2026-10-29T14:20:00.000Z",
    "2026-10-29T14:20:40.000Z",
  )) + "]}";
}

/**
 * A plausible `/api/logs?conversation=N` page. The main space carries two
 * `pi.compaction` rows so the dividers are visible in fake mode; the children
 * carry their own small streams. Any other id gets an empty page, which is what
 * an unknown space would show.
 */
export function browser_logs_json(conversation, filters, poll) {
  let base = 4110 + poll;
  let _block;
  if (conversation === 1) {
    _block = listPrepend(
      [
        base,
        "pi.assistant",
        "the browser tab is up",
        Option$None$const,
        Option$None$const,
      ],
      listPrepend(
        [
          base - 1,
          "pi.user",
          "steer: build the activity browser",
          Option$None$const,
          Option$None$const,
        ],
        listPrepend(
          [
            base - 2,
            "pi.compaction",
            "compaction: rounds one to three summarised",
            Option$None$const,
            Option$None$const,
          ],
          listPrepend(
            [
              base - 3,
              "pi.tool-result",
              "bash: full output (18 bytes)",
              Option$None$const,
              new Some("/opt/pi-host/storage/spill/full.log"),
            ],
            listPrepend(
              [
                base - 4,
                "pi.user",
                "steer: the wall needs a browser",
                Option$None$const,
                Option$None$const,
              ],
              listPrepend(
                [
                  base - 5,
                  "pi.compaction",
                  "compaction: the earlier rounds summarised again",
                  Option$None$const,
                  Option$None$const,
                ],
                listPrepend(
                  [
                    base - 6,
                    "pi.system",
                    "system: preamble + 12 tools",
                    Option$None$const,
                    Option$None$const,
                  ],
                  $List$Empty$const,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  } else if (conversation === 2166) {
    _block = listPrepend(
      [
        base,
        "pi.assistant",
        "child: the ledger looks fine",
        new Some("reader"),
        Option$None$const,
      ],
      listPrepend(
        [
          base - 1,
          "pi.user",
          "child: check the ledger",
          new Some("reader"),
          Option$None$const,
        ],
        listPrepend(
          [
            base - 2,
            "pi.user",
            "spawn reader",
            Option$None$const,
            Option$None$const,
          ],
          $List$Empty$const,
        ),
      ),
    );
  } else if (conversation === 2402) {
    _block = listPrepend(
      [
        base,
        "pi.assistant",
        "child: the browser tab renders",
        new Some("wall-ui"),
        Option$None$const,
      ],
      $List$Empty$const,
    );
  } else {
    _block = $List$Empty$const;
  }
  let rows = _block;
  let kinds = $model.effective_kinds(filters);
  let kept = $list.filter(
    rows,
    (row) => {
      return kind_selected(kinds, row[1]) && text_matches(filters.query, row[2]);
    },
  );
  return ((("{\"v\":1,\"ok\":true,\"entries\":[" + $string.join(
    $list.map(kept, entry),
    ",",
  )) + "]") + (() => {
    let $ = $list.is_empty(kept);
    if ($) {
      return "";
    } else {
      return ",\"next_before\":" + $int.to_string(base - 7);
    }
  })()) + "}";
}

function hit(row) {
  let id = row[0];
  let conversation = row[1];
  let title = row[2];
  let kind = row[3];
  let text = row[4];
  return ((((((((((("{\"conversation_id\":" + $int.to_string(conversation)) + ",\"conversation_title\":\"") + title) + "\",\"entry_id\":") + $int.to_string(
    id,
  )) + ",\"kind\":\"") + kind) + "\",\"at\":\"2026-10-29T14:30:") + pad2(
    id % 60,
  )) + ".000Z\",\"text\":\"") + text) + "\"}";
}

/**
 * A plausible `/api/search` body: hits across three spaces, so the jump list has
 * somewhere to jump to without a reader running.
 */
export function search_json(query) {
  let $ = $string.trim(query);
  if ($ === "") {
    return "{\"v\":1,\"ok\":false,\"error\":\"q is required\",\"hits\":[]}";
  } else {
    let asked = $;
    let corpus = listPrepend(
      [4112, 1, "main", "pi.assistant", "the browser tab is up"],
      listPrepend(
        [4110, 1, "main", "pi.user", "steer: build the activity browser"],
        listPrepend(
          [4110, 2166, "reader", "pi.assistant", "child: the ledger looks fine"],
          listPrepend(
            [4109, 2166, "reader", "pi.user", "child: check the ledger"],
            listPrepend(
              [
                4110,
                2402,
                "wall-ui",
                "pi.assistant",
                "child: the browser tab renders",
              ],
              $List$Empty$const,
            ),
          ),
        ),
      ),
    );
    let hits = $list.filter(
      corpus,
      (hit) => {
        return $string.contains(
          $string.lowercase(hit[4]),
          $string.lowercase(asked),
        );
      },
    );
    return ((("{\"v\":1,\"ok\":true,\"q\":\"" + escape(asked)) + "\",\"limit\":25,\"hits\":[") + $string.join(
      $list.map(hits, hit),
      ",",
    )) + "]}";
  }
}
