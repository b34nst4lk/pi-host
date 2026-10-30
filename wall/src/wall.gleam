//// The wall: a read-only dashboard for the pi-host ledger. Elm architecture —
//// `init` / `update` / `view` — polling the reader every 10 s, drawing its own
//// sparklines, no chart library and no frontend framework.
////
//// Three tabs, one poll: the dashboard's two endpoints, the LOGS tail, and the
//// BROWSER's rail plus stream. Both log views render through `view.log_rows`, so
//// the expanders, the spill reader and the pretty record are one code path.
////
//// Two data sources, one code path: `?fake=1` feeds the same decoders from
//// built-in fixtures (`wall/fake.gleam`), so the UI can be developed and tested
//// with no reader running and no network at all.

import gleam/list
import gleam/option
import gleam/string
import lustre
import lustre/effect
import wall/decode
import wall/fake
import wall/ffi
import wall/model
import wall/view

/// Ten seconds: one poll per tick, both endpoints.
pub const poll_interval_ms = 10_000

pub fn main() {
  let app = lustre.application(init, update, view.view)
  case lustre.start(app, "#app", Nil) {
    Ok(_) -> Nil
    Error(_problem) -> Nil
  }
}

pub fn init(_arguments: Nil) -> #(model.Model, effect.Effect(model.Msg)) {
  let mode = case ffi.query_flag("fake") {
    True -> model.FakeMode
    False -> model.LiveMode
  }
  let fresh = model.initial(mode)
  #(fresh, poll(fresh))
}

