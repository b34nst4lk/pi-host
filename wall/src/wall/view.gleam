//// The wall's frame: the header with its tabs, the error banner, the tab switch
//// and the footer. The panels themselves live in `dashboard`, `logs_view` and
//// `browser_view`, so each one can be read (and changed) on its own.
////
//// One view function, so a tab switch is one message and no reload. LOGS and the
//// browser's pane render rows with the same `log_rows`, so the expanders, the
//// spill reader and the pretty record are one code path; the browser passes
//// `RowOptions(dividers: True, anchor: …)`.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/event
import wall/browser_view
import wall/ui
import wall/dashboard
import wall/logs_view
import wall/logs
import wall/model

pub fn view(current: model.Model) -> Element(model.Msg) {
  html.div([attribute.class("wall")], [
    header(current),
    banner(current.error),
    case current.tab {
      logs.Dashboard -> dashboard.dashboard(current)
      logs.LogsTab -> logs_view.logs_tab(current)
      logs.BrowserTab -> browser_view.browser_tab(current)
      logs.ProjectsTab -> dashboard.projects_tab(current)
    },
    footer(current),
  ])
}


fn header(current: model.Model) -> Element(model.Msg) {
  html.header([attribute.class("head")], [
    html.h1([attribute.class("title")], [text("THE WALL")]),
    html.nav(
      [attribute.class("tabs")],
      list.map([logs.Dashboard, logs.LogsTab, logs.BrowserTab, logs.ProjectsTab], fn(tab) {
        html.button(
          [
            attribute.attribute("type", "button"),
            attribute.class(tab_class(current.tab, tab)),
            event.on_click(model.TabChosen(tab)),
          ],
          [text(string.uppercase(logs.tab_label(tab)))],
        )
      }),
    ),
    html.span([attribute.class("mode")], [text(mode_label(current.mode))]),
  ])
}

fn tab_class(showing: logs.Tab, tab: logs.Tab) -> String {
  case showing == tab {
    True -> "tab active"
    False -> "tab"
  }
}

fn mode_label(mode: model.Mode) -> String {
  case mode {
    model.LiveMode -> "live"
    model.FakeMode -> "fake data"
  }
}

fn banner(problem: Option(String)) -> Element(model.Msg) {
  case problem {
    None -> ui.element_none()
    Some(message) -> html.div([attribute.class("banner")], [text(message)])
  }
}


fn footer(current: model.Model) -> Element(model.Msg) {
  html.footer([attribute.class("foot")], [
    text("poll #" <> int.to_string(current.polls) <> " · contract v1"),
  ])
}

