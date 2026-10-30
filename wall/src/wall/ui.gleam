//// The small pieces every tab shares: a section title, a labelled statistic,
//// the sparkline, the budget bar, the `—` defaults.
////
//// They live in one module so the dashboard, the logs tab and the browser tab
//// can all be their own module without importing each other.

import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/element/svg
import wall/logs
import wall/model

// --- small pieces ---------------------------------------------------------

pub fn section_title(label: String) -> Element(model.Msg) {
  html.h2([attribute.class("card-title")], [text(label)])
}

pub fn stat(label: String, value: String) -> Element(model.Msg) {
  html.div([attribute.class("stat")], [
    html.span([attribute.class("stat-label")], [text(label)]),
    html.span([attribute.class("stat-value")], [text(value)]),
  ])
}

pub fn sparkline(current: model.Model, pick: fn(model.Sample) -> Int) -> Element(model.Msg) {
  let values = current.samples |> list.map(fn(sample) { int.to_float(pick(sample)) })
  let points = model.sparkline_points(values, 100, 24) |> model.polyline_points
  case points {
    "" -> html.p([attribute.class("muted")], [text("collecting…")])
    points ->
      svg.svg(
        [
          attribute.class("spark"),
          attribute.attribute("viewBox", "0 0 100 24"),
          attribute.attribute("preserveAspectRatio", "none"),
        ],
        [
          svg.polyline([
            attribute.attribute("points", points),
            attribute.attribute("fill", "none"),
            attribute.attribute("stroke", "currentColor"),
            attribute.attribute("stroke-width", "1.5"),
            attribute.attribute("vector-effect", "non-scaling-stroke"),
          ]),
        ],
      )
  }
}

pub fn budget(label: String, fraction: Float, value: String) -> Element(model.Msg) {
  html.div([attribute.class("budget")], [
    html.div([attribute.class("budget-head")], [
      html.span([attribute.class("stat-label")], [text(label)]),
      html.span([attribute.class("stat-value")], [text(value)]),
    ]),
    html.div([attribute.class("budget-track")], [
      html.div(
        [
          attribute.class("budget-fill"),
          attribute.style("width", float.to_string(fraction *. 100.0) <> "%"),
        ],
        [],
      ),
    ]),
  ])
}

pub fn element_none() -> Element(model.Msg) {
  html.span([attribute.class("hidden")], [])
}

pub fn freshness_label(freshness: model.Freshness) -> String {
  case freshness {
    model.Live -> "live"
    model.Slow -> "slow"
    model.Stale -> "stale"
    model.Unknown -> "unknown"
  }
}

pub fn cache_class(spend: model.Spend) -> String {
  case spend.stale {
    True -> "badge stale"
    False ->
      case spend.cached {
        True -> "badge cached"
        False -> "badge"
      }
  }
}

pub fn cache_label(spend: model.Spend) -> String {
  case spend.stale, spend.cached {
    True, _ -> "stale cache"
    False, True -> "cached"
    False, False -> "fresh"
  }
}

pub fn short(text_value: String, limit: Int) -> String {
  case string.length(text_value) > limit {
    True -> string.slice(text_value, 0, limit) <> "…"
    False -> text_value
  }
}

pub fn float_round(value: Float) -> Int {
  float.round(value)
}

pub fn or_default_vitals(vitals: Option(model.Vitals)) -> model.Vitals {
  case vitals {
    Some(vitals) -> vitals
    None ->
      model.Vitals(
        entries: None,
        ledger_bytes: None,
        sync_state: model.Unknown,
        sync_age_s: None,
        sync_batch: None,
        sync_seq: None,
        errors_24h: None,
        last_error: None,
        daemon_uptime_s: None,
        container_uptime_s: None,
      )
  }
}

pub fn or_default_agents(agents: Option(model.Agents)) -> model.Agents {
  case agents {
    Some(agents) -> agents
    None -> model.empty_agents()
  }
}

pub fn or_default_queue(queue: Option(model.Queue)) -> model.Queue {
  case queue {
    Some(queue) -> queue
    None -> model.Queue(inbox_depth: None, running: None, pending: None, unanswered: None, errors: [])
  }
}


/// The logs a tab renders when nothing has arrived yet.
pub fn or_default_logs(value: Option(logs.Logs)) -> logs.Logs {
  case value {
    Some(value) -> value
    None -> logs.empty_logs()
  }
}

