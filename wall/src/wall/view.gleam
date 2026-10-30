//// The wall's rendering: pure `Model -> Element`. No fetching, no timers, no
//// clock reads — everything the view needs is already in the model, which is why
//// `gleeunit` can assert on strings this module produces.
////
//// Layout: a header with three tabs, an optional error banner, then either the
//// two-by-two grid of VITALS / SPEND / AGENTS / QUEUE, the full-width LOGS tail,
//// or the BROWSER: a conversation rail on the left, the selected space's stream
//// on the right, and a jump list over both. One view function, so a tab switch is
//// one message and no reload. LOGS and the browser's pane render rows with the
//// same `log_rows`, so the expanders, the spill reader and the pretty record are
//// one code path; the browser passes `RowOptions(dividers: True, anchor: …)`.

import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/event
import lustre/element/svg
import wall/model
import wall/pretty

pub fn view(current: model.Model) -> Element(model.Msg) {
  html.div([attribute.class("wall")], [
    header(current),
    banner(current.error),
    case current.tab {
      model.Dashboard -> dashboard(current)
      model.LogsTab -> logs_tab(current)
      model.BrowserTab -> browser_tab(current)
    },
    footer(current),
  ])
}

fn dashboard(current: model.Model) -> Element(model.Msg) {
  html.div([attribute.class("grid")], [
    vitals_card(current),
    spend_card(current),
    agents_card(current),
    queue_card(current),
  ])
}

fn header(current: model.Model) -> Element(model.Msg) {
  html.header([attribute.class("head")], [
    html.h1([attribute.class("title")], [text("THE WALL")]),
    html.nav(
      [attribute.class("tabs")],
      list.map([model.Dashboard, model.LogsTab, model.BrowserTab], fn(tab) {
        html.button(
          [
            attribute.attribute("type", "button"),
            attribute.class(tab_class(current.tab, tab)),
            event.on_click(model.TabChosen(tab)),
          ],
          [text(string.uppercase(model.tab_label(tab)))],
        )
      }),
    ),
    html.span([attribute.class("mode")], [text(mode_label(current.mode))]),
  ])
}

