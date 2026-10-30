import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import * as $attribute from "../../lustre/lustre/attribute.mjs";
import * as $element from "../../lustre/lustre/element.mjs";
import { text } from "../../lustre/lustre/element.mjs";
import * as $html from "../../lustre/lustre/element/html.mjs";
import {
  toList,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  isEqual,
} from "../gleam.mjs";
import * as $format from "../wall/format.mjs";
import * as $model from "../wall/model.mjs";
import * as $ui from "../wall/ui.mjs";

export function queue_card(current) {
  let _block;
  let _pipe = current.queue;
  _block = $ui.or_default_queue(_pipe);
  let queue = _block;
  let _block$1;
  let _pipe$1 = current.agents;
  _block$1 = $ui.or_default_agents(_pipe$1);
  let agents = _block$1;
  return $html.section(
    listPrepend($attribute.class$("card queue"), $List$Empty$const),
    listPrepend(
      $ui.section_title("QUEUE"),
      listPrepend(
        $html.p(
          listPrepend($attribute.class$("work-line"), $List$Empty$const),
          listPrepend(text($model.work_line(agents)), $List$Empty$const),
        ),
        listPrepend(
          $ui.stat("inbox depth", $format.format_count(queue.inbox_depth)),
          listPrepend(
            $ui.stat("tasks pending", $format.format_count(queue.pending)),
            listPrepend(
              $ui.stat("unanswered", $format.format_count(queue.unanswered)),
              listPrepend(
                (() => {
                  let $ = queue.errors;
                  if ($ instanceof $Empty) {
                    return $html.p(
                      listPrepend($attribute.class$("muted"), $List$Empty$const),
                      listPrepend(text("no recent errors"), $List$Empty$const),
                    );
                  } else {
                    let errors = $;
                    return $html.ul(
                      listPrepend(
                        $attribute.class$("errors"),
                        $List$Empty$const,
                      ),
                      $list.map(
                        errors,
                        (error) => {
                          return $html.li(
                            $List$Empty$const,
                            listPrepend(text(error), $List$Empty$const),
                          );
                        },
                      ),
                    );
                  }
                })(),
                $List$Empty$const,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

export function orphans_row(agents) {
  let $ = agents.orphans;
  if ($ instanceof $Empty) {
    return $html.p(
      listPrepend($attribute.class$("muted"), $List$Empty$const),
      listPrepend(text("no orphans"), $List$Empty$const),
    );
  } else {
    let orphans = $;
    return $html.div(
      listPrepend($attribute.class$("orphans"), $List$Empty$const),
      listPrepend(
        $html.span(
          listPrepend($attribute.class$("orphan-count"), $List$Empty$const),
          listPrepend(text($model.orphan_summary(agents)), $List$Empty$const),
        ),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("orphan-ids"), $List$Empty$const),
            listPrepend(
              text(
                (() => {
                  let _pipe = orphans;
                  let _pipe$1 = $list.map(
                    _pipe,
                    (orphan) => {
                      let $1 = orphan.conversation;
                      if ($1 instanceof Some) {
                        let conversation = $1[0];
                        return (("#" + $int.to_string(orphan.anchor)) + " → c") + $int.to_string(
                          conversation,
                        );
                      } else {
                        return "#" + $int.to_string(orphan.anchor);
                      }
                    },
                  );
                  return $string.join(_pipe$1, ", ");
                })(),
              ),
              $List$Empty$const,
            ),
          ),
          $List$Empty$const,
        ),
      ),
    );
  }
}

export function agent_entry(
  name,
  state,
  branch,
  worktree,
  last_reply,
  show_reply
) {
  return $html.div(
    listPrepend($attribute.class$("agent"), $List$Empty$const),
    listPrepend(
      $html.div(
        listPrepend($attribute.class$("agent-head"), $List$Empty$const),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("agent-name"), $List$Empty$const),
            listPrepend(text(name), $List$Empty$const),
          ),
          listPrepend(
            $html.span(
              listPrepend(
                $attribute.class$($model.agent_state_class(state)),
                $List$Empty$const,
              ),
              listPrepend(
                text($model.agent_state_label(state)),
                $List$Empty$const,
              ),
            ),
            $List$Empty$const,
          ),
        ),
      ),
      listPrepend(
        (() => {
          if (branch === "") {
            return $ui.element_none();
          } else {
            let branch$1 = branch;
            return $html.div(
              listPrepend($attribute.class$("agent-branch"), $List$Empty$const),
              listPrepend(text(branch$1), $List$Empty$const),
            );
          }
        })(),
        listPrepend(
          (() => {
            if (worktree === "") {
              return $ui.element_none();
            } else {
              let worktree$1 = worktree;
              return $html.div(
                listPrepend(
                  $attribute.class$("agent-worktree"),
                  $List$Empty$const,
                ),
                listPrepend(text(worktree$1), $List$Empty$const),
              );
            }
          })(),
          listPrepend(
            (() => {
              if (show_reply) {
                return $html.div(
                  listPrepend(
                    $attribute.class$("agent-reply"),
                    $List$Empty$const,
                  ),
                  listPrepend(
                    text(
                      (() => {
                        if (last_reply instanceof Some) {
                          let entry = last_reply[0];
                          return "last answer #" + $int.to_string(entry);
                        } else {
                          return "no answer yet";
                        }
                      })(),
                    ),
                    $List$Empty$const,
                  ),
                );
              } else {
                return $ui.element_none();
              }
            })(),
            $List$Empty$const,
          ),
        ),
      ),
    ),
  );
}

/**
 * The AGENTS card: pi-spike, one card per named subagent (state badge + branch
 * + worktree + last answer entry), then the orphans — held anchors nothing
 * names, which are prunable and would otherwise be invisible.
 */
export function agents_card(current) {
  let _block;
  let _pipe = current.agents;
  _block = $ui.or_default_agents(_pipe);
  let agents = _block;
  return $html.section(
    listPrepend($attribute.class$("card agents"), $List$Empty$const),
    listPrepend(
      $ui.section_title("AGENTS"),
      listPrepend(
        $html.p(
          listPrepend($attribute.class$("work-line"), $List$Empty$const),
          listPrepend(text($model.work_line(agents)), $List$Empty$const),
        ),
        listPrepend(
          agent_entry(
            "pi-spike",
            agents.spike_state,
            "main conversation",
            "",
            Option$None$const,
            false,
          ),
          listPrepend(
            (() => {
              let $ = $model.subagent_cards(agents);
              if ($ instanceof $Empty) {
                return $html.p(
                  listPrepend($attribute.class$("muted"), $List$Empty$const),
                  listPrepend(text("no named subagents"), $List$Empty$const),
                );
              } else {
                let cards = $;
                return $html.div(
                  listPrepend($attribute.class$("agents"), $List$Empty$const),
                  $list.map(
                    cards,
                    (card) => {
                      return agent_entry(
                        card.name,
                        card.state,
                        card.branch,
                        card.worktree,
                        card.last_reply,
                        true,
                      );
                    },
                  ),
                );
              }
            })(),
            listPrepend(
              (() => {
                let $ = $model.project_cards(agents);
                if ($ instanceof $Empty) {
                  return $ui.element_none();
                } else {
                  let cards = $;
                  return $html.p(
                    listPrepend(
                      $attribute.class$("agent-projects"),
                      $List$Empty$const,
                    ),
                    listPrepend(
                      text(
                        $int.to_string($list.length(cards)) + " project(s) — see the PROJECTS tab",
                      ),
                      $List$Empty$const,
                    ),
                  );
                }
              })(),
              listPrepend(orphans_row(agents), $List$Empty$const),
            ),
          ),
        ),
      ),
    ),
  );
}

export function spend_card(current) {
  return $html.section(
    listPrepend($attribute.class$("card spend"), $List$Empty$const),
    listPrepend(
      $ui.section_title("SPEND"),
      listPrepend(
        (() => {
          let $ = current.spend;
          if ($ instanceof Some) {
            let spend = $[0];
            return $html.div(
              $List$Empty$const,
              listPrepend(
                $ui.stat("requests 24h", $format.format_count(spend.requests)),
                listPrepend(
                  $ui.stat(
                    "input tokens",
                    $format.format_count(spend.input_tokens),
                  ),
                  listPrepend(
                    $ui.stat(
                      "output tokens",
                      $format.format_count(spend.output_tokens),
                    ),
                    listPrepend(
                      $ui.sparkline(
                        current,
                        (sample) => { return sample.requests; },
                      ),
                      listPrepend(
                        $ui.budget(
                          "upstream calls / min",
                          $format.budget_fraction(
                            spend.used_in_window,
                            spend.max_per_minute,
                          ),
                          ($format.format_count(spend.used_in_window) + " / ") + $format.format_count(
                            spend.max_per_minute,
                          ),
                        ),
                        listPrepend(
                          $ui.budget(
                            "balance used",
                            (() => {
                              let $1 = spend.percent_used;
                              if ($1 instanceof Some) {
                                let percent = $1[0];
                                return $format.budget_fraction(
                                  new Some($ui.float_round(percent)),
                                  new Some(100),
                                );
                              } else {
                                return 0.0;
                              }
                            })(),
                            $format.format_percent(spend.percent_used),
                          ),
                          listPrepend(
                            $ui.stat(
                              "balance",
                              $format.format_usd(spend.balance_usd),
                            ),
                            listPrepend(
                              $html.span(
                                listPrepend(
                                  $attribute.class$($ui.cache_class(spend)),
                                  $List$Empty$const,
                                ),
                                listPrepend(
                                  text($ui.cache_label(spend)),
                                  $List$Empty$const,
                                ),
                              ),
                              $List$Empty$const,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          } else {
            return $html.p(
              listPrepend($attribute.class$("muted"), $List$Empty$const),
              listPrepend(text("no spend data yet"), $List$Empty$const),
            );
          }
        })(),
        $List$Empty$const,
      ),
    ),
  );
}

export function vitals_card(current) {
  let _block;
  let _pipe = current.vitals;
  _block = $ui.or_default_vitals(_pipe);
  let vitals = _block;
  return $html.section(
    listPrepend($attribute.class$("card vitals"), $List$Empty$const),
    toList([
      $ui.section_title("VITALS"),
      $ui.stat("ledger entries", $format.format_count(vitals.entries)),
      $ui.stat("ledger size", $format.format_bytes(vitals.ledger_bytes)),
      $ui.sparkline(current, (sample) => { return sample.entries; }),
      $ui.stat("sync cursor", $format.format_age(vitals.sync_age_s)),
      $ui.stat("sync state", $ui.freshness_label(vitals.sync_state)),
      $ui.stat(
        "sync batch",
        (() => {
          let $ = vitals.sync_batch;
          if ($ instanceof Some) {
            let batch = $[0];
            return "#" + $ui.short(batch, 18);
          } else {
            return "—";
          }
        })(),
      ),
      $ui.stat("sync seq", $format.format_count(vitals.sync_seq)),
      $ui.stat("daemon errors 24h", $format.format_count(vitals.errors_24h)),
      $ui.stat("daemon uptime", $format.format_age(vitals.daemon_uptime_s)),
      $ui.stat(
        "container uptime",
        $format.format_age(vitals.container_uptime_s),
      ),
      (() => {
        let $ = current.agents;
        if ($ instanceof $option.Some) {
          let agents = $[0];
          if (!isEqual(agents.retired, new $option.Some(0))) {
            return $ui.stat(
              "retired agents",
              $format.format_count(agents.retired),
            );
          } else {
            return $ui.element_none();
          }
        } else {
          return $ui.element_none();
        }
      })(),
      (() => {
        let $ = vitals.last_error;
        if ($ instanceof Some) {
          let message = $[0];
          return $html.p(
            listPrepend($attribute.class$("last-error"), $List$Empty$const),
            listPrepend(text(message), $List$Empty$const),
          );
        } else {
          return $ui.element_none();
        }
      })(),
    ]),
  );
}

export function dashboard(current) {
  return $html.div(
    listPrepend($attribute.class$("grid"), $List$Empty$const),
    listPrepend(
      vitals_card(current),
      listPrepend(
        spend_card(current),
        listPrepend(
          agents_card(current),
          listPrepend(queue_card(current), $List$Empty$const),
        ),
      ),
    ),
  );
}

export function footer(current) {
  return $html.footer(
    listPrepend($attribute.class$("foot"), $List$Empty$const),
    listPrepend(
      text(("poll #" + $int.to_string(current.polls)) + " · contract v1"),
      $List$Empty$const,
    ),
  );
}

export function project_row(card) {
  return $html.div(
    listPrepend($attribute.class$("project"), $List$Empty$const),
    listPrepend(
      $html.div(
        listPrepend($attribute.class$("project-head"), $List$Empty$const),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("project-name"), $List$Empty$const),
            listPrepend(text(card.name), $List$Empty$const),
          ),
          listPrepend(
            $html.span(
              listPrepend(
                $attribute.class$($model.agent_state_class(card.state)),
                $List$Empty$const,
              ),
              listPrepend(
                text($model.agent_state_label(card.state)),
                $List$Empty$const,
              ),
            ),
            $List$Empty$const,
          ),
        ),
      ),
      listPrepend(
        $html.div(
          listPrepend($attribute.class$("project-line"), $List$Empty$const),
          listPrepend(text($model.project_line(card)), $List$Empty$const),
        ),
        listPrepend(
          $html.div(
            listPrepend($attribute.class$("project-dir"), $List$Empty$const),
            listPrepend(text($model.project_dir(card)), $List$Empty$const),
          ),
          listPrepend(
            $html.div(
              listPrepend(
                $attribute.class$("project-summary"),
                $List$Empty$const,
              ),
              listPrepend(text($model.project_summary(card)), $List$Empty$const),
            ),
            $List$Empty$const,
          ),
        ),
      ),
    ),
  );
}

/**
 * The ledger browser: a filter row, then newest-first rows. Every row is a
 * `<details>` whose first child is the human line — so the raw record is one
 * click away and never in the way.
 * The PROJECTS view: one row per bound project — name, state, the room that
 * steers it (short form), its directory, and how much history it holds. The
 * rows are the AGENTS cards filtered by `kind`, so the two views can never
 * disagree about a project's state.
 */
export function projects_tab(current) {
  let _block;
  let _pipe = current.agents;
  _block = $ui.or_default_agents(_pipe);
  let agents = _block;
  let cards = $model.project_cards(agents);
  return $html.section(
    listPrepend($attribute.class$("pane projects"), $List$Empty$const),
    listPrepend(
      $html.div(
        listPrepend($attribute.class$("pane-head"), $List$Empty$const),
        listPrepend(
          $html.h2(
            listPrepend($attribute.class$("pane-title"), $List$Empty$const),
            listPrepend(text("PROJECTS"), $List$Empty$const),
          ),
          listPrepend(
            $html.span(
              listPrepend($attribute.class$("muted"), $List$Empty$const),
              listPrepend(
                text($model.project_count_line(cards)),
                $List$Empty$const,
              ),
            ),
            $List$Empty$const,
          ),
        ),
      ),
      listPrepend(
        (() => {
          if (cards instanceof $Empty) {
            return $html.p(
              listPrepend($attribute.class$("muted"), $List$Empty$const),
              listPrepend(
                text(
                  "A project is a room bound to its own conversation. Type /project new <name> in a room to make one, or /project bind <name> <path> to adopt a directory.",
                ),
                $List$Empty$const,
              ),
            );
          } else {
            let cards$1 = cards;
            return $html.div(
              listPrepend($attribute.class$("project-list"), $List$Empty$const),
              $list.map(cards$1, project_row),
            );
          }
        })(),
        $List$Empty$const,
      ),
    ),
  );
}
