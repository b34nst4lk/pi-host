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
import wall/browser
import wall/decode
import wall/fake
import wall/ffi
import wall/logs
import wall/model
import wall/update_browser
import wall/update_logs
import wall/view

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
        logs.LogsTab -> update_logs.reload(next)
        // The rail first: its arrival picks the main conversation and asks for
        // that stream, so the tab never opens on an empty pane.
        logs.BrowserTab -> effect.batch([update_browser.load_conversations(next.mode), update_browser.load_browser(next)])
        // The PROJECTS pane renders from the agent cards the dashboard poll already
        // carries, so opening it needs no request of its own.
        logs.Dashboard -> effect.none()
        logs.ProjectsTab -> effect.none()
      }
      #(next, load)
    }
    model.DirectionChosen(direction) ->
      update_logs.refilter(current, logs.LogFilters(..current.filters, direction: direction))
    model.KindToggled(kind) -> {
      let kinds = case list.contains(current.filters.kinds, kind) {
        True -> list.filter(current.filters.kinds, fn(other) { other != kind })
        False -> list.append(current.filters.kinds, [kind])
      }
      update_logs.refilter(current, logs.LogFilters(..current.filters, kinds: kinds))
    }
    model.QueryChanged(query) ->
      update_logs.refilter(current, logs.LogFilters(..current.filters, query: query))
    model.OlderRequested -> {
      case current.logs {
        option.Some(logs) if logs.next_before != option.None ->
          // Paging back stops the tail: the poll must not yank the page the
          // reader is walking through.
          #(
            update_logs.with_logs(
              current,
              logs.Logs(..logs, tailing: False, appending: True),
            ),
            update_logs.load_page(current.filters, logs.next_before, current.mode),
          )
        _ -> #(current, effect.none())
      }
    }
    model.LogsArrived(body) -> {
      case decode.logs(body) {
        Ok(page) if page.ok -> #(update_logs.with_page(current, page), effect.none())
        Ok(page) ->
          #(
            update_logs.with_logs_error(
              current,
              option.unwrap(page.error, "the reader could not read the ledger"),
            ),
            effect.none(),
          )
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.SpillRequested(id, path) -> #(current, update_logs.load_spill(id, path, current.mode))
    model.SpillArrived(id, body) -> {
      case decode.spill(body) {
        Ok(text) -> #(update_logs.with_spill(current, id, text), effect.none())
        Error(problem) -> #(update_logs.with_spill(current, id, "error: " <> problem), effect.none())
      }
    }
    model.SpillFailed(id, problem) -> #(update_logs.with_spill(current, id, "error: " <> problem), effect.none())

    // --- the browser tab -------------------------------------------------
    model.ConversationsArrived(body) -> {
      case decode.conversations(body) {
        Ok(page) if page.ok -> {
          let items = browser.order_conversations(page.items)
          let browser =
            browser.Browser(..current.browser, conversations: items, conversations_error: option.None)
          // Nothing selected yet: pick the first card, which the ordering pins to
          // main. A picker that opens with nothing on screen is a puzzle.
          case browser.selected {
            option.None ->
              case list.first(items) {
                Ok(first) -> {
                  let next =
                    model.Model(..current, browser: browser.select_conversation(browser, first.id))
                  #(next, update_browser.load_browser(next))
                }
                Error(_) -> #(model.Model(..current, browser: browser), effect.none())
              }
            option.Some(_) -> #(model.Model(..current, browser: browser), effect.none())
          }
        }
        Ok(page) -> {
          let browser =
            browser.Browser(
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
      let next = model.Model(..current, browser: browser.select_conversation(current.browser, id))
      #(next, update_browser.load_browser(next))
    }
    model.BrowserLogsArrived(body) -> {
      case decode.logs(body) {
        Ok(page) if page.ok -> {
          let previous = current.browser.stream |> option.unwrap(logs.empty_logs())
          let stream =
            logs.Logs(
              entries: page.entries,
              next_before: page.next_before,
              // A window around a hit is not a tail: the poll must not move the
              // rows out from under the reader while they are reading them.
              tailing: current.browser.anchor == option.None,
              appending: False,
              spills: previous.spills,
              error: option.None,
            )
          let browser = browser.Browser(..current.browser, stream: option.Some(stream))
          #(model.Model(..current, browser: browser), effect.none())
        }
        Ok(page) -> {
          let previous = current.browser.stream |> option.unwrap(logs.empty_logs())
          let stream =
            logs.Logs(
              ..previous,
              appending: False,
              error: option.Some(
                option.unwrap(page.error, "the reader could not read the ledger"),
              ),
            )
          let browser = browser.Browser(..current.browser, stream: option.Some(stream))
          #(model.Model(..current, browser: browser), effect.none())
        }
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.HitChosen(conversation, entry) -> {
      let browser = browser.jump_to_hit(current.browser, conversation, entry)
      let next = model.Model(..current, tab: logs.BrowserTab, browser: browser)
      #(next, update_browser.load_browser(next))
    }
    model.BrowserTailRequested -> {
      let next = model.Model(..current, browser: browser.tail_conversation(current.browser))
      #(next, update_browser.load_browser(next))
    }
    model.SearchChanged(query) -> {
      // Typing is not searching: the hits on screen keep answering the query they
      // came from until Enter is pressed.
      let search = browser.Search(..current.browser.search, query: query)
      #(
        model.Model(..current, browser: browser.Browser(..current.browser, search: search)),
        effect.none(),
      )
    }
    model.SearchKeyed(key) -> {
      case string.lowercase(key) {
        "enter" -> update_browser.submit_search(current)
        _ -> #(current, effect.none())
      }
    }
    model.SearchSubmitted -> update_browser.submit_search(current)
    model.SearchArrived(body) -> {
      case decode.search(body) {
        Ok(page) if page.ok -> #(update_browser.with_hits(current, page.hits, option.None), effect.none())
        Ok(page) ->
          #(
            update_browser.with_hits(
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
        case update_logs.tail_active(current) {
          True ->
            ffi.fetch_text(
              logs.logs_path(current.filters, option.None, logs.log_limit),
              fn(body) { dispatch(model.LogsArrived(body)) },
              fn(problem) { dispatch(model.Failed(problem)) },
            )
          False -> Nil
        }
        case update_logs.browser_tail_active(current) {
          True -> update_browser.poll_browser(current, dispatch)
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
  let poll = ffi.now_ms() / model.poll_interval_ms
  dispatch(model.StateArrived(fake.state_json(poll)))
  dispatch(model.SpendArrived(fake.spend_json(poll)))
  case update_logs.tail_active(current) {
    True -> dispatch(model.LogsArrived(fake.logs_json(current.filters, poll)))
    False -> Nil
  }
  case update_logs.browser_tail_active(current) {
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
