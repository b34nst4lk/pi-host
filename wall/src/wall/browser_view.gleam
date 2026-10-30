//// The BROWSER tab: the search box and its hits, the conversation rail, and the
//// selected space's stream. Read-only rendering — the transitions live in
//// `wall.gleam`.

import gleam/list
import gleam/option.{None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/event
import wall/browser
import wall/logs
import wall/logs_view
import wall/model
import wall/ui

// --- the browser tab ------------------------------------------------------

/// Search box on top, jump list under it, then rail + pane. The search is over
/// every conversation, so a hit can be in a space that is not the one on screen.
pub fn browser_tab(current: model.Model) -> Element(model.Msg) {
  let browser = current.browser
  html.section([attribute.class("browser")], [
    browser_search(browser.search),
    browser_hits(browser.search),
    html.div([attribute.class("browser-body")], [
      conversation_rail(browser),
      browser_pane(browser),
    ]),
  ])
}

pub fn browser_search(search: browser.Search) -> Element(model.Msg) {
  html.div([attribute.class("log-controls browser-search")], [
    html.input([
      attribute.attribute("type", "search"),
      attribute.attribute("placeholder", "search every conversation — enter"),
      attribute.attribute("value", search.query),
      attribute.class("search"),
      event.on_input(model.SearchChanged),
      // Enter submits; every other key just types. The box answers no question
      // until it is asked, and the hits list keeps saying what it answered.
      event.on_keydown(model.SearchKeyed),
    ]),
    html.button(
      [
        attribute.attribute("type", "button"),
        attribute.class("older"),
        event.on_click(model.SearchSubmitted),
      ],
      [text("search")],
    ),
    html.span([attribute.class("log-line")], [text(browser.search_line(search))]),
  ])
}

pub fn browser_hits(search: browser.Search) -> Element(model.Msg) {
  case search.asked, search.hits, search.error {
    "", [], None -> ui.element_none()
    _, _, _ ->
      html.div([attribute.class("hits")], [
        case search.error {
          Some(problem) -> html.p([attribute.class("banner")], [text(problem)])
          None -> ui.element_none()
        },
        html.div([attribute.class("hit-rows")], list.map(search.hits, hit_row)),
      ])
  }
}

/// One hit: which space, when, which kind, and the matched line. Clicking it
/// selects that space and opens a window around the entry.
pub fn hit_row(hit: browser.SearchHit) -> Element(model.Msg) {
  html.button(
    [
      attribute.attribute("type", "button"),
      attribute.class("hit"),
      event.on_click(model.HitChosen(hit.conversation, hit.entry)),
    ],
    [
      html.span([attribute.class("hit-space")], [text(hit.conversation_title)]),
      html.span([attribute.class("hit-at")], [text(logs.short_stamp(hit.at))]),
      html.span([attribute.class("log-kind " <> logs_view.kind_class(hit.kind))], [text(hit.kind)]),
      html.span([attribute.class("hit-text")], [text(clip(hit.text, 160))]),
    ],
  )
}

/// A hit line is one line: the full text is in the row you land on.
pub fn clip(text: String, limit: Int) -> String {
  case string.length(text) > limit {
    True -> string.slice(text, 0, limit) <> "…"
    False -> text
  }
}

pub fn conversation_rail(browser: browser.Browser) -> Element(model.Msg) {
  html.div([attribute.class("rail")], [
    html.p([attribute.class("rail-head")], [text("spaces")]),
    case browser.conversations_error {
      Some(problem) -> html.p([attribute.class("banner")], [text(problem)])
      None -> ui.element_none()
    },
    case browser.order_conversations(browser.conversations) {
      [] -> html.p([attribute.class("muted")], [text("no conversations yet")])
      items ->
        html.div(
          [attribute.class("rail-cards")],
          list.map(items, fn(item) { conversation_card(browser, item) }),
        )
    },
  ])
}

/// One space: title, the same state badge the AGENTS card uses, how many entries
/// it holds and when it ran. The main conversation is pinned first by
/// `browser.order_conversations`.
pub fn conversation_card(browser: browser.Browser, item: browser.Conversation) -> Element(model.Msg) {
  html.button(
    [
      attribute.attribute("type", "button"),
      attribute.class(browser.space_class(browser.selected, item.id)),
      event.on_click(model.ConversationChosen(item.id)),
    ],
    [
      html.span([attribute.class("space-head")], [
        html.span([attribute.class("space-title")], [text(item.title)]),
        html.span([attribute.class(model.agent_state_class(item.state))], [
          text(model.agent_state_label(item.state)),
        ]),
      ]),
      html.span([attribute.class("space-meta")], [text(browser.conversation_line(item))]),
      html.span([attribute.class("space-meta")], [text(browser.conversation_span(item))]),
    ],
  )
}

pub fn browser_pane(browser: browser.Browser) -> Element(model.Msg) {
  let logs = ui.or_default_logs(browser.stream)
  html.div([attribute.class("pane")], [
    html.div([attribute.class("pane-head")], [
      html.h2([attribute.class("pane-title")], [text(pane_title(browser))]),
      case browser.anchor {
        Some(_) ->
          html.button(
            [
              attribute.attribute("type", "button"),
              attribute.class("older"),
              event.on_click(model.BrowserTailRequested),
            ],
            [text("back to the tail")],
          )
        None -> ui.element_none()
      },
      html.span([attribute.class("log-line")], [text(logs.logs_line(logs))]),
    ]),
    case logs.error {
      Some(problem) -> html.p([attribute.class("banner")], [text(problem)])
      None -> ui.element_none()
    },
    logs_view.log_rows(logs, browser.browser_options(browser.anchor)),
    case logs.next_before {
      Some(_) -> html.p([attribute.class("muted")], [text("older entries available")])
      None -> ui.element_none()
    },
  ])
}

pub fn pane_title(item: browser.Browser) -> String {
  case browser.selected_conversation(item) {
    None -> "select a space"
    Some(space) -> space.title <> " · " <> model.agent_state_label(space.state)
  }
}

