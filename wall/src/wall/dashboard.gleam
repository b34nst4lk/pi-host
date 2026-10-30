//// The dashboard: vitals, spend, agents and the queue, plus the PROJECTS view
//// that reuses the agent cards. Read-only rendering — no state, no effects.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import wall/format
import wall/model
import wall/ui

pub fn dashboard(current: model.Model) -> Element(model.Msg) {
  html.div([attribute.class("grid")], [
    vitals_card(current),
    spend_card(current),
    agents_card(current),
    queue_card(current),
  ])
}


pub fn vitals_card(current: model.Model) -> Element(model.Msg) {
  let vitals = current.vitals |> ui.or_default_vitals()
  html.section([attribute.class("card vitals")], [
    ui.section_title("VITALS"),
    ui.stat("ledger entries", format.format_count(vitals.entries)),
    ui.stat("ledger size", format.format_bytes(vitals.ledger_bytes)),
    ui.sparkline(current, fn(sample) { sample.entries }),
    ui.stat("sync cursor", format.format_age(vitals.sync_age_s)),
    ui.stat("sync state", ui.freshness_label(vitals.sync_state)),
    ui.stat("sync batch", case vitals.sync_batch {
      Some(batch) -> "#" <> ui.short(batch, 18)
      None -> "—"
    }),
    ui.stat("sync seq", format.format_count(vitals.sync_seq)),
    ui.stat("daemon errors 24h", format.format_count(vitals.errors_24h)),
    ui.stat("daemon uptime", format.format_age(vitals.daemon_uptime_s)),
    ui.stat("container uptime", format.format_age(vitals.container_uptime_s)),
    // Retired agents are a health fact, not a card: count them here. Only shown
    // once something has actually retired.
    case current.agents {
      option.Some(agents) if agents.retired != option.Some(0) ->
        ui.stat("retired agents", format.format_count(agents.retired))
      _ -> ui.element_none()
    },
    case vitals.last_error {
      Some(message) -> html.p([attribute.class("last-error")], [text(message)])
      None -> ui.element_none()
    },
  ])
}

pub fn spend_card(current: model.Model) -> Element(model.Msg) {
  html.section([attribute.class("card spend")], [
    ui.section_title("SPEND"),
    case current.spend {
      None -> html.p([attribute.class("muted")], [text("no spend data yet")])
      Some(spend) -> {
        html.div([], [
          ui.stat("requests 24h", format.format_count(spend.requests)),
          ui.stat("input tokens", format.format_count(spend.input_tokens)),
          ui.stat("output tokens", format.format_count(spend.output_tokens)),
          ui.sparkline(current, fn(sample) { sample.requests }),
          ui.budget(
            "upstream calls / min",
            format.budget_fraction(spend.used_in_window, spend.max_per_minute),
            format.format_count(spend.used_in_window)
            <> " / "
            <> format.format_count(spend.max_per_minute),
          ),
          ui.budget(
            "balance used",
            case spend.percent_used {
              Some(percent) -> format.budget_fraction(Some(ui.float_round(percent)), Some(100))
              None -> 0.0
            },
            format.format_percent(spend.percent_used),
          ),
          ui.stat("balance", format.format_usd(spend.balance_usd)),
          html.span([attribute.class(ui.cache_class(spend))], [
            text(ui.cache_label(spend)),
          ]),
        ])
      }
    },
  ])
}

/// The AGENTS card: pi-spike, one card per named subagent (state badge + branch
/// + worktree + last answer entry), then the orphans — held anchors nothing
/// names, which are prunable and would otherwise be invisible.
pub fn agents_card(current: model.Model) -> Element(model.Msg) {
  let agents = current.agents |> ui.or_default_agents()
  html.section([attribute.class("card agents")], [
    ui.section_title("AGENTS"),
    html.p([attribute.class("work-line")], [text(model.work_line(agents))]),
    agent_entry("pi-spike", agents.spike_state, "main conversation", "", None, False),
    case model.subagent_cards(agents) {
      [] -> html.p([attribute.class("muted")], [text("no named subagents")])
      cards ->
        html.div([attribute.class("agents")], list.map(cards, fn(card) {
          agent_entry(card.name, card.state, card.branch, card.worktree, card.last_reply, True)
        }))
    },
    case model.project_cards(agents) {
      [] -> ui.element_none()
      cards ->
        html.p([attribute.class("agent-projects")], [
          text(
            int.to_string(list.length(cards))
            <> " project(s) — see the PROJECTS tab",
          ),
        ])
    },
    orphans_row(agents),
  ])
}

