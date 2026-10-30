//// The only place the wall touches the browser: `fetch`, timers, the clock and
//// the URL. Everything else in this project is pure Gleam, which is what makes
//// the mappings testable with gleeunit and no DOM.

@external(javascript, "./ffi.ffi.mjs", "fetch_text")
pub fn fetch_text(
  url: String,
  on_ok: fn(String) -> Nil,
  on_error: fn(String) -> Nil,
) -> Nil

/// Call `on_tick` every `milliseconds`, forever.
@external(javascript, "./ffi.ffi.mjs", "every")
pub fn every(milliseconds: Int, on_tick: fn() -> Nil) -> Nil

/// Milliseconds since the epoch — for the sparkline's x axis.
@external(javascript, "./ffi.ffi.mjs", "now_ms")
pub fn now_ms() -> Int

/// `?fake=1` (or `?fake`) — the built-in fixtures, no reader needed.
@external(javascript, "./ffi.ffi.mjs", "query_flag")
pub fn query_flag(name: String) -> Bool