pub fn update(current: model.Model, msg: model.Msg) -> #(model.Model, effect.Effect(model.Msg)) {
  case msg {
    model.Tick -> #(current, poll(current))
    model.ToggleMode -> {
      let next =
        model.Model(
          ..current,
          mode: toggle(current.mode),
          polls: 0,
          samples: [],
          logs: option.None,
        )
      #(next, poll(next))
    }
    model.StateArrived(body) -> {
      case decode.state(body) {
        Ok(state) ->
          #(
            model.Model(
              ..current,
              vitals: option.Some(state.vitals),
              queue: option.Some(queue_with_errors(current, state.queue)),
              agents: option.Some(state.agents),
              polls: current.polls + 1,
              error: option.None,
            ),
            effect.none(),
          )
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.SpendArrived(body) -> {
      case decode.spend(body) {
        Ok(spend) -> #(with_spend(current, spend), effect.none())
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.Failed(problem) -> #(fail(current, problem), effect.none())

    // --- the logs tab ----------------------------------------------------
    model.TabChosen(tab) -> {
      let next = model.Model(..current, tab: tab)
      let load = case tab {
        model.LogsTab -> reload(next)
        // The rail first: its arrival picks the main conversation and asks for
        // that stream, so the tab never opens on an empty pane.
        model.BrowserTab -> effect.batch([load_conversations(next.mode), load_browser(next)])
        // The PROJECTS pane renders from the agent cards the dashboard poll already
        // carries, so opening it needs no request of its own.
        model.Dashboard -> effect.none()
        model.ProjectsTab -> effect.none()
      }
      #(next, load)
    }
    model.DirectionChosen(direction) ->
      refilter(current, model.LogFilters(..current.filters, direction: direction))
    model.KindToggled(kind) -> {
      let kinds = case list.contains(current.filters.kinds, kind) {
        True -> list.filter(current.filters.kinds, fn(other) { other != kind })
        False -> list.append(current.filters.kinds, [kind])
      }
      refilter(current, model.LogFilters(..current.filters, kinds: kinds))
    }
    model.QueryChanged(query) ->
      refilter(current, model.LogFilters(..current.filters, query: query))
    model.OlderRequested -> {
      case current.logs {
        option.Some(logs) if logs.next_before != option.None ->
          // Paging back stops the tail: the poll must not yank the page the
          // reader is walking through.
          #(
            with_logs(
              current,
              model.Logs(..logs, tailing: False, appending: True),
            ),
            load_page(current.filters, logs.next_before, current.mode),
          )
        _ -> #(current, effect.none())
      }
    }
    model.LogsArrived(body) -> {
      case decode.logs(body) {
        Ok(page) if page.ok -> #(with_page(current, page), effect.none())
        Ok(page) ->
          #(
            with_logs_error(
              current,
              option.unwrap(page.error, "the reader could not read the ledger"),
            ),
            effect.none(),
          )
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.SpillRequested(id, path) -> #(current, load_spill(id, path, current.mode))
    model.SpillArrived(id, body) -> {
      case decode.spill(body) {
        Ok(text) -> #(with_spill(current, id, text), effect.none())
        Error(problem) -> #(with_spill(current, id, "error: " <> problem), effect.none())
      }
    }
    model.SpillFailed(id, problem) -> #(with_spill(current, id, "error: " <> problem), effect.none())

    // --- the browser tab -------------------------------------------------
    model.ConversationsArrived(body) -> {
      case decode.conversations(body) {
        Ok(page) if page.ok -> {
          let items = model.order_conversations(page.items)
          let browser =
            model.Browser(..current.browser, conversations: items, conversations_error: option.None)
          // Nothing selected yet: pick the first card, which the ordering pins to
          // main. A picker that opens with nothing on screen is a puzzle.
          case browser.selected {
            option.None ->
              case list.first(items) {
                Ok(first) -> {
                  let next =
                    model.Model(..current, browser: model.select_conversation(browser, first.id))
                  #(next, load_browser(next))
                }
                Error(_) -> #(model.Model(..current, browser: browser), effect.none())
              }
            option.Some(_) -> #(model.Model(..current, browser: browser), effect.none())
          }
        }
        Ok(page) -> {
          let browser =
            model.Browser(
              ..current.browser,
              conversations_error: option.Some(
                option.unwrap(page.error, "the reader could not read the conversations"),
              ),
            )
          #(model.Model(..current, browser: browser), effect.none())
        }
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.ConversationChosen(id) -> {
      let next = model.Model(..current, browser: model.select_conversation(current.browser, id))
      #(next, load_browser(next))
    }
    model.BrowserLogsArrived(body) -> {
      case decode.logs(body) {
        Ok(page) if page.ok -> {
          let previous = current.browser.stream |> option.unwrap(model.empty_logs())
          let stream =
            model.Logs(
              entries: page.entries,
              next_before: page.next_before,
              // A window around a hit is not a tail: the poll must not move the
              // rows out from under the reader while they are reading them.
              tailing: current.browser.anchor == option.None,
              appending: False,
              spills: previous.spills,
              error: option.None,
            )
          let browser = model.Browser(..current.browser, stream: option.Some(stream))
          #(model.Model(..current, browser: browser), effect.none())
        }
        Ok(page) -> {
          let previous = current.browser.stream |> option.unwrap(model.empty_logs())
          let stream =
            model.Logs(
              ..previous,
              appending: False,
              error: option.Some(
                option.unwrap(page.error, "the reader could not read the ledger"),
              ),
            )
          let browser = model.Browser(..current.browser, stream: option.Some(stream))
          #(model.Model(..current, browser: browser), effect.none())
        }
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.HitChosen(conversation, entry) -> {
      let browser = model.jump_to_hit(current.browser, conversation, entry)
      let next = model.Model(..current, tab: model.BrowserTab, browser: browser)
      #(next, load_browser(next))
    }
    model.BrowserTailRequested -> {
      let next = model.Model(..current, browser: model.tail_conversation(current.browser))
      #(next, load_browser(next))
    }
    model.SearchChanged(query) -> {
      // Typing is not searching: the hits on screen keep answering the query they
      // came from until Enter is pressed.
      let search = model.Search(..current.browser.search, query: query)
      #(
        model.Model(..current, browser: model.Browser(..current.browser, search: search)),
        effect.none(),
      )
    }
    model.SearchKeyed(key) -> {
      case string.lowercase(key) {
        "enter" -> submit_search(current)
        _ -> #(current, effect.none())
      }
    }
    model.SearchSubmitted -> submit_search(current)
    model.SearchArrived(body) -> {
      case decode.search(body) {
        Ok(page) if page.ok -> #(with_hits(current, page.hits, option.None), effect.none())
        Ok(page) ->
          #(
            with_hits(
              current,
              page.hits,
              option.Some(option.unwrap(page.error, "the search failed")),
            ),
            effect.none(),
          )
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
  }
}

// --- the logs tab: state transitions --------------------------------------

/// A filter change starts the page over: the row set is the answer to a
/// different question, so the old rows are not the ones to keep.
fn refilter(current: model.Model, filters: model.LogFilters) -> #(model.Model, effect.Effect(model.Msg)) {
  let next = model.Model(..current, filters: filters, logs: option.Some(model.empty_logs()))
  #(next, reload(next))
}

fn with_logs(current: model.Model, logs: model.Logs) -> model.Model {
  model.Model(..current, logs: option.Some(logs))
}

fn with_logs_error(current: model.Model, problem: String) -> model.Model {
  let previous = current.logs |> option.unwrap(model.empty_logs())
  with_logs(
    current,
    model.Logs(..previous, appending: False, error: option.Some(problem)),
  )
}

/// A page arrived: it replaces the rows when it is the tail of the log, and
/// appends when it was asked for with a cursor. Duplicates are dropped, so an
/// overlapping older page cannot repeat a row.
fn with_page(current: model.Model, page: decode.LogsPage) -> model.Model {
  let previous = current.logs |> option.unwrap(model.empty_logs())
  let entries = case previous.appending {
    True -> list.append(previous.entries, page.entries)
    False -> page.entries
  }
  with_logs(
    current,
    model.Logs(
      entries: dedupe(entries),
      next_before: page.next_before,
      tailing: !previous.appending,
      appending: False,
      spills: previous.spills,
      error: option.None,
    ),
  )
}

fn dedupe(entries: List(model.LogEntry)) -> List(model.LogEntry) {
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
fn with_spill(current: model.Model, id: Int, text: String) -> model.Model {
  let previous = current.logs |> option.unwrap(model.empty_logs())
  let rest = list.filter(previous.spills, fn(pair) { pair.0 != id })
  let logs = model.Logs(..previous, spills: [#(id, text), ..rest])
  let browser = case current.browser.stream {
    option.None -> current.browser
    option.Some(stream) -> {
      let kept = list.filter(stream.spills, fn(pair) { pair.0 != id })
      let stream = model.Logs(..stream, spills: [#(id, text), ..kept])
      model.Browser(..current.browser, stream: option.Some(stream))
    }
  }
  model.Model(..current, logs: option.Some(logs), browser: browser)
}

// --- the logs tab: effects ------------------------------------------------

/// Should the poll refresh the LOGS page? Only while it shows the newest rows.
fn tail_active(current: model.Model) -> Bool {
  case current.tab, current.logs {
    model.LogsTab, option.Some(logs) -> logs.tailing
    model.LogsTab, option.None -> True
    _, _ -> False
  }
}

/// Should the poll refresh the BROWSER pane? While it follows the tail of a
/// selected space — not while it is a window around a landed hit.
fn browser_tail_active(current: model.Model) -> Bool {
  case current.tab {
    model.BrowserTab ->
      current.browser.selected != option.None && current.browser.anchor == option.None
    _ -> False
  }
}

fn reload(current: model.Model) -> effect.Effect(model.Msg) {
  load_page(current.filters, option.None, current.mode)
}

fn load_page(
  filters: model.LogFilters,
  before: option.Option(Int),
  mode: model.Mode,
) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case mode {
      model.FakeMode -> dispatch(model.LogsArrived(fake.logs_json(filters, ffi.now_ms() / poll_interval_ms)))
      model.LiveMode -> {
        let url = model.logs_path(filters, before, model.log_limit)
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

fn load_spill(id: Int, path: String, mode: model.Mode) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case mode {
      model.FakeMode -> dispatch(model.SpillArrived(id, fake.spill_json()))
      model.LiveMode ->
        ffi.fetch_text(
          "/api/spill?path=" <> model.url_encode(path),
          fn(body) { dispatch(model.SpillArrived(id, body)) },
          fn(problem) { dispatch(model.SpillFailed(id, problem)) },
        )
    }
    Nil
  })
}

// --- the browser tab: state transitions and effects ----------------------

fn with_hits(
  current: model.Model,
  hits: List(model.SearchHit),
  problem: option.Option(String),
) -> model.Model {
  let search =
    model.Search(..current.browser.search, hits: hits, loading: False, error: problem)
  model.Model(..current, browser: model.Browser(..current.browser, search: search))
}

/// Enter (or the button): search once for what is in the box. An empty box is a
/// mistake, not a query, so it says so rather than searching for everything.
fn submit_search(current: model.Model) -> #(model.Model, effect.Effect(model.Msg)) {
  let asked = string.trim(current.browser.search.query)
  case asked {
    "" -> {
      let search =
        model.Search(
          ..current.browser.search,
          loading: False,
          error: option.Some("type something to search for"),
        )
      #(
        model.Model(..current, browser: model.Browser(..current.browser, search: search)),
        effect.none(),
      )
    }
    _ -> {
      let search =
        model.Search(..current.browser.search, asked: asked, loading: True, error: option.None)
      let next = model.Model(..current, browser: model.Browser(..current.browser, search: search))
      #(next, run_search(asked, current.mode))
    }
  }
}

fn load_conversations(mode: model.Mode) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case mode {
      model.FakeMode -> dispatch(model.ConversationsArrived(fake.conversations_json()))
      model.LiveMode ->
        ffi.fetch_text(
          "/api/conversations",
          fn(body) { dispatch(model.ConversationsArrived(body)) },
          fn(problem) { dispatch(model.Failed(problem)) },
        )
    }
    Nil
  })
}

/// The selected space's stream: the tail, or the window around a landed hit.
fn load_browser(current: model.Model) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case current.browser.selected {
      option.None -> Nil
      option.Some(id) -> {
        case current.mode {
          model.FakeMode ->
            dispatch(
              model.BrowserLogsArrived(
                fake.browser_logs_json(id, current.filters, ffi.now_ms() / poll_interval_ms),
              ),
            )
          model.LiveMode ->
            ffi.fetch_text(
              model.logs_path_for(
                current.filters,
                option.Some(id),
                option.None,
                model.log_limit,
                current.browser.anchor,
              ),
              fn(body) { dispatch(model.BrowserLogsArrived(body)) },
              fn(problem) { dispatch(model.Failed(problem)) },
            )
        }
        Nil
      }
    }
  })
}

fn run_search(query: String, mode: model.Mode) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case mode {
      model.FakeMode -> dispatch(model.SearchArrived(fake.search_json(query)))
      model.LiveMode ->
        ffi.fetch_text(
          model.search_path(query, model.search_limit),
          fn(body) { dispatch(model.SearchArrived(body)) },
          fn(problem) { dispatch(model.Failed(problem)) },
        )
    }
    Nil
  })
}

