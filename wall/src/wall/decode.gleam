//// JSON → model. Every reader response is decoded defensively: a missing field
//// becomes `None`, an unexpected type becomes `None`, and a response that is not
//// JSON at all becomes an `Error` the model renders as a banner. The wall never
//// crashes because the reader had a bad day.

import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import wall/browser
import wall/logs
import wall/model

/// One `/api/state` response: what the vitals, queue and agent cards show.
pub type State {
  State(
    vitals: model.Vitals,
    queue: model.Queue,
    agents: model.Agents,
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
  use spike_kind <- with_then(
    decode.optionally_at(["agents", "spike", "kind"], "main", decode.string),
  )
  use spike_state <- with_then(
    decode.optionally_at(["agents", "spike", "state"], "unknown", decode.string),
  )
  use named <- with_then(
    decode.optionally_at(["agents", "named"], [], decode.list(agent_card_decoder())),
  )
  use orphans <- with_then(
    decode.optionally_at(["agents", "orphans"], [], decode.list(orphan_decoder())),
  )
  use retired <- optional_int_at(["agents", "retired"])
  use in_flight <- optional_int_at(["agents", "work", "in_flight"])
  use queued <- optional_int_at(["agents", "work", "queued"])
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
    agents: model.Agents(
      spike_kind: spike_kind,
      spike_state: spike_state,
      named: named,
      orphans: orphans,
      retired: retired,
      in_flight: in_flight,
      queued: queued,
    ),
  ))
}

fn agent_card_decoder() -> decode.Decoder(model.AgentCard) {
  use kind <- field_or("kind", "subagent", decode.string)
  use name <- field_or("name", "unnamed", decode.string)
  use state <- field_or("state", "unknown", decode.string)
  // `branch`/`worktree` can be an explicit `null` on a project card: a project has
  // a `cwd`, not a worktree, and the reader says so rather than inventing "".
  use branch <- nullable_string("branch", "", decode.string)
  use worktree <- nullable_string("worktree", "", decode.string)
  use last_reply <- optional_int("last_reply")
  // Project-only fields: absent on a subagent card, and absent on an older
  // reader's payload — both decode as \`None\`, which the view prints as "—".
  use room <- optional_string("room")
  use cwd <- optional_string("cwd")
  use summary <- optional_string("summary")
  use entries <- optional_int("entries")
  decode.success(model.AgentCard(
    kind: kind,
    name: name,
    state: state,
    branch: branch,
    worktree: worktree,
    last_reply: last_reply,
    room: room,
    cwd: cwd,
    summary: summary,
    entries: entries,
  ))
}

fn orphan_decoder() -> decode.Decoder(model.Orphan) {
  use anchor <- field_or("anchor", 0, decode.int)
  use conversation <- optional_int("conversation")
  decode.success(model.Orphan(anchor: anchor, conversation: conversation))
}

