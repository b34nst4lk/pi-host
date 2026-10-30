//// The LOGS tab's half of `update`: filter changes, page arrivals, the spill
//// reader, and the effects that ask the reader for more.
////
//// Every function takes the current model and answers with the next model (or an
//// effect that will dispatch one), so `wall.update` stays a flat dispatch table.

import gleam/list
import gleam/option
import lustre/effect
import wall/browser
import wall/decode
import wall/fake
import wall/ffi
import wall/logs
import wall/model

// --- the logs tab: state transitions --------------------------------------

/// A filter change starts the page over: the row set is the answer to a
/// different question, so the old rows are not the ones to keep.
pub fn refilter(current: model.Model, filters: logs.LogFilters) -> #(model.Model, effect.Effect(model.Msg)) {
  let next = model.Model(..current, filters: filters, logs: option.Some(logs.empty_logs()))
  #(next, reload(next))
}

pub fn with_logs(current: model.Model, logs: logs.Logs) -> model.Model {
  model.Model(..current, logs: option.Some(logs))
}

pub fn with_logs_error(current: model.Model, problem: String) -> model.Model {
  let previous = current.logs |> option.unwrap(logs.empty_logs())
  with_logs(
    current,
    logs.Logs(..previous, appending: False, error: option.Some(problem)),
  )
}

/// A page arrived: it replaces the rows when it is the tail of the log, and
/// appends when it was asked for with a cursor. Duplicates are dropped, so an
/// overlapping older page cannot repeat a row.
pub fn with_page(current: model.Model, page: decode.LogsPage) -> model.Model {
  let previous = current.logs |> option.unwrap(logs.empty_logs())
  let entries = case previous.appending {
    True -> list.append(previous.entries, page.entries)
    False -> page.entries
  }
  with_logs(
    current,
    logs.Logs(
      entries: dedupe(entries),
      next_before: page.next_before,
      tailing: !previous.appending,
      appending: False,
      spills: previous.spills,
      error: option.None,
    ),
  )
}

pub fn dedupe(entries: List(logs.LogEntry)) -> List(logs.LogEntry) {
  let #(kept, _) =
    list.fold(entries, #([], []), fn(state, entry) {
      case list.contains(state.1, entry.id) {
        True -> state
        False -> #(list.append(state.0, [entry]), list.append(state.1, [entry.id]))
      }
    })
  kept
}

/// A spill answer lands in whichever stream asked for it. The browser pane's rows
/// are the same rows, so the map is keyed by entry id and written to both.
pub fn with_spill(current: model.Model, id: Int, text: String) -> model.Model {
  let previous = current.logs |> option.unwrap(logs.empty_logs())
  let rest = list.filter(previous.spills, fn(pair) { pair.0 != id })
  let logs = logs.Logs(..previous, spills: [#(id, text), ..rest])
  let browser = case current.browser.stream {
    option.None -> current.browser
    option.Some(stream) -> {
      let kept = list.filter(stream.spills, fn(pair) { pair.0 != id })
      let stream = logs.Logs(..stream, spills: [#(id, text), ..kept])
      browser.Browser(..current.browser, stream: option.Some(stream))
    }
  }
  model.Model(..current, logs: option.Some(logs), browser: browser)
}

// --- the logs tab: effects ------------------------------------------------

/// Should the poll refresh the LOGS page? Only while it shows the newest rows.
pub fn tail_active(current: model.Model) -> Bool {
  case current.tab, current.logs {
    logs.LogsTab, option.Some(logs) -> logs.tailing
    logs.LogsTab, option.None -> True
    _, _ -> False
  }
}

/// Should the poll refresh the BROWSER pane? While it follows the tail of a
/// selected space — not while it is a window around a landed hit.
pub fn browser_tail_active(current: model.Model) -> Bool {
  case current.tab {
    logs.BrowserTab ->
      current.browser.selected != option.None && current.browser.anchor == option.None
    _ -> False
  }
}

pub fn reload(current: model.Model) -> effect.Effect(model.Msg) {
  load_page(current.filters, option.None, current.mode)
}

pub fn load_page(
  filters: logs.LogFilters,
  before: option.Option(Int),
  mode: model.Mode,
) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case mode {
      model.FakeMode -> dispatch(model.LogsArrived(fake.logs_json(filters, ffi.now_ms() / model.poll_interval_ms)))
      model.LiveMode -> {
        let url = logs.logs_path(filters, before, logs.log_limit)
        ffi.fetch_text(
          url,
          fn(body) { dispatch(model.LogsArrived(body)) },
          fn(problem) { dispatch(model.Failed(problem)) },
        )
      }
    }
    Nil
  })
}

pub fn load_spill(id: Int, path: String, mode: model.Mode) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case mode {
      model.FakeMode -> dispatch(model.SpillArrived(id, fake.spill_json()))
      model.LiveMode ->
        ffi.fetch_text(
          "/api/spill?path=" <> logs.url_encode(path),
          fn(body) { dispatch(model.SpillArrived(id, body)) },
          fn(problem) { dispatch(model.SpillFailed(id, problem)) },
        )
    }
    Nil
  })
}

