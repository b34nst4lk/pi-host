import * as $json from "../../gleam_json/gleam/json.mjs";
import * as $decode from "../../gleam_stdlib/gleam/dynamic/decode.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
} from "../gleam.mjs";
import * as $model from "../wall/model.mjs";

export class State extends $CustomType {
  constructor(vitals, queue, fleet) {
    super();
    this.vitals = vitals;
    this.queue = queue;
    this.fleet = fleet;
  }
}
export const State$State = (vitals, queue, fleet) =>
  new State(vitals, queue, fleet);
export const State$isState = (value) => value instanceof State;
export const State$State$vitals = (value) => value.vitals;
export const State$State$0 = (value) => value.vitals;
export const State$State$queue = (value) => value.queue;
export const State$State$1 = (value) => value.queue;
export const State$State$fleet = (value) => value.fleet;
export const State$State$2 = (value) => value.fleet;

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

function field_or(name, default$, inner, next) {
  return $decode.optional_field(name, default$, inner, next);
}

function agent_decoder() {
  return field_or(
    "name",
    "unnamed",
    $decode.string,
    (name) => {
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
              return field_or(
                "reports",
                0,
                $decode.int,
                (reports) => {
                  return field_or(
                    "state",
                    "unknown",
                    $decode.string,
                    (state) => {
                      return $decode.success(
                        new $model.Agent(name, branch, worktree, reports, state),
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

function with_then(decoder, next) {
  let _pipe = decoder;
  return $decode.then$(_pipe, next);
}

function optional_int_at(path, next) {
  let _pipe = $decode.optionally_at(
    path,
    Option$None$const,
    $decode.optional($decode.int),
  );
  return $decode.then$(_pipe, next);
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
                                                                "fleet",
                                                                listPrepend(
                                                                  "agents",
                                                                  $List$Empty$const,
                                                                ),
                                                              ),
                                                              $List$Empty$const,
                                                              $decode.list(
                                                                agent_decoder(),
                                                              ),
                                                            ),
                                                            (fleet) => {
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
                                                                  fleet,
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
