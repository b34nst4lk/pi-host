//// JSON → model. Every reader response is decoded defensively: a missing field
//// becomes `None`, an unexpected type becomes `None`, and a response that is not
//// JSON at all becomes an `Error` the model renders as a banner. The wall never
//// crashes because the reader had a bad day.

import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{type Option, None}
import gleam/result
import gleam/string
import wall/model

/// One `/api/state` response: what the vitals, queue and fleet cards show.
pub type State {
  State(
    vitals: model.Vitals,
    queue: model.Queue,
    fleet: List(model.Agent),
  )
}

pub fn state(body: String) -> Result(State, String) {
  json.parse(body, using: state_decoder())
  |> result.map_error(bad_shape)
}

pub fn spend(body: String) -> Result(model.Spend, String) {
  json.parse(body, using: spend_decoder())
  |> result.map_error(bad_shape)
}

fn state_decoder() -> decode.Decoder(State) {
  use entries <- optional_int_at(["vitals", "ledger", "entries"])
  use ledger_bytes <- optional_int_at(["vitals", "ledger", "bytes"])
  use sync_state <- optional_string_at(["vitals", "sync", "state"])
  use sync_age_s <- optional_int_at(["vitals", "sync", "age_s"])
  use sync_batch <- optional_string_at(["vitals", "sync", "batch"])
  use sync_seq <- optional_int_at(["vitals", "sync", "seq"])
  use errors_24h <- optional_int_at(["vitals", "daemon", "errors_24h"])
  use last_error <- optional_string_at(["vitals", "daemon", "last_error"])
  use daemon_uptime_s <- optional_int_at(["vitals", "daemon", "uptime_s"])
  use container_uptime_s <- optional_int_at(["vitals", "container", "uptime_s"])
  use inbox_depth <- optional_int_at(["queue", "inbox_depth"])
  use running <- optional_int_at(["queue", "tasks", "running"])
  use pending <- optional_int_at(["queue", "tasks", "pending"])
  use unanswered <- optional_int_at(["queue", "submissions", "unanswered"])
  use fleet <- with_then(decode.optionally_at(["fleet", "agents"], [], decode.list(agent_decoder())))
  decode.success(State(
    vitals: model.Vitals(
      entries: entries,
      ledger_bytes: ledger_bytes,
      sync_state: model.freshness_from_state(sync_state |> option_or("")),
      sync_age_s: sync_age_s,
      sync_batch: sync_batch,
      sync_seq: sync_seq,
      errors_24h: errors_24h,
      last_error: last_error,
      daemon_uptime_s: daemon_uptime_s,
      container_uptime_s: container_uptime_s,
    ),
    queue: model.Queue(
      inbox_depth: inbox_depth,
      running: running,
      pending: pending,
      unanswered: unanswered,
      errors: [],
    ),
    fleet: fleet,
  ))
}

fn agent_decoder() -> decode.Decoder(model.Agent) {
  use name <- field_or("name", "unnamed", decode.string)
  use branch <- field_or("branch", "", decode.string)
  use worktree <- field_or("worktree", "", decode.string)
  use reports <- field_or("reports", 0, decode.int)
  use state <- field_or("state", "unknown", decode.string)
  decode.success(model.Agent(
    name: name,
    branch: branch,
    worktree: worktree,
    reports: reports,
    state: state,
  ))
}

fn spend_decoder() -> decode.Decoder(model.Spend) {
  use requests <- optional_int_at(["usage", "requests"])
  use input_tokens <- optional_int_at(["usage", "input_tokens"])
  use output_tokens <- optional_int_at(["usage", "output_tokens"])
  use balance_usd <- optional_float_at(["balance", "balance_usd"])
  use percent_used <- optional_float_at(["balance", "percent_used"])
  use used_in_window <- optional_int_at(["limits", "used_in_window"])
  use max_per_minute <- optional_int_at(["limits", "max_per_minute"])
  use cached <- field_or("cached", False, decode.bool)
  use stale <- field_or("stale", False, decode.bool)
  use problem <- with_then(decode.optional_field("error", None, decode.optional(decode.string), decode.success))
  decode.success(model.Spend(
    requests: requests,
    input_tokens: input_tokens,
    output_tokens: output_tokens,
    balance_usd: balance_usd,
    percent_used: percent_used,
    used_in_window: used_in_window,
    max_per_minute: max_per_minute,
    cached: cached,
    stale: stale,
    error: problem,
  ))
}

// --- narrow helpers, so the decoders above read like the contract ----------

fn field_or(
  name: String,
  default: a,
  inner: decode.Decoder(a),
  next: fn(a) -> decode.Decoder(b),
) -> decode.Decoder(b) {
  decode.optional_field(name, default, inner, next)
}

fn optional_int_at(
  path: List(String),
  next: fn(Option(Int)) -> decode.Decoder(a),
) -> decode.Decoder(a) {
  decode.optionally_at(path, None, decode.optional(decode.int))
  |> decode.then(next)
}

fn optional_string_at(
  path: List(String),
  next: fn(Option(String)) -> decode.Decoder(a),
) -> decode.Decoder(a) {
  decode.optionally_at(path, None, decode.optional(decode.string))
  |> decode.then(next)
}

fn optional_float_at(
  path: List(String),
  next: fn(Option(Float)) -> decode.Decoder(a),
) -> decode.Decoder(a) {
  // Ollama reports some money as integers, so both shapes are accepted.
  decode.optionally_at(path, None, decode.optional(float_or_int())) |> decode.then(next)
}

fn with_then(decoder: decode.Decoder(a), next: fn(a) -> decode.Decoder(b)) -> decode.Decoder(b) {
  decoder |> decode.then(next)
}

/// Ollama reports money as either a float or an integer; accept both.
fn float_or_int() -> decode.Decoder(Float) {
  decode.one_of(decode.float, [decode.map(decode.int, int.to_float)])
}

fn option_or(value: Option(a), default: a) -> a {
  case value {
    option.Some(inner) -> inner
    option.None -> default
  }
}

/// One line, no stack: the model renders this in the error banner.
fn bad_shape(error: json.DecodeError) -> String {
  "unexpected response shape: " <> string.inspect(error)
}