fn tab_class(showing: model.Tab, tab: model.Tab) -> String {
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
    // Retired agents are a health fact, not a card: count them here. Only shown
    // once something has actually retired.
    case current.agents {
      option.Some(agents) if agents.retired != option.Some(0) ->
        stat("retired agents", model.format_count(agents.retired))
      _ -> element_none()
    },
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

// --- the logs tab ---------------------------------------------------------

/// The ledger browser: a filter row, then newest-first rows. Every row is a
/// `<details>` whose first child is the human line — so the raw record is one
/// click away and never in the way.
fn logs_tab(current: model.Model) -> Element(model.Msg) {
  let logs = or_default_logs(current.logs)
  html.section([attribute.class("logs")], [
    html.div([attribute.class("log-controls")], [
      html.div(
        [attribute.class("chips")],
        list.map([model.BothWays, model.Incoming, model.Outgoing], fn(direction) {
          html.button(
            [
              attribute.attribute("type", "button"),
              attribute.class(chip_class(current.filters.direction == direction)),
              event.on_click(model.DirectionChosen(direction)),
            ],
            [text(model.direction_label(direction))],
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
    html.p([attribute.class("log-line")], [text(model.logs_line(logs))]),
    case logs.error {
      Some(problem) -> html.p([attribute.class("banner")], [text(problem)])
      None -> element_none()
    },
    log_rows(logs, model.log_options()),
    case logs.next_before {
      Some(_) -> html.p([attribute.class("muted")], [text("older entries available")])
      None -> element_none()
    },
  ])
}

fn kind_chips(filters: model.LogFilters) -> List(Element(model.Msg)) {
  list.map(model.log_kinds, fn(kind) {
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

fn chip_class(active: Bool) -> String {
  case active {
    True -> "chip active"
    False -> "chip"
  }
}

fn log_rows(logs: model.Logs, options: model.RowOptions) -> Element(model.Msg) {
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
fn stream_rows(
  logs: model.Logs,
  entries: List(model.LogEntry),
  options: model.RowOptions,
) -> List(Element(model.Msg)) {
  let #(rendered, _) = list.fold(entries, #([], 0), fn(state, entry) {
    let #(done, seen) = state
    case options.dividers && model.is_divider(entry.kind) {
      True -> #([divider_row(entry, seen), ..done], seen + 1)
      False -> #([log_row(logs, entry, options), ..done], seen)
    }
  })
  list.reverse(rendered)
}

/// A compaction boundary: a full-width rule with the summary one click away. The
/// entries on either side stay in the same list, in the same order.
fn divider_row(entry: model.LogEntry, seen: Int) -> Element(model.Msg) {
  html.div([attribute.class("log-divider")], [
    html.span([attribute.class("divider-rule")], [text(model.divider_label(seen))]),
    html.details([attribute.class("divider-summary")], [
      html.summary([attribute.class("divider-head")], [
        text("summary · " <> model.short_time(entry.at)),
      ]),
      html.pre([attribute.class("log-raw")], [text(pretty.json(entry.raw))]),
    ]),
    html.span([attribute.class("divider-rule")], []),
  ])
}

fn log_row(
  logs: model.Logs,
  entry: model.LogEntry,
  options: model.RowOptions,
) -> Element(model.Msg) {
  html.details([attribute.class(row_class(options, entry))], [
    html.summary([attribute.class("log-head")], [
      html.span([attribute.class("log-at")], [text(model.short_time(entry.at))]),
      html.span([attribute.class("log-kind " <> kind_class(entry.kind))], [text(entry.kind)]),
      case entry.thread {
        Some(name) -> html.span([attribute.class("log-thread")], [text("@" <> name)])
        None -> element_none()
      },
      html.span([attribute.class("log-text")], [text(entry.text)]),
      case model.is_anchor(options, entry) {
        True -> html.span([attribute.class("log-hit")], [text("hit")])
        False -> element_none()
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
fn row_class(options: model.RowOptions, entry: model.LogEntry) -> String {
  case model.is_anchor(options, entry) {
    True -> "log-row hit"
    False -> "log-row"
  }
}

/// A row whose record spilled its full output: the expander fetches
/// `/api/spill?path=…` once, then shows what came back (or why it did not).
fn spill_block(logs: model.Logs, entry: model.LogEntry) -> Element(model.Msg) {
  case entry.spill {
    None -> element_none()
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

fn spill_text(logs: model.Logs, id: Int) -> String {
  case list.key_find(logs.spills, id) {
    Ok(text) -> text
    Error(_) -> "press to load"
  }
}

fn kind_class(kind: String) -> String {
  case kind {
    "pi.user" -> "kind-user"
    "pi.assistant" -> "kind-assistant"
    "pi.tool-result" -> "kind-tool"
    "pi.compaction" -> "kind-compaction"
    "pi.system" -> "kind-system"
    _ -> "kind-app"
  }
}

fn or_default_logs(logs: Option(model.Logs)) -> model.Logs {
  case logs {
    Some(logs) -> logs
    None -> model.empty_logs()
  }
}

// --- the browser tab ------------------------------------------------------

/// Search box on top, jump list under it, then rail + pane. The search is over
/// every conversation, so a hit can be in a space that is not the one on screen.
fn browser_tab(current: model.Model) -> Element(model.Msg) {
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

fn browser_search(search: model.Search) -> Element(model.Msg) {
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
    html.span([attribute.class("log-line")], [text(model.search_line(search))]),
  ])
}

fn browser_hits(search: model.Search) -> Element(model.Msg) {
  case search.asked, search.hits, search.error {
    "", [], None -> element_none()
    _, _, _ ->
      html.div([attribute.class("hits")], [
        case search.error {
          Some(problem) -> html.p([attribute.class("banner")], [text(problem)])
          None -> element_none()
        },
        html.div([attribute.class("hit-rows")], list.map(search.hits, hit_row)),
      ])
  }
}

/// One hit: which space, when, which kind, and the matched line. Clicking it
/// selects that space and opens a window around the entry.
fn hit_row(hit: model.SearchHit) -> Element(model.Msg) {
  html.button(
    [
      attribute.attribute("type", "button"),
      attribute.class("hit"),
      event.on_click(model.HitChosen(hit.conversation, hit.entry)),
    ],
    [
      html.span([attribute.class("hit-space")], [text(hit.conversation_title)]),
      html.span([attribute.class("hit-at")], [text(model.short_stamp(hit.at))]),
      html.span([attribute.class("log-kind " <> kind_class(hit.kind))], [text(hit.kind)]),
      html.span([attribute.class("hit-text")], [text(clip(hit.text, 160))]),
    ],
  )
}

/// A hit line is one line: the full text is in the row you land on.
fn clip(text: String, limit: Int) -> String {
  case string.length(text) > limit {
    True -> string.slice(text, 0, limit) <> "…"
    False -> text
  }
}

fn conversation_rail(browser: model.Browser) -> Element(model.Msg) {
  html.div([attribute.class("rail")], [
    html.p([attribute.class("rail-head")], [text("spaces")]),
    case browser.conversations_error {
      Some(problem) -> html.p([attribute.class("banner")], [text(problem)])
      None -> element_none()
    },
    case model.order_conversations(browser.conversations) {
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
/// `model.order_conversations`.
fn conversation_card(browser: model.Browser, item: model.Conversation) -> Element(model.Msg) {
  html.button(
    [
      attribute.attribute("type", "button"),
      attribute.class(model.space_class(browser.selected, item.id)),
      event.on_click(model.ConversationChosen(item.id)),
    ],
    [
      html.span([attribute.class("space-head")], [
        html.span([attribute.class("space-title")], [text(item.title)]),
        html.span([attribute.class(model.agent_state_class(item.state))], [
          text(model.agent_state_label(item.state)),
        ]),
      ]),
      html.span([attribute.class("space-meta")], [text(model.conversation_line(item))]),
      html.span([attribute.class("space-meta")], [text(model.conversation_span(item))]),
    ],
  )
}

fn browser_pane(browser: model.Browser) -> Element(model.Msg) {
  let logs = or_default_logs(browser.stream)
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
        None -> element_none()
      },
      html.span([attribute.class("log-line")], [text(model.logs_line(logs))]),
    ]),
    case logs.error {
      Some(problem) -> html.p([attribute.class("banner")], [text(problem)])
      None -> element_none()
    },
    log_rows(logs, model.browser_options(browser.anchor)),
    case logs.next_before {
      Some(_) -> html.p([attribute.class("muted")], [text("older entries available")])
      None -> element_none()
    },
  ])
}

fn pane_title(browser: model.Browser) -> String {
  case model.selected_conversation(browser) {
    None -> "select a space"
    Some(item) -> item.title <> " · " <> model.agent_state_label(item.state)
  }
}
