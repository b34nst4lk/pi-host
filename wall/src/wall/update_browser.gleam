//// The BROWSER tab's half of `update`: the picker, search submission, landing on
//// a hit, back to the tail, and the effects each of those asks for.

import gleam/option
import gleam/string
import lustre/effect
import wall/browser
import wall/fake
import wall/ffi
import wall/logs
import wall/model

// --- the browser tab: state transitions and effects ----------------------

pub fn with_hits(
  current: model.Model,
  hits: List(browser.SearchHit),
  problem: option.Option(String),
) -> model.Model {
  let search =
    browser.Search(..current.browser.search, hits: hits, loading: False, error: problem)
  model.Model(..current, browser: browser.Browser(..current.browser, search: search))
}

/// Enter (or the button): search once for what is in the box. An empty box is a
/// mistake, not a query, so it says so rather than searching for everything.
pub fn submit_search(current: model.Model) -> #(model.Model, effect.Effect(model.Msg)) {
  let asked = string.trim(current.browser.search.query)
  case asked {
    "" -> {
      let search =
        browser.Search(
          ..current.browser.search,
          loading: False,
          error: option.Some("type something to search for"),
        )
      #(
        model.Model(..current, browser: browser.Browser(..current.browser, search: search)),
        effect.none(),
      )
    }
    _ -> {
      let search =
        browser.Search(..current.browser.search, asked: asked, loading: True, error: option.None)
      let next = model.Model(..current, browser: browser.Browser(..current.browser, search: search))
      #(next, run_search(asked, current.mode))
    }
  }
}

pub fn load_conversations(mode: model.Mode) -> effect.Effect(model.Msg) {
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
pub fn load_browser(current: model.Model) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case current.browser.selected {
      option.None -> Nil
      option.Some(id) -> {
        case current.mode {
          model.FakeMode ->
            dispatch(
              model.BrowserLogsArrived(
                fake.browser_logs_json(id, current.filters, ffi.now_ms() / model.poll_interval_ms),
              ),
            )
          model.LiveMode ->
            ffi.fetch_text(
              browser.logs_path_for(
                current.filters,
                option.Some(id),
                option.None,
                logs.log_limit,
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

pub fn run_search(query: String, mode: model.Mode) -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    case mode {
      model.FakeMode -> dispatch(model.SearchArrived(fake.search_json(query)))
      model.LiveMode ->
        ffi.fetch_text(
          browser.search_path(query, logs.search_limit),
          fn(body) { dispatch(model.SearchArrived(body)) },
          fn(problem) { dispatch(model.Failed(problem)) },
        )
    }
    Nil
  })
}

/// One poll of the browser tab: the rail always, the pane only while it tails.
pub fn poll_browser(current: model.Model, dispatch: fn(model.Msg) -> Nil) -> Nil {
  ffi.fetch_text(
    "/api/conversations",
    fn(body) { dispatch(model.ConversationsArrived(body)) },
    fn(problem) { dispatch(model.Failed(problem)) },
  )
  case current.browser.selected {
    option.Some(id) ->
      ffi.fetch_text(
        browser.logs_path_for(
          current.filters,
          option.Some(id),
          option.None,
          logs.log_limit,
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