pub fn agent_entry(
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
      "" -> ui.element_none()
      branch -> html.div([attribute.class("agent-branch")], [text(branch)])
    },
    case worktree {
      "" -> ui.element_none()
      worktree -> html.div([attribute.class("agent-worktree")], [text(worktree)])
    },
    case show_reply {
      False -> ui.element_none()
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

pub fn orphans_row(agents: model.Agents) -> Element(model.Msg) {
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

pub fn queue_card(current: model.Model) -> Element(model.Msg) {
  let queue = current.queue |> ui.or_default_queue()
  let agents = current.agents |> ui.or_default_agents()
  html.section([attribute.class("card queue")], [
    ui.section_title("QUEUE"),
    // Liveness lives in the agent cards now; this line is the run counter that
    // replaced "tasks running: N".
    html.p([attribute.class("work-line")], [text(model.work_line(agents))]),
    ui.stat("inbox depth", format.format_count(queue.inbox_depth)),
    ui.stat("tasks pending", format.format_count(queue.pending)),
    ui.stat("unanswered", format.format_count(queue.unanswered)),
    case queue.errors {
      [] -> html.p([attribute.class("muted")], [text("no recent errors")])
      errors ->
        html.ul([attribute.class("errors")], list.map(errors, fn(error) {
          html.li([], [text(error)])
        }))
    },
  ])
}

pub fn footer(current: model.Model) -> Element(model.Msg) {
  html.footer([attribute.class("foot")], [
    text("poll #" <> int.to_string(current.polls) <> " · contract v1"),
  ])
}


// --- the logs tab ---------------------------------------------------------

/// The ledger browser: a filter row, then newest-first rows. Every row is a
/// `<details>` whose first child is the human line — so the raw record is one
/// click away and never in the way.
/// The PROJECTS view: one row per bound project — name, state, the room that
/// steers it (short form), its directory, and how much history it holds. The
/// rows are the AGENTS cards filtered by `kind`, so the two views can never
/// disagree about a project's state.
pub fn projects_tab(current: model.Model) -> Element(model.Msg) {
  let agents = current.agents |> ui.or_default_agents()
  let cards = model.project_cards(agents)
  html.section([attribute.class("pane projects")], [
    html.div([attribute.class("pane-head")], [
      html.h2([attribute.class("pane-title")], [text("PROJECTS")]),
      html.span([attribute.class("muted")], [text(model.project_count_line(cards))]),
    ]),
    case cards {
      [] ->
        html.p([attribute.class("muted")], [
          text(
            "A project is a room bound to its own conversation. Type /project new <name> in a room to make one, or /project bind <name> <path> to adopt a directory.",
          ),
        ])
      cards ->
        html.div([attribute.class("project-list")], list.map(cards, project_row))
    },
  ])
}

pub fn project_row(card: model.AgentCard) -> Element(model.Msg) {
  html.div([attribute.class("project")], [
    html.div([attribute.class("project-head")], [
      html.span([attribute.class("project-name")], [text(card.name)]),
      html.span([attribute.class(model.agent_state_class(card.state))], [
        text(model.agent_state_label(card.state)),
      ]),
    ]),
    html.div([attribute.class("project-line")], [text(model.project_line(card))]),
    html.div([attribute.class("project-dir")], [text(model.project_dir(card))]),
    html.div([attribute.class("project-summary")], [
      text(model.project_summary(card)),
    ]),
  ])
}


