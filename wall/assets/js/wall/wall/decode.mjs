import * as $json from "../../gleam_json/gleam/json.mjs";
import * as $decode from "../../gleam_stdlib/gleam/dynamic/decode.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  Ok,
  Error,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
} from "../gleam.mjs";
import * as $model from "../wall/model.mjs";

export class State extends $CustomType {
  constructor(vitals, queue, agents) {
    super();
    this.vitals = vitals;
    this.queue = queue;
    this.agents = agents;
  }
}
export const State$State = (vitals, queue, agents) =>
  new State(vitals, queue, agents);
export const State$isState = (value) => value instanceof State;
export const State$State$vitals = (value) => value.vitals;
export const State$State$0 = (value) => value.vitals;
export const State$State$queue = (value) => value.queue;
export const State$State$1 = (value) => value.queue;
export const State$State$agents = (value) => value.agents;
export const State$State$2 = (value) => value.agents;

export class LogsPage extends $CustomType {
  constructor(ok, error, entries, next_before) {
    super();
    this.ok = ok;
    this.error = error;
    this.entries = entries;
    this.next_before = next_before;
  }
}
export const LogsPage$LogsPage = (ok, error, entries, next_before) =>
  new LogsPage(ok, error, entries, next_before);
export const LogsPage$isLogsPage = (value) => value instanceof LogsPage;
export const LogsPage$LogsPage$ok = (value) => value.ok;
export const LogsPage$LogsPage$0 = (value) => value.ok;
export const LogsPage$LogsPage$error = (value) => value.error;
export const LogsPage$LogsPage$1 = (value) => value.error;
export const LogsPage$LogsPage$entries = (value) => value.entries;
export const LogsPage$LogsPage$2 = (value) => value.entries;
export const LogsPage$LogsPage$next_before = (value) => value.next_before;
export const LogsPage$LogsPage$3 = (value) => value.next_before;

export class ConversationsPage extends $CustomType {
  constructor(ok, error, items) {
    super();
    this.ok = ok;
    this.error = error;
    this.items = items;
  }
}
export const ConversationsPage$ConversationsPage = (ok, error, items) =>
  new ConversationsPage(ok, error, items);
export const ConversationsPage$isConversationsPage = (value) =>
  value instanceof ConversationsPage;
export const ConversationsPage$ConversationsPage$ok = (value) => value.ok;
export const ConversationsPage$ConversationsPage$0 = (value) => value.ok;
export const ConversationsPage$ConversationsPage$error = (value) => value.error;
export const ConversationsPage$ConversationsPage$1 = (value) => value.error;
export const ConversationsPage$ConversationsPage$items = (value) => value.items;
export const ConversationsPage$ConversationsPage$2 = (value) => value.items;

export class SearchPage extends $CustomType {
  constructor(ok, error, q, limit, hits) {
    super();
    this.ok = ok;
    this.error = error;
    this.q = q;
    this.limit = limit;
    this.hits = hits;
  }
}
export const SearchPage$SearchPage = (ok, error, q, limit, hits) =>
  new SearchPage(ok, error, q, limit, hits);
export const SearchPage$isSearchPage = (value) => value instanceof SearchPage;
export const SearchPage$SearchPage$ok = (value) => value.ok;
export const SearchPage$SearchPage$0 = (value) => value.ok;
export const SearchPage$SearchPage$error = (value) => value.error;
export const SearchPage$SearchPage$1 = (value) => value.error;
export const SearchPage$SearchPage$q = (value) => value.q;
export const SearchPage$SearchPage$2 = (value) => value.q;
export const SearchPage$SearchPage$limit = (value) => value.limit;
export const SearchPage$SearchPage$3 = (value) => value.limit;
export const SearchPage$SearchPage$hits = (value) => value.hits;
export const SearchPage$SearchPage$4 = (value) => value.hits;

/**
 * One line, no stack: the model renders this in the error banner.
 * 
 * @ignore
 */
