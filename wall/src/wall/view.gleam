//// The wall's rendering: pure `Model -> Element`. No fetching, no timers, no
//// clock reads — everything the view needs is already in the model, which is why
//// `gleeunit` can assert on strings this module produces.
////
//// Layout: a header, an optional error banner, then a two-by-two grid of
//// VITALS / SPEND / AGENTS / QUEUE.

import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/element/svg
import wall/model

pub fn view(current: model.Model) -> Element(model.Msg) {
  html.div([attribute.class("wall")], [
    header(current),
    banner(current.error),
    html.div([attribute.class("grid")], [
      vitals_card(current),
      spend_card(current),
      agents_card(current),
      queue_card(current),
    ]),
    footer(current),
  ])
}

fn header(current: model.Model) -> Element(model.Msg) {
  html.header([attribute.class("head")], [
    html.h1([attribute.class("title")], [text("THE WALL")]),
    html.span([attribute.class("mode")], [text(mode_label(current.mode))]),
  ])
}

fn mode_label(mode: model.Mode) -> String {
  case mode {
    model.LiveMode -> "live"
    model.FakeMode -> "fake data"
  }
}

fn banner(problem: Option(String)) -> Element(model.Msg) {
  case problem {
    None -> element_none()
    Some(message) -> html.div([attribute.class("banner")], [text(message)])
  }
}

fn vitals_card(current: model.Model) -> Element(model.Msg) {
  let vitals = current.vitals |> or_default_vitals()
  html.section([attribute.class("card vitals")], [
    section_title("VITALS"),
    stat("ledger entries", model.format_count(vitals.entries)),
    stat("ledger size", model.format_bytes(vitals.ledger_bytes)),
    sparkline(current, fn(sample) { sample.entries }),
    stat("sync cursor", model.format_age(vitals.sync_age_s)),
    stat("sync state", freshness_label(vitals.sync_state)),
    stat("sync batch", case vitals.sync_batch {
      Some(batch) -> "#" <> short(batch, 18)
      None -> "—"
    }),
    stat("sync seq", model.format_count(vitals.sync_seq)),
    stat("daemon errors 24h", model.format_count(vitals.errors_24h)),
    stat("daemon uptime", model.format_age(vitals.daemon_uptime_s)),
    stat("container uptime", model.format_age(vitals.container_uptime_s)),
    case vitals.last_error {
      Some(message) -> html.p([attribute.class("last-error")], [text(message)])
      None -> element_none()
    },
  ])
}

fn spend_card(current: model.Model) -> Element(model.Msg) {
  html.section([attribute.class("card spend")], [
    section_title("SPEND"),
    case current.spend {
      None -> html.p([attribute.class("muted")], [text("no spend data yet")])
      Some(spend) -> {
        html.div([], [
          stat("requests 24h", model.format_count(spend.requests)),
          stat("input tokens", model.format_count(spend.input_tokens)),
          stat("output tokens", model.format_count(spend.output_tokens)),
          sparkline(current, fn(sample) { sample.requests }),
          budget(
            "upstream calls / min",
            model.budget_fraction(spend.used_in_window, spend.max_per_minute),
            model.format_count(spend.used_in_window)
            <> " / "
            <> model.format_count(spend.max_per_minute),
          ),
          budget(
            "balance used",
            case spend.percent_used {
              Some(percent) -> model.budget_fraction(Some(float_round(percent)), Some(100))
              None -> 0.0
            },
            model.format_percent(spend.percent_used),
          ),
          stat("balance", model.format_usd(spend.balance_usd)),
          html.span([attribute.class(cache_class(spend))], [
            text(cache_label(spend)),
          ]),
        ])
      }
    },
  ])
}

/// The AGENTS card: pi-spike, one card per named subagent (state badge + branch
/// + worktree + last answer entry), then the orphans — held anchors nothing
/// names, which are prunable and would otherwise be invisible.
fn agents_card(current: model.Model) -> Element(model.Msg) {
  let agents = current.agents |> or_default_agents()
  html.section([attribute.class("card agents")], [
    section_title("AGENTS"),
    html.p([attribute.class("work-line")], [text(model.work_line(agents))]),
    agent_entry("pi-spike", agents.spike_state, "main conversation", "", None, False),
    case agents.named {
      [] -> html.p([attribute.class("muted")], [text("no named subagents")])
      cards ->
        html.div([attribute.class("agents")], list.map(cards, fn(card) {
          agent_entry(card.name, card.state, card.branch, card.worktree, card.last_reply, True)
        }))
    },
    orphans_row(agents),
    case agents.retired {
      Some(count) if count > 0 -> html.p([attribute.class("muted")], [
        text(model.format_count(Some(count)) <> " retired anchor(s) not shown"),
      ])
      _ -> element_none()
    },
  ])
}

