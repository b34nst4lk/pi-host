//// The LOGS tab: a filter row, then newest-first rows. Every row is a
//// `<details>` whose first child is the human line — so the raw record is one
//// click away and never in the way.

import gleam/list
import gleam/option.{type Option, None, Some}
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/event
import wall/browser
import wall/logs
import wall/model
import wall/pretty
import wall/ui

pub fn logs_tab(current: model.Model) -> Element(model.Msg) {
  let logs = or_default_logs(current.logs)
  html.section([attribute.class("logs")], [
    html.div([attribute.class("log-controls")], [
      html.div(
        [attribute.class("chips")],
        list.map([logs.BothWays, logs.Incoming, logs.Outgoing], fn(direction) {
          html.button(
            [
              attribute.attribute("type", "button"),
              attribute.class(chip_class(current.filters.direction == direction)),
              event.on_click(model.DirectionChosen(direction)),
            ],
            [text(logs.direction_label(direction))],
          )
        }),
      ),
      html.div([attribute.class("chips")], kind_chips(current.filters)),
      html.input([
        attribute.attribute("type", "search"),
        attribute.attribute("placeholder", "search the ledger"),
        attribute.attribute("value", current.filters.query),
        attribute.class("search"),
        event.on_input(model.QueryChanged),
      ]),
      html.button(
        [
          attribute.attribute("type", "button"),
          attribute.class("older"),
          event.on_click(model.OlderRequested),
        ],
        [text("older")],
      ),
    ]),
    html.p([attribute.class("log-line")], [text(logs.logs_line(logs))]),
    case logs.error {
      Some(problem) -> html.p([attribute.class("banner")], [text(problem)])
      None -> ui.element_none()
    },
    log_rows(logs, browser.log_options()),
    case logs.next_before {
      Some(_) -> html.p([attribute.class("muted")], [text("older entries available")])
      None -> ui.element_none()
    },
  ])
}

pub fn kind_chips(filters: logs.LogFilters) -> List(Element(model.Msg)) {
  list.map(logs.log_kinds, fn(kind) {
    html.button(
      [
        attribute.attribute("type", "button"),
        attribute.class(chip_class(list.contains(filters.kinds, kind))),
        event.on_click(model.KindToggled(kind)),
      ],
      [text(kind)],
    )
  })
}

pub fn chip_class(active: Bool) -> String {
  case active {
    True -> "chip active"
    False -> "chip"
  }
}

pub fn log_rows(logs: logs.Logs, options: browser.RowOptions) -> Element(model.Msg) {
  case logs.entries {
    [] -> html.p([attribute.class("muted")], [text("no entries match")])
    entries ->
      html.div([attribute.class("log-rows")], stream_rows(logs, entries, options))
  }
}

/// The one place rows and dividers are interleaved, so LOGS and the browser pane
/// cannot drift apart. The fold carries how many compaction dividers have been
/// drawn so far: the first one says history *begins*, later ones say it
/// *continues*, and nothing above or below is collapsed.
pub fn stream_rows(
  logs: logs.Logs,
  entries: List(logs.LogEntry),
  options: browser.RowOptions,
) -> List(Element(model.Msg)) {
  let #(rendered, _) = list.fold(entries, #([], 0), fn(state, entry) {
    let #(done, seen) = state
    case options.dividers && browser.is_divider(entry.kind) {
      True -> #([divider_row(entry, seen), ..done], seen + 1)
      False -> #([log_row(logs, entry, options), ..done], seen)
    }
  })
  list.reverse(rendered)
}

/// A compaction boundary: a full-width rule with the summary one click away. The
/// entries on either side stay in the same list, in the same order.
pub fn divider_row(entry: logs.LogEntry, seen: Int) -> Element(model.Msg) {
  html.div([attribute.class("log-divider")], [
    html.span([attribute.class("divider-rule")], [text(browser.divider_label(seen))]),
    html.details([attribute.class("divider-summary")], [
      html.summary([attribute.class("divider-head")], [
        text("summary · " <> logs.short_time(entry.at)),
      ]),
      html.pre([attribute.class("log-raw")], [text(pretty.json(entry.raw))]),
    ]),
    html.span([attribute.class("divider-rule")], []),
  ])
}

pub fn log_row(
  logs: logs.Logs,
  entry: logs.LogEntry,
  options: browser.RowOptions,
) -> Element(model.Msg) {
  html.details([attribute.class(row_class(options, entry))], [
    html.summary([attribute.class("log-head")], [
      html.span([attribute.class("log-at")], [text(logs.short_time(entry.at))]),
      html.span([attribute.class("log-kind " <> kind_class(entry.kind))], [text(entry.kind)]),
      case entry.thread {
        Some(name) -> html.span([attribute.class("log-thread")], [text("@" <> name)])
        None -> ui.element_none()
      },
      html.span([attribute.class("log-text")], [text(entry.text)]),
      case browser.is_anchor(options, entry) {
        True -> html.span([attribute.class("log-hit")], [text("hit")])
        False -> ui.element_none()
      },
    ]),
    // The record is stored compact on purpose; indenting it here is a display
    // choice and never leaves the browser.
    html.pre([attribute.class("log-raw")], [text(pretty.json(entry.raw))]),
    spill_block(logs, entry),
  ])
}

/// The row a search hit landed on is marked: landing in a window of ±25 is only
/// useful if you can see which one you asked for.
pub fn row_class(options: browser.RowOptions, entry: logs.LogEntry) -> String {
  case browser.is_anchor(options, entry) {
    True -> "log-row hit"
    False -> "log-row"
  }
}

/// A row whose record spilled its full output: the expander fetches
/// `/api/spill?path=…` once, then shows what came back (or why it did not).
pub fn spill_block(logs: logs.Logs, entry: logs.LogEntry) -> Element(model.Msg) {
  case entry.spill {
    None -> ui.element_none()
    Some(path) ->
      html.details([attribute.class("log-spill")], [
        html.summary(
          [
            attribute.class("spill-head"),
            event.on_click(model.SpillRequested(entry.id, path)),
          ],
          [text("full output · " <> path)],
        ),
        html.pre([attribute.class("spill-body")], [text(spill_text(logs, entry.id))]),
      ])
  }
}

pub fn spill_text(logs: logs.Logs, id: Int) -> String {
  case list.key_find(logs.spills, id) {
    Ok(text) -> text
    Error(_) -> "press to load"
  }
}

pub fn kind_class(kind: String) -> String {
  case kind {
    "pi.user" -> "kind-user"
    "pi.assistant" -> "kind-assistant"
    "pi.tool-result" -> "kind-tool"
    "pi.compaction" -> "kind-compaction"
    "pi.system" -> "kind-system"
    _ -> "kind-app"
  }
}

pub fn or_default_logs(logs: Option(logs.Logs)) -> logs.Logs {
  case logs {
    Some(logs) -> logs
    None -> logs.empty_logs()
  }
}