function bad_shape(error) {
  return "unexpected response shape: " + $string.inspect(error);
}

function option_or(value, default$) {
  if (value instanceof $option.Some) {
    let inner = value[0];
    return inner;
  } else {
    return default$;
  }
}

function optional_int_at(path, next) {
  let _pipe = $decode.optionally_at(
    path,
    Option$None$const,
    $decode.optional($decode.int),
  );
  return $decode.then$(_pipe, next);
}

function optional_int(name, next) {
  return $decode.optional_field(
    name,
    Option$None$const,
    $decode.optional($decode.int),
    next,
  );
}

function field_or(name, default$, inner, next) {
  return $decode.optional_field(name, default$, inner, next);
}

function orphan_decoder() {
  return field_or(
    "anchor",
    0,
    $decode.int,
    (anchor) => {
      return optional_int(
        "conversation",
        (conversation) => {
          return $decode.success(new $model.Orphan(anchor, conversation));
        },
      );
    },
  );
}

function with_then(decoder, next) {
  let _pipe = decoder;
  return $decode.then$(_pipe, next);
}

function agent_card_decoder() {
  return field_or(
    "name",
    "unnamed",
    $decode.string,
    (name) => {
      return field_or(
        "state",
        "unknown",
        $decode.string,
        (state) => {
          return field_or(
            "branch",
            "",
            $decode.string,
            (branch) => {
              return field_or(
                "worktree",
                "",
                $decode.string,
                (worktree) => {
                  return optional_int(
                    "last_reply",
                    (last_reply) => {
                      return $decode.success(
                        new $model.AgentCard(
                          name,
                          state,
                          branch,
                          worktree,
                          last_reply,
                        ),
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    },
  );
}

function optional_string_at(path, next) {
  let _pipe = $decode.optionally_at(
    path,
    Option$None$const,
    $decode.optional($decode.string),
  );
  return $decode.then$(_pipe, next);
}

function state_decoder() {
  return optional_int_at(
    listPrepend(
      "vitals",
      listPrepend("ledger", listPrepend("entries", $List$Empty$const)),
    ),
    (entries) => {
      return optional_int_at(
        listPrepend(
          "vitals",
          listPrepend("ledger", listPrepend("bytes", $List$Empty$const)),
        ),
        (ledger_bytes) => {
          return optional_string_at(
            listPrepend(
              "vitals",
              listPrepend("sync", listPrepend("state", $List$Empty$const)),
            ),
            (sync_state) => {
              return optional_int_at(
                listPrepend(
                  "vitals",
                  listPrepend("sync", listPrepend("age_s", $List$Empty$const)),
                ),
                (sync_age_s) => {
                  return optional_string_at(
                    listPrepend(
                      "vitals",
                      listPrepend(
                        "sync",
                        listPrepend("batch", $List$Empty$const),
                      ),
                    ),
                    (sync_batch) => {
                      return optional_int_at(
                        listPrepend(
                          "vitals",
                          listPrepend(
                            "sync",
                            listPrepend("seq", $List$Empty$const),
                          ),
                        ),
                        (sync_seq) => {
                          return optional_int_at(
                            listPrepend(
                              "vitals",
                              listPrepend(
                                "daemon",
                                listPrepend("errors_24h", $List$Empty$const),
                              ),
                            ),
                            (errors_24h) => {
                              return optional_string_at(
                                listPrepend(
                                  "vitals",
                                  listPrepend(
                                    "daemon",
                                    listPrepend("last_error", $List$Empty$const),
                                  ),
                                ),
                                (last_error) => {
                                  return optional_int_at(
                                    listPrepend(
                                      "vitals",
                                      listPrepend(
                                        "daemon",
                                        listPrepend(
                                          "uptime_s",
                                          $List$Empty$const,
                                        ),
                                      ),
                                    ),
                                    (daemon_uptime_s) => {
                                      return optional_int_at(
                                        listPrepend(
                                          "vitals",
                                          listPrepend(
                                            "container",
                                            listPrepend(
                                              "uptime_s",
                                              $List$Empty$const,
                                            ),
                                          ),
                                        ),
                                        (container_uptime_s) => {
                                          return optional_int_at(
                                            listPrepend(
                                              "queue",
                                              listPrepend(
                                                "inbox_depth",
                                                $List$Empty$const,
                                              ),
                                            ),
                                            (inbox_depth) => {
                                              return optional_int_at(
                                                listPrepend(
                                                  "queue",
                                                  listPrepend(
                                                    "tasks",
                                                    listPrepend(
                                                      "running",
                                                      $List$Empty$const,
                                                    ),
                                                  ),
                                                ),
                                                (running) => {
                                                  return optional_int_at(
                                                    listPrepend(
                                                      "queue",
                                                      listPrepend(
                                                        "tasks",
                                                        listPrepend(
                                                          "pending",
                                                          $List$Empty$const,
                                                        ),
                                                      ),
                                                    ),
                                                    (pending) => {
                                                      return optional_int_at(
                                                        listPrepend(
                                                          "queue",
                                                          listPrepend(
                                                            "submissions",
                                                            listPrepend(
                                                              "unanswered",
                                                              $List$Empty$const,
                                                            ),
                                                          ),
                                                        ),
                                                        (unanswered) => {
                                                          return with_then(
                                                            $decode.optionally_at(
                                                              listPrepend(
                                                                "agents",
                                                                listPrepend(
                                                                  "spike",
                                                                  listPrepend(
                                                                    "state",
                                                                    $List$Empty$const,
                                                                  ),
                                                                ),
                                                              ),
                                                              "unknown",
                                                              $decode.string,
                                                            ),
                                                            (spike_state) => {
                                                              return with_then(
                                                                $decode.optionally_at(
                                                                  listPrepend(
                                                                    "agents",
                                                                    listPrepend(
                                                                      "named",
                                                                      $List$Empty$const,
                                                                    ),
                                                                  ),
                                                                  $List$Empty$const,
                                                                  $decode.list(
                                                                    agent_card_decoder(),
                                                                  ),
                                                                ),
                                                                (named) => {
                                                                  return with_then(
                                                                    $decode.optionally_at(
                                                                      listPrepend(
                                                                        "agents",
                                                                        listPrepend(
                                                                          "orphans",
                                                                          $List$Empty$const,
                                                                        ),
                                                                      ),
                                                                      $List$Empty$const,
                                                                      $decode.list(
                                                                        orphan_decoder(),
                                                                      ),
                                                                    ),
                                                                    (orphans) => {
                                                                      return optional_int_at(
                                                                        listPrepend(
                                                                          "agents",
                                                                          listPrepend(
                                                                            "retired",
                                                                            $List$Empty$const,
                                                                          ),
                                                                        ),
                                                                        (
                                                                            retired
                                                                          ) => {
                                                                          return optional_int_at(
                                                                            listPrepend(
                                                                              "agents",
                                                                              listPrepend(
                                                                                "work",
                                                                                listPrepend(
                                                                                  "in_flight",
                                                                                  $List$Empty$const,
                                                                                ),
                                                                              ),
                                                                            ),
                                                                            (
                                                                                in_flight
                                                                              ) => {
                                                                              return optional_int_at(
                                                                                listPrepend(
                                                                                  "agents",
                                                                                  listPrepend(
                                                                                    "work",
                                                                                    listPrepend(
                                                                                      "queued",
                                                                                      $List$Empty$const,
                                                                                    ),
                                                                                  ),
                                                                                ),
                                                                                (
                                                                                    queued
                                                                                  ) => {
                                                                                  return $decode.success(
                                                                                    new State(
                                                                                      new $model.Vitals(
                                                                                        entries,
                                                                                        ledger_bytes,
                                                                                        $model.freshness_from_state(
                                                                                          (() => {
                                                                                            let _pipe = sync_state;
                                                                                            return option_or(
                                                                                              _pipe,
                                                                                              "",
                                                                                            );
                                                                                          })(),
                                                                                        ),
                                                                                        sync_age_s,
                                                                                        sync_batch,
                                                                                        sync_seq,
                                                                                        errors_24h,
                                                                                        last_error,
                                                                                        daemon_uptime_s,
                                                                                        container_uptime_s,
                                                                                      ),
                                                                                      new $model.Queue(
                                                                                        inbox_depth,
                                                                                        running,
                                                                                        pending,
                                                                                        unanswered,
                                                                                        $List$Empty$const,
                                                                                      ),
                                                                                      new $model.Agents(
                                                                                        spike_state,
                                                                                        named,
                                                                                        orphans,
                                                                                        retired,
                                                                                        in_flight,
                                                                                        queued,
                                                                                      ),
                                                                                    ),
                                                                                  );
                                                                                },
                                                                              );
                                                                            },
                                                                          );
                                                                        },
                                                                      );
                                                                    },
                                                                  );
                                                                },
                                                              );
                                                            },
                                                          );
                                                        },
                                                      );
                                                    },
                                                  );
                                                },
                                              );
                                            },
                                          );
                                        },
                                      );
                                    },
                                  );
                                },
                              );
                            },
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    },
  );
}

export function state(body) {
  let _pipe = $json.parse(body, state_decoder());
  return $result.map_error(_pipe, bad_shape);
}

/**
 * Ollama reports money as either a float or an integer; accept both.
 * 
 * @ignore
 */
function float_or_int() {
  return $decode.one_of(
    $decode.float,
    listPrepend($decode.map($decode.int, $int.to_float), $List$Empty$const),
  );
}

function optional_float_at(path, next) {
  let _pipe = $decode.optionally_at(
    path,
    Option$None$const,
    $decode.optional(float_or_int()),
  );
  return $decode.then$(_pipe, next);
}

function spend_decoder() {
  return optional_int_at(
    listPrepend("usage", listPrepend("requests", $List$Empty$const)),
    (requests) => {
      return optional_int_at(
        listPrepend("usage", listPrepend("input_tokens", $List$Empty$const)),
        (input_tokens) => {
          return optional_int_at(
            listPrepend(
              "usage",
              listPrepend("output_tokens", $List$Empty$const),
            ),
            (output_tokens) => {
              return optional_float_at(
                listPrepend(
                  "balance",
                  listPrepend("balance_usd", $List$Empty$const),
                ),
                (balance_usd) => {
                  return optional_float_at(
                    listPrepend(
                      "balance",
                      listPrepend("percent_used", $List$Empty$const),
                    ),
                    (percent_used) => {
                      return optional_int_at(
                        listPrepend(
                          "limits",
                          listPrepend("used_in_window", $List$Empty$const),
                        ),
                        (used_in_window) => {
                          return optional_int_at(
                            listPrepend(
                              "limits",
                              listPrepend("max_per_minute", $List$Empty$const),
                            ),
                            (max_per_minute) => {
                              return field_or(
                                "cached",
                                false,
                                $decode.bool,
                                (cached) => {
                                  return field_or(
                                    "stale",
                                    false,
                                    $decode.bool,
                                    (stale) => {
                                      return with_then(
                                        $decode.optional_field(
                                          "error",
                                          Option$None$const,
                                          $decode.optional($decode.string),
                                          $decode.success,
                                        ),
                                        (problem) => {
                                          return $decode.success(
                                            new $model.Spend(
                                              requests,
                                              input_tokens,
                                              output_tokens,
                                              balance_usd,
                                              percent_used,
                                              used_in_window,
                                              max_per_minute,
                                              cached,
                                              stale,
                                              problem,
                                            ),
                                          );
                                        },
                                      );
                                    },
                                  );
                                },
                              );
                            },
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    },
  );
}

export function spend(body) {
  let _pipe = $json.parse(body, spend_decoder());
  return $result.map_error(_pipe, bad_shape);
}

function optional_string(name, next) {
  return $decode.optional_field(
    name,
    Option$None$const,
    $decode.optional($decode.string),
    next,
  );
}

/**
 * A row with a missing or misshapen field still renders: the human line is the
 * reader's job, and the raw record is shown verbatim beside it.
 * 
 * @ignore
 */
function log_entry_decoder() {
  return field_or(
    "id",
    0,
    $decode.int,
    (id) => {
      return field_or(
        "kind",
        "unknown",
        $decode.string,
        (kind) => {
          return optional_string(
            "at",
            (at) => {
              return field_or(
                "text",
                "unknown entry",
                $decode.string,
                (text) => {
                  return optional_string(
                    "thread",
                    (thread) => {
                      return optional_string(
                        "spill",
                        (spill) => {
                          return field_or(
                            "raw",
                            "",
                            $decode.string,
                            (raw) => {
                              return $decode.success(
                                new $model.LogEntry(
                                  id,
                                  kind,
                                  at,
                                  text,
                                  thread,
                                  spill,
                                  raw,
                                ),
                              );
                            },
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    },
  );
}

function logs_decoder() {
  return field_or(
    "ok",
    true,
    $decode.bool,
    (ok) => {
      return $decode.optional_field(
        "error",
        Option$None$const,
        $decode.optional($decode.string),
        (problem) => {
          return $decode.optional_field(
            "entries",
            $List$Empty$const,
            $decode.list(log_entry_decoder()),
            (entries) => {
              return $decode.optional_field(
                "next_before",
                Option$None$const,
                $decode.optional($decode.int),
                (next_before) => {
                  return $decode.success(
                    new LogsPage(ok, problem, entries, next_before),
                  );
                },
              );
            },
          );
        },
      );
    },
  );
}

export function logs(body) {
  let _pipe = $json.parse(body, logs_decoder());
  return $result.map_error(_pipe, bad_shape);
}

function spill_decoder() {
  return field_or(
    "ok",
    false,
    $decode.bool,
    (ok) => {
      return $decode.optional_field(
        "error",
        Option$None$const,
        $decode.optional($decode.string),
        (problem) => {
          return $decode.optional_field(
            "text",
            Option$None$const,
            $decode.optional($decode.string),
            (text) => { return $decode.success([ok, problem, text]); },
          );
        },
      );
    },
  );
}

/**
 * One `/api/spill` answer: `Ok` is the text to show, `Error` the reason to show
 * in its place. The reader answers 200 with `ok:false` for a ledger it cannot
 * read; a real HTTP failure reaches the FFI's error callback instead.
 */
export function spill(body) {
  let $ = $json.parse(body, spill_decoder());
  if ($ instanceof Ok) {
    if ($[0][0]) {
      let $1 = $[0][2];
      if ($1 instanceof Some) {
        let text = $1[0];
        return new Ok(text);
      } else {
        return new Ok("");
      }
    } else {
      let problem = $[0][1];
      return new Error(option_or(problem, "no such file"));
    }
  } else {
    let problem = $[0];
    return new Error(bad_shape(problem));
  }
}

/**
 * `field_or`, but a *wrong-typed* value falls back to the default too. The
 * reader and the wall are written by the same hand, so a type mismatch is a
 * bug — and a bug in one row must not blank a whole rail or jump list. Reserved
 * for the round-four shapes: a page whose rows cannot be read at all is still an
 * error, and still a banner rather than a crash.
 * 
 * @ignore
 */
function tolerant(name, default$, inner, next) {
  let _pipe = $decode.one_of(
    $decode.field(name, inner, $decode.success),
    listPrepend($decode.success(default$), $List$Empty$const),
  );
  return $decode.then$(_pipe, next);
}

function tolerant_optional(name, inner, next) {
  return tolerant(name, Option$None$const, inner, next);
}

/**
 * A space whose `kind` or `state` drifted renders as `unknown` — a card that
 * says it does not know beats a card that says the wrong thing. The fields go
 * through `tolerant`, so *any* shape drift on one space (a missing key, a string
 * where a number belongs, a new enum word) costs that one field, not the rail.
 * 
 * @ignore
 */
function conversation_decoder() {
  return tolerant(
    "id",
    0,
    $decode.int,
    (id) => {
      return tolerant(
        "kind",
        "unknown",
        $decode.string,
        (kind) => {
          return tolerant(
            "title",
            "unknown",
            $decode.string,
            (title) => {
              return tolerant(
                "state",
                "unknown",
                $decode.string,
                (state) => {
                  return tolerant(
                    "entries",
                    0,
                    $decode.int,
                    (entries) => {
                      return tolerant_optional(
                        "first_at",
                        $decode.optional($decode.string),
                        (first_at) => {
                          return tolerant_optional(
                            "last_at",
                            $decode.optional($decode.string),
                            (last_at) => {
                              return $decode.success(
                                new $model.Conversation(
                                  id,
                                  kind,
                                  title,
                                  state,
                                  entries,
                                  first_at,
                                  last_at,
                                ),
                              );
                            },
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    },
  );
}

function conversations_decoder() {
  return field_or(
    "ok",
    true,
    $decode.bool,
    (ok) => {
      return $decode.optional_field(
        "error",
        Option$None$const,
        $decode.optional($decode.string),
        (problem) => {
          return $decode.optional_field(
            "conversations",
            $List$Empty$const,
            $decode.list(conversation_decoder()),
            (items) => {
              return $decode.success(new ConversationsPage(ok, problem, items));
            },
          );
        },
      );
    },
  );
}

export function conversations(body) {
  let _pipe = $json.parse(body, conversations_decoder());
  return $result.map_error(_pipe, bad_shape);
}

/**
 * A hit without a conversation id cannot be jumped to, so it decodes to `None`
 * and the row stays visible but inert.
 * 
 * @ignore
 */
function search_hit_decoder() {
  return tolerant_optional(
    "conversation_id",
    $decode.optional($decode.int),
    (conversation) => {
      return tolerant(
        "conversation_title",
        "unknown",
        $decode.string,
        (title) => {
          return tolerant(
            "entry_id",
            0,
            $decode.int,
            (entry) => {
              return tolerant(
                "kind",
                "unknown",
                $decode.string,
                (kind) => {
                  return tolerant_optional(
                    "at",
                    $decode.optional($decode.string),
                    (at) => {
                      return tolerant(
                        "text",
                        "unknown entry",
                        $decode.string,
                        (text) => {
                          return $decode.success(
                            new $model.SearchHit(
                              conversation,
                              title,
                              entry,
                              kind,
                              at,
                              text,
                            ),
                          );
                        },
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    },
  );
}

function search_decoder() {
  return field_or(
    "ok",
    true,
    $decode.bool,
    (ok) => {
      return $decode.optional_field(
        "error",
        Option$None$const,
        $decode.optional($decode.string),
        (problem) => {
          return optional_string(
            "q",
            (q) => {
              return optional_int(
                "limit",
                (limit) => {
                  return $decode.optional_field(
                    "hits",
                    $List$Empty$const,
                    $decode.list(search_hit_decoder()),
                    (hits) => {
                      return $decode.success(
                        new SearchPage(ok, problem, q, limit, hits),
                      );
                    },
                  );
                },
              );
            },
          );
        },
      );
    },
  );
}

export function search(body) {
  let _pipe = $json.parse(body, search_decoder());
  return $result.map_error(_pipe, bad_shape);
}