fn agent_entry(
  name: String,
  state: String,
  branch: String,
  worktree: String,
  last_reply: Option(Int),
  show_reply: Bool,
) -> Element(model.Msg) {
  html.div([attribute.class("agent")], [
    html.div([attribute.class("agent-head")], [
      html.span([attribute.class("agent-name")], [text(name)]),
      html.span([attribute.class(model.agent_state_class(state))], [
        text(model.agent_state_label(state)),
      ]),
    ]),
    case branch {
      "" -> element_none()
      branch -> html.div([attribute.class("agent-branch")], [text(branch)])
    },
    case worktree {
      "" -> element_none()
      worktree -> html.div([attribute.class("agent-worktree")], [text(worktree)])
    },
    case show_reply {
      False -> element_none()
      True ->
        html.div([attribute.class("agent-reply")], [
          text(case last_reply {
            Some(entry) -> "last answer #" <> int.to_string(entry)
            None -> "no answer yet"
          }),
        ])
    },
  ])
}

fn orphans_row(agents: model.Agents) -> Element(model.Msg) {
  case agents.orphans {
    [] -> html.p([attribute.class("muted")], [text("no orphans")])
    orphans ->
      html.div([attribute.class("orphans")], [
        html.span([attribute.class("orphan-count")], [
          text(model.orphan_summary(agents)),
        ]),
        html.span([attribute.class("orphan-ids")], [
          text(
            orphans
            |> list.map(fn(orphan) {
              case orphan.conversation {
                Some(conversation) ->
                  "#" <> int.to_string(orphan.anchor) <> " → c" <> int.to_string(conversation)
                None -> "#" <> int.to_string(orphan.anchor)
              }
            })
            |> string.join(", "),
          ),
        ]),
      ])
  }
}

fn queue_card(current: model.Model) -> Element(model.Msg) {
  let queue = current.queue |> or_default_queue()
  let agents = current.agents |> or_default_agents()
  html.section([attribute.class("card queue")], [
    section_title("QUEUE"),
    // Liveness lives in the agent cards now; this line is the run counter that
    // replaced "tasks running: N".
    html.p([attribute.class("work-line")], [text(model.work_line(agents))]),
    stat("inbox depth", model.format_count(queue.inbox_depth)),
    stat("tasks pending", model.format_count(queue.pending)),
    stat("unanswered", model.format_count(queue.unanswered)),
    case queue.errors {
      [] -> html.p([attribute.class("muted")], [text("no recent errors")])
      errors ->
        html.ul([attribute.class("errors")], list.map(errors, fn(error) {
          html.li([], [text(error)])
        }))
    },
  ])
}

fn footer(current: model.Model) -> Element(model.Msg) {
  html.footer([attribute.class("foot")], [
    text("poll #" <> int.to_string(current.polls) <> " · contract v1"),
  ])
}

// --- small pieces ---------------------------------------------------------

fn section_title(label: String) -> Element(model.Msg) {
  html.h2([attribute.class("card-title")], [text(label)])
}

fn stat(label: String, value: String) -> Element(model.Msg) {
  html.div([attribute.class("stat")], [
    html.span([attribute.class("stat-label")], [text(label)]),
    html.span([attribute.class("stat-value")], [text(value)]),
  ])
}

fn sparkline(current: model.Model, pick: fn(model.Sample) -> Int) -> Element(model.Msg) {
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

fn budget(label: String, fraction: Float, value: String) -> Element(model.Msg) {
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

fn element_none() -> Element(model.Msg) {
  html.span([attribute.class("hidden")], [])
}

fn freshness_label(freshness: model.Freshness) -> String {
  case freshness {
    model.Live -> "live"
    model.Slow -> "slow"
    model.Stale -> "stale"
    model.Unknown -> "unknown"
  }
}

fn cache_class(spend: model.Spend) -> String {
  case spend.stale {
    True -> "badge stale"
    False ->
      case spend.cached {
        True -> "badge cached"
        False -> "badge"
      }
  }
}

fn cache_label(spend: model.Spend) -> String {
  case spend.stale, spend.cached {
    True, _ -> "stale cache"
    False, True -> "cached"
    False, False -> "fresh"
  }
}

fn short(text_value: String, limit: Int) -> String {
  case string.length(text_value) > limit {
    True -> string.slice(text_value, 0, limit) <> "…"
    False -> text_value
  }
}

fn float_round(value: Float) -> Int {
  float.round(value)
}

fn or_default_vitals(vitals: Option(model.Vitals)) -> model.Vitals {
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

fn or_default_agents(agents: Option(model.Agents)) -> model.Agents {
  case agents {
    Some(agents) -> agents
    None -> model.empty_agents()
  }
}

fn or_default_queue(queue: Option(model.Queue)) -> model.Queue {
  case queue {
    Some(queue) -> queue
    None -> model.Queue(inbox_depth: None, running: None, pending: None, unanswered: None, errors: [])
  }
}