/// One poll of the browser tab: the rail always, the pane only while it tails.
fn poll_browser(current: model.Model, dispatch: fn(model.Msg) -> Nil) -> Nil {
  ffi.fetch_text(
    "/api/conversations",
    fn(body) { dispatch(model.ConversationsArrived(body)) },
    fn(problem) { dispatch(model.Failed(problem)) },
  )
  case current.browser.selected {
    option.Some(id) ->
      ffi.fetch_text(
        model.logs_path_for(
          current.filters,
          option.Some(id),
          option.None,
          model.log_limit,
          current.browser.anchor,
        ),
        fn(body) { dispatch(model.BrowserLogsArrived(body)) },
        fn(problem) { dispatch(model.Failed(problem)) },
      )
    option.None -> Nil
  }
  Nil
}

/// The queue's error lines are part of `queue` but the decoders keep them
/// separate (they are a list of records, not scalars): keep the previous list
/// when the new payload has none, so a terse response never blanks the card.
fn queue_with_errors(current: model.Model, queue: model.Queue) -> model.Queue {
  case queue.errors {
    [] ->
      case current.queue {
        option.Some(previous) -> model.Queue(..queue, errors: previous.errors)
        option.None -> queue
      }
    _ -> queue
  }
}

fn with_spend(current: model.Model, spend: model.Spend) -> model.Model {
  let sample = model.Sample(
    at: ffi.now_ms(),
    entries: case current.vitals {
      option.Some(vitals) -> option.unwrap(vitals.entries, 0)
      option.None -> 0
    },
    running: case current.queue {
      option.Some(queue) -> option.unwrap(queue.running, 0)
      option.None -> 0
    },
    requests: option.unwrap(spend.requests, 0),
  )
  model.Model(
    ..current,
    spend: option.Some(spend),
    samples: model.push_sample(current.samples, sample),
  )
}