fn spend_decoder() -> decode.Decoder(model.Spend) {
  use requests <- optional_int_at(["usage", "requests"])
  use input_tokens <- optional_int_at(["usage", "input_tokens"])
  use output_tokens <- optional_int_at(["usage", "output_tokens"])
  use balance_usd <- optional_float_at(["balance", "balance_usd"])
  use percent_used <- optional_float_at(["balance", "percent_used"])
  use session_resets_at <- optional_string_at(["balance", "session_resets_at"])
  use weekly_percent_used <- optional_float_at(["balance", "weekly_percent_used"])
  use weekly_resets_at <- optional_string_at(["balance", "weekly_resets_at"])
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
    session_resets_at: session_resets_at,
    weekly_percent_used: weekly_percent_used,
    weekly_resets_at: weekly_resets_at,
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

/// A string field the reader may send as JSON `null`. Null, a missing key and a
/// wrong type all come back as the default — a card is never dropped for it.
fn nullable_string(
  name: String,
  default: a,
  inner: decode.Decoder(a),
  next: fn(a) -> decode.Decoder(b),
) -> decode.Decoder(b) {
  decode.optional_field(name, None, decode.optional(inner), fn(value) {
    next(option_or(value, default))
  })
}

fn optional_int(
  name: String,
  next: fn(Option(Int)) -> decode.Decoder(a),
) -> decode.Decoder(a) {
  decode.optional_field(name, None, decode.optional(decode.int), next)
}

fn optional_string(
  name: String,
  next: fn(Option(String)) -> decode.Decoder(a),
) -> decode.Decoder(a) {
  decode.optional_field(name, None, decode.optional(decode.string), next)
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

// --- the logs tab ---------------------------------------------------------

/// One `/api/logs` page. `ok:false` arrives on 200 (the reader clamps bad
/// parameters and reports a broken ledger in the body), so the page keeps its
/// flag instead of collapsing into a decode error: the tab renders the message
/// in place of rows and keeps polling.
pub type LogsPage {
  LogsPage(
    ok: Bool,
    error: Option(String),
    entries: List(logs.LogEntry),
    next_before: Option(Int),
  )
}

pub fn logs(body: String) -> Result(LogsPage, String) {
  json.parse(body, using: logs_decoder())
  |> result.map_error(bad_shape)
}

fn logs_decoder() -> decode.Decoder(LogsPage) {
  use ok <- field_or("ok", True, decode.bool)
  use problem <- decode.optional_field("error", None, decode.optional(decode.string))
  use entries <- decode.optional_field("entries", [], decode.list(log_entry_decoder()))
  use next_before <- decode.optional_field("next_before", None, decode.optional(decode.int))
  decode.success(LogsPage(ok: ok, error: problem, entries: entries, next_before: next_before))
}

/// A row with a missing or misshapen field still renders: the human line is the
/// reader's job, and the raw record is shown verbatim beside it.
fn log_entry_decoder() -> decode.Decoder(logs.LogEntry) {
  use id <- field_or("id", 0, decode.int)
  use kind <- field_or("kind", "unknown", decode.string)
  use at <- optional_string("at")
  use text <- field_or("text", "unknown entry", decode.string)
  use thread <- optional_string("thread")
  use spill <- optional_string("spill")
  use raw <- field_or("raw", "", decode.string)
  decode.success(logs.LogEntry(
    id: id,
    kind: kind,
    at: at,
    text: text,
    thread: thread,
    spill: spill,
    raw: raw,
  ))
}

/// One `/api/spill` answer: `Ok` is the text to show, `Error` the reason to show
/// in its place. The reader answers 200 with `ok:false` for a ledger it cannot
/// read; a real HTTP failure reaches the FFI's error callback instead.
pub fn spill(body: String) -> Result(String, String) {
  case json.parse(body, using: spill_decoder()) {
    Ok(#(True, _, Some(text))) -> Ok(text)
    Ok(#(True, _, None)) -> Ok("")
    Ok(#(False, problem, _)) -> Error(option_or(problem, "no such file"))
    Error(problem) -> Error(bad_shape(problem))
  }
}

fn spill_decoder() -> decode.Decoder(#(Bool, Option(String), Option(String))) {
  use ok <- field_or("ok", False, decode.bool)
  use problem <- decode.optional_field("error", None, decode.optional(decode.string))
  use text <- decode.optional_field("text", None, decode.optional(decode.string))
  decode.success(#(ok, problem, text))
}

// --- round four: the picker and the jump list ------------------------------

/// One `/api/conversations` answer. Same shape as `LogsPage`: `ok:false` is a
/// ledger the reader could not read, and it is rendered, not thrown.
pub type ConversationsPage {
  ConversationsPage(
    ok: Bool,
    error: Option(String),
    items: List(browser.Conversation),
  )
}

pub fn conversations(body: String) -> Result(ConversationsPage, String) {
  json.parse(body, using: conversations_decoder())
  |> result.map_error(bad_shape)
}

fn conversations_decoder() -> decode.Decoder(ConversationsPage) {
  use ok <- field_or("ok", True, decode.bool)
  use problem <- decode.optional_field("error", None, decode.optional(decode.string))
  use items <- decode.optional_field("conversations", [], decode.list(conversation_decoder()))
  decode.success(ConversationsPage(ok: ok, error: problem, items: items))
}

/// A space whose `kind` or `state` drifted renders as `unknown` — a card that
/// says it does not know beats a card that says the wrong thing. The fields go
/// through `tolerant`, so *any* shape drift on one space (a missing key, a string
/// where a number belongs, a new enum word) costs that one field, not the rail.
fn conversation_decoder() -> decode.Decoder(browser.Conversation) {
  use id <- tolerant("id", 0, decode.int)
  use kind <- tolerant("kind", "unknown", decode.string)
  use title <- tolerant("title", "unknown", decode.string)
  use state <- tolerant("state", "unknown", decode.string)
  use entries <- tolerant("entries", 0, decode.int)
  use first_at <- tolerant_optional("first_at", decode.optional(decode.string))
  use last_at <- tolerant_optional("last_at", decode.optional(decode.string))
  decode.success(browser.Conversation(
    id: id,
    kind: kind,
    title: title,
    state: state,
    entries: entries,
    first_at: first_at,
    last_at: last_at,
  ))
}

/// One `/api/search` answer.
pub type SearchPage {
  SearchPage(
    ok: Bool,
    error: Option(String),
    q: Option(String),
    limit: Option(Int),
    hits: List(browser.SearchHit),
  )
}

pub fn search(body: String) -> Result(SearchPage, String) {
  json.parse(body, using: search_decoder())
  |> result.map_error(bad_shape)
}

fn search_decoder() -> decode.Decoder(SearchPage) {
  use ok <- field_or("ok", True, decode.bool)
  use problem <- decode.optional_field("error", None, decode.optional(decode.string))
  use q <- optional_string("q")
  use limit <- optional_int("limit")
  use hits <- decode.optional_field("hits", [], decode.list(search_hit_decoder()))
  decode.success(SearchPage(ok: ok, error: problem, q: q, limit: limit, hits: hits))
}

/// A hit without a conversation id cannot be jumped to, so it decodes to `None`
/// and the row stays visible but inert.
fn search_hit_decoder() -> decode.Decoder(browser.SearchHit) {
  use conversation <- tolerant_optional("conversation_id", decode.optional(decode.int))
  use title <- tolerant("conversation_title", "unknown", decode.string)
  use entry <- tolerant("entry_id", 0, decode.int)
  use kind <- tolerant("kind", "unknown", decode.string)
  use at <- tolerant_optional("at", decode.optional(decode.string))
  use text <- tolerant("text", "unknown entry", decode.string)
  decode.success(browser.SearchHit(
    conversation: conversation,
    conversation_title: title,
    entry: entry,
    kind: kind,
    at: at,
    text: text,
  ))
}

/// `field_or`, but a *wrong-typed* value falls back to the default too. The
/// reader and the wall are written by the same hand, so a type mismatch is a
/// bug — and a bug in one row must not blank a whole rail or jump list. Reserved
/// for the round-four shapes: a page whose rows cannot be read at all is still an
/// error, and still a banner rather than a crash.
fn tolerant(
  name: String,
  default: a,
  inner: decode.Decoder(a),
  next: fn(a) -> decode.Decoder(b),
) -> decode.Decoder(b) {
  decode.one_of(decode.field(name, inner, decode.success), [decode.success(default)])
  |> decode.then(next)
}

fn tolerant_optional(
  name: String,
  inner: decode.Decoder(Option(a)),
  next: fn(Option(a)) -> decode.Decoder(b),
) -> decode.Decoder(b) {
  tolerant(name, None, inner, next)
}