fn fail(current: model.Model, problem: String) -> model.Model {
  model.Model(..current, error: option.Some(problem), polls: current.polls + 1)
}

fn toggle(mode: model.Mode) -> model.Mode {
  case mode {
    model.LiveMode -> model.FakeMode
    model.FakeMode -> model.LiveMode
  }
}

/// One tick: the two dashboard endpoints, plus the logs page while the LOGS tab
/// is open and still at the newest row.
fn poll(current: model.Model) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case current.mode {
      model.FakeMode ->
        // Fixtures go through the same decoders as the reader's responses.
        fixtures_tick(current, dispatch)
      model.LiveMode -> {
        ffi.fetch_text(
          "/api/state",
          fn(body) { dispatch(model.StateArrived(body)) },
          fn(problem) { dispatch(model.Failed(problem)) },
        )
        ffi.fetch_text(
          "/api/spend",
          fn(body) { dispatch(model.SpendArrived(body)) },
          fn(_problem) { Nil },
        )
        case tail_active(current) {
          True ->
            ffi.fetch_text(
              model.logs_path(current.filters, option.None, model.log_limit),
              fn(body) { dispatch(model.LogsArrived(body)) },
              fn(problem) { dispatch(model.Failed(problem)) },
            )
          False -> Nil
        }
        case browser_tail_active(current) {
          True -> poll_browser(current, dispatch)
          False -> Nil
        }
      }
    }
    Nil
  })
}

/// The fake mode's "network": fixtures for the current poll count, replayed
/// through `dispatch` as if they had arrived from the reader.
fn fixtures_tick(current: model.Model, dispatch: fn(model.Msg) -> Nil) -> Nil {
  let poll = ffi.now_ms() / poll_interval_ms
  dispatch(model.StateArrived(fake.state_json(poll)))
  dispatch(model.SpendArrived(fake.spend_json(poll)))
  case tail_active(current) {
    True -> dispatch(model.LogsArrived(fake.logs_json(current.filters, poll)))
    False -> Nil
  }
  case browser_tail_active(current) {
    True -> {
      dispatch(model.ConversationsArrived(fake.conversations_json()))
      case current.browser.selected {
        option.Some(id) ->
          dispatch(model.BrowserLogsArrived(fake.browser_logs_json(id, current.filters, poll)))
        option.None -> Nil
      }
    }
    False -> Nil
  }
  Nil
}

