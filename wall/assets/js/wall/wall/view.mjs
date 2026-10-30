import * as $float from "../../gleam_stdlib/gleam/float.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import * as $attribute from "../../lustre/lustre/attribute.mjs";
import * as $element from "../../lustre/lustre/element.mjs";
import { text } from "../../lustre/lustre/element.mjs";
import * as $html from "../../lustre/lustre/element/html.mjs";
import * as $svg from "../../lustre/lustre/element/svg.mjs";
import * as $event from "../../lustre/lustre/event.mjs";
import {
  Ok,
  toList,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  isEqual,
} from "../gleam.mjs";
import * as $model from "../wall/model.mjs";

function footer(current) {
  return $html.footer(
    listPrepend($attribute.class$("foot"), $List$Empty$const),
    listPrepend(
      text(("poll #" + $int.to_string(current.polls)) + " · contract v1"),
      $List$Empty$const,
    ),
  );
}

function element_none() {
  return $html.span(
    listPrepend($attribute.class$("hidden"), $List$Empty$const),
    $List$Empty$const,
  );
}

function spill_text(logs, id) {
  let $ = $list.key_find(logs.spills, id);
  if ($ instanceof Ok) {
    let text$1 = $[0];
    return text$1;
  } else {
    return "press to load";
  }
}

/**
 * A row whose record spilled its full output: the expander fetches
 * `/api/spill?path=…` once, then shows what came back (or why it did not).
 * 
 * @ignore
 */
function spill_block(logs, entry) {
  let $ = entry.spill;
  if ($ instanceof Some) {
    let path = $[0];
    return $html.details(
      listPrepend($attribute.class$("log-spill"), $List$Empty$const),
      listPrepend(
        $html.summary(
          listPrepend(
            $attribute.class$("spill-head"),
            listPrepend(
              $event.on_click(new $model.SpillRequested(entry.id, path)),
              $List$Empty$const,
            ),
          ),
          listPrepend(text("full output · " + path), $List$Empty$const),
        ),
        listPrepend(
          $html.pre(
            listPrepend($attribute.class$("spill-body"), $List$Empty$const),
            listPrepend(text(spill_text(logs, entry.id)), $List$Empty$const),
          ),
          $List$Empty$const,
        ),
      ),
    );
  } else {
    return element_none();
  }
}

function kind_class(kind) {
  if (kind === "pi.user") {
    return "kind-user";
  } else if (kind === "pi.assistant") {
    return "kind-assistant";
  } else if (kind === "pi.tool-result") {
    return "kind-tool";
  } else if (kind === "pi.compaction") {
    return "kind-compaction";
  } else if (kind === "pi.system") {
    return "kind-system";
  } else {
    return "kind-app";
  }
}

function log_row(logs, entry) {
  return $html.details(
    listPrepend($attribute.class$("log-row"), $List$Empty$const),
    listPrepend(
      $html.summary(
        listPrepend($attribute.class$("log-head"), $List$Empty$const),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("log-at"), $List$Empty$const),
            listPrepend(text($model.short_time(entry.at)), $List$Empty$const),
          ),
          listPrepend(
            $html.span(
              listPrepend(
                $attribute.class$("log-kind " + kind_class(entry.kind)),
                $List$Empty$const,
              ),
              listPrepend(text(entry.kind), $List$Empty$const),
            ),
            listPrepend(
              (() => {
                let $ = entry.thread;
                if ($ instanceof Some) {
                  let name = $[0];
                  return $html.span(
                    listPrepend(
                      $attribute.class$("log-thread"),
                      $List$Empty$const,
                    ),
                    listPrepend(text("@" + name), $List$Empty$const),
                  );
                } else {
                  return element_none();
                }
              })(),
              listPrepend(
                $html.span(
                  listPrepend($attribute.class$("log-text"), $List$Empty$const),
                  listPrepend(text(entry.text), $List$Empty$const),
                ),
                $List$Empty$const,
              ),
            ),
          ),
        ),
      ),
      listPrepend(
        $html.pre(
          listPrepend($attribute.class$("log-raw"), $List$Empty$const),
          listPrepend(text(entry.raw), $List$Empty$const),
        ),
        listPrepend(spill_block(logs, entry), $List$Empty$const),
      ),
    ),
  );
}

function log_rows(logs) {
  let $ = logs.entries;
  if ($ instanceof $Empty) {
    return $html.p(
      listPrepend($attribute.class$("muted"), $List$Empty$const),
      listPrepend(text("no entries match"), $List$Empty$const),
    );
  } else {
    let entries = $;
    return $html.div(
      listPrepend($attribute.class$("log-rows"), $List$Empty$const),
      $list.map(entries, (entry) => { return log_row(logs, entry); }),
    );
  }
}

function chip_class(active) {
  if (active) {
    return "chip active";
  } else {
    return "chip";
  }
}

function kind_chips(filters) {
  return $list.map(
    $model.log_kinds,
    (kind) => {
      return $html.button(
        listPrepend(
          $attribute.attribute("type", "button"),
          listPrepend(
            $attribute.class$(chip_class($list.contains(filters.kinds, kind))),
            listPrepend(
              $event.on_click(new $model.KindToggled(kind)),
              $List$Empty$const,
            ),
          ),
        ),
        listPrepend(text(kind), $List$Empty$const),
      );
    },
  );
}

function or_default_logs(logs) {
  if (logs instanceof Some) {
    let logs$1 = logs[0];
    return logs$1;
  } else {
    return $model.empty_logs();
  }
}

/**
 * The ledger browser: a filter row, then newest-first rows. Every row is a
 * `<details>` whose first child is the human line — so the raw record is one
 * click away and never in the way.
 * 
 * @ignore
 */
function logs_tab(current) {
  let logs = or_default_logs(current.logs);
  return $html.section(
    listPrepend($attribute.class$("logs"), $List$Empty$const),
    listPrepend(
      $html.div(
        listPrepend($attribute.class$("log-controls"), $List$Empty$const),
        listPrepend(
          $html.div(
            listPrepend($attribute.class$("chips"), $List$Empty$const),
            $list.map(
              listPrepend(
                $model.Direction$BothWays$const,
                listPrepend(
                  $model.Direction$Incoming$const,
                  listPrepend(
                    $model.Direction$Outgoing$const,
                    $List$Empty$const,
                  ),
                ),
              ),
              (direction) => {
                return $html.button(
                  listPrepend(
                    $attribute.attribute("type", "button"),
                    listPrepend(
                      $attribute.class$(
                        chip_class(
                          isEqual(current.filters.direction, direction),
                        ),
                      ),
                      listPrepend(
                        $event.on_click(new $model.DirectionChosen(direction)),
                        $List$Empty$const,
                      ),
                    ),
                  ),
                  listPrepend(
                    text($model.direction_label(direction)),
                    $List$Empty$const,
                  ),
                );
              },
            ),
          ),
          listPrepend(
            $html.div(
              listPrepend($attribute.class$("chips"), $List$Empty$const),
              kind_chips(current.filters),
            ),
            listPrepend(
              $html.input(
                listPrepend(
                  $attribute.attribute("type", "search"),
                  listPrepend(
                    $attribute.attribute("placeholder", "search the ledger"),
                    listPrepend(
                      $attribute.attribute("value", current.filters.query),
                      listPrepend(
                        $attribute.class$("search"),
                        listPrepend(
                          $event.on_input(
                            (var0) => { return new $model.QueryChanged(var0); },
                          ),
                          $List$Empty$const,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              listPrepend(
                $html.button(
                  listPrepend(
                    $attribute.attribute("type", "button"),
                    listPrepend(
                      $attribute.class$("older"),
                      listPrepend(
                        $event.on_click($model.Msg$OlderRequested$const),
                        $List$Empty$const,
                      ),
                    ),
                  ),
                  listPrepend(text("older"), $List$Empty$const),
                ),
                $List$Empty$const,
              ),
            ),
          ),
        ),
      ),
      listPrepend(
        $html.p(
          listPrepend($attribute.class$("log-line"), $List$Empty$const),
          listPrepend(text($model.logs_line(logs)), $List$Empty$const),
        ),
        listPrepend(
          (() => {
            let $ = logs.error;
            if ($ instanceof Some) {
              let problem = $[0];
              return $html.p(
                listPrepend($attribute.class$("banner"), $List$Empty$const),
                listPrepend(text(problem), $List$Empty$const),
              );
            } else {
              return element_none();
            }
          })(),
          listPrepend(
            log_rows(logs),
            listPrepend(
              (() => {
                let $ = logs.next_before;
                if ($ instanceof Some) {
                  return $html.p(
                    listPrepend($attribute.class$("muted"), $List$Empty$const),
                    listPrepend(
                      text("older entries available"),
                      $List$Empty$const,
                    ),
                  );
                } else {
                  return element_none();
                }
              })(),
              $List$Empty$const,
            ),
          ),
        ),
      ),
    ),
  );
}

function stat(label, value) {
  return $html.div(
    listPrepend($attribute.class$("stat"), $List$Empty$const),
    listPrepend(
      $html.span(
        listPrepend($attribute.class$("stat-label"), $List$Empty$const),
        listPrepend(text(label), $List$Empty$const),
      ),
      listPrepend(
        $html.span(
          listPrepend($attribute.class$("stat-value"), $List$Empty$const),
          listPrepend(text(value), $List$Empty$const),
        ),
        $List$Empty$const,
      ),
    ),
  );
}

function section_title(label) {
  return $html.h2(
    listPrepend($attribute.class$("card-title"), $List$Empty$const),
    listPrepend(text(label), $List$Empty$const),
  );
}

function or_default_agents(agents) {
  if (agents instanceof Some) {
    let agents$1 = agents[0];
    return agents$1;
  } else {
    return $model.empty_agents();
  }
}

function or_default_queue(queue) {
  if (queue instanceof Some) {
    let queue$1 = queue[0];
    return queue$1;
  } else {
    return new $model.Queue(
      Option$None$const,
      Option$None$const,
      Option$None$const,
      Option$None$const,
      $List$Empty$const,
    );
  }
}

function queue_card(current) {
  let _block;
  let _pipe = current.queue;
  _block = or_default_queue(_pipe);
  let queue = _block;
  let _block$1;
  let _pipe$1 = current.agents;
  _block$1 = or_default_agents(_pipe$1);
  let agents = _block$1;
  return $html.section(
    listPrepend($attribute.class$("card queue"), $List$Empty$const),
    listPrepend(
      section_title("QUEUE"),
      listPrepend(
        $html.p(
          listPrepend($attribute.class$("work-line"), $List$Empty$const),
          listPrepend(text($model.work_line(agents)), $List$Empty$const),
        ),
        listPrepend(
          stat("inbox depth", $model.format_count(queue.inbox_depth)),
          listPrepend(
            stat("tasks pending", $model.format_count(queue.pending)),
            listPrepend(
              stat("unanswered", $model.format_count(queue.unanswered)),
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

function orphans_row(agents) {
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

function agent_entry(name, state, branch, worktree, last_reply, show_reply) {
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
            return element_none();
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
              return element_none();
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
                return element_none();
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
 * 
 * @ignore
 */
function agents_card(current) {
  let _block;
  let _pipe = current.agents;
  _block = or_default_agents(_pipe);
  let agents = _block;
  return $html.section(
    listPrepend($attribute.class$("card agents"), $List$Empty$const),
    listPrepend(
      section_title("AGENTS"),
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
              let $ = agents.named;
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
            listPrepend(orphans_row(agents), $List$Empty$const),
          ),
        ),
      ),
    ),
  );
}

function cache_label(spend) {
  let $ = spend.stale;
  let $1 = spend.cached;
  if ($) {
    return "stale cache";
  } else if ($1) {
    return "cached";
  } else {
    return "fresh";
  }
}

function cache_class(spend) {
  let $ = spend.stale;
  if ($) {
    return "badge stale";
  } else {
    let $1 = spend.cached;
    if ($1) {
      return "badge cached";
    } else {
      return "badge";
    }
  }
}

function float_round(value) {
  return $float.round(value);
}

function budget(label, fraction, value) {
  return $html.div(
    listPrepend($attribute.class$("budget"), $List$Empty$const),
    listPrepend(
      $html.div(
        listPrepend($attribute.class$("budget-head"), $List$Empty$const),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("stat-label"), $List$Empty$const),
            listPrepend(text(label), $List$Empty$const),
          ),
          listPrepend(
            $html.span(
              listPrepend($attribute.class$("stat-value"), $List$Empty$const),
              listPrepend(text(value), $List$Empty$const),
            ),
            $List$Empty$const,
          ),
        ),
      ),
      listPrepend(
        $html.div(
          listPrepend($attribute.class$("budget-track"), $List$Empty$const),
          listPrepend(
            $html.div(
              listPrepend(
                $attribute.class$("budget-fill"),
                listPrepend(
                  $attribute.style(
                    "width",
                    $float.to_string(fraction * 100.0) + "%",
                  ),
                  $List$Empty$const,
                ),
              ),
              $List$Empty$const,
            ),
            $List$Empty$const,
          ),
        ),
        $List$Empty$const,
      ),
    ),
  );
}

function sparkline(current, pick) {
  let _block;
  let _pipe = current.samples;
  _block = $list.map(_pipe, (sample) => { return $int.to_float(pick(sample)); });
  let values = _block;
  let _block$1;
  let _pipe$1 = $model.sparkline_points(values, 100, 24);
  _block$1 = $model.polyline_points(_pipe$1);
  let points = _block$1;
  if (points === "") {
    return $html.p(
      listPrepend($attribute.class$("muted"), $List$Empty$const),
      listPrepend(text("collecting…"), $List$Empty$const),
    );
  } else {
    let points$1 = points;
    return $svg.svg(
      listPrepend(
        $attribute.class$("spark"),
        listPrepend(
          $attribute.attribute("viewBox", "0 0 100 24"),
          listPrepend(
            $attribute.attribute("preserveAspectRatio", "none"),
            $List$Empty$const,
          ),
        ),
      ),
      listPrepend(
        $svg.polyline(
          listPrepend(
            $attribute.attribute("points", points$1),
            listPrepend(
              $attribute.attribute("fill", "none"),
              listPrepend(
                $attribute.attribute("stroke", "currentColor"),
                listPrepend(
                  $attribute.attribute("stroke-width", "1.5"),
                  listPrepend(
                    $attribute.attribute("vector-effect", "non-scaling-stroke"),
                    $List$Empty$const,
                  ),
                ),
              ),
            ),
          ),
        ),
        $List$Empty$const,
      ),
    );
  }
}

function spend_card(current) {
  return $html.section(
    listPrepend($attribute.class$("card spend"), $List$Empty$const),
    listPrepend(
      section_title("SPEND"),
      listPrepend(
        (() => {
          let $ = current.spend;
          if ($ instanceof Some) {
            let spend = $[0];
            return $html.div(
              $List$Empty$const,
              listPrepend(
                stat("requests 24h", $model.format_count(spend.requests)),
                listPrepend(
                  stat("input tokens", $model.format_count(spend.input_tokens)),
                  listPrepend(
                    stat(
                      "output tokens",
                      $model.format_count(spend.output_tokens),
                    ),
                    listPrepend(
                      sparkline(
                        current,
                        (sample) => { return sample.requests; },
                      ),
                      listPrepend(
                        budget(
                          "upstream calls / min",
                          $model.budget_fraction(
                            spend.used_in_window,
                            spend.max_per_minute,
                          ),
                          ($model.format_count(spend.used_in_window) + " / ") + $model.format_count(
                            spend.max_per_minute,
                          ),
                        ),
                        listPrepend(
                          budget(
                            "balance used",
                            (() => {
                              let $1 = spend.percent_used;
                              if ($1 instanceof Some) {
                                let percent = $1[0];
                                return $model.budget_fraction(
                                  new Some(float_round(percent)),
                                  new Some(100),
                                );
                              } else {
                                return 0.0;
                              }
                            })(),
                            $model.format_percent(spend.percent_used),
                          ),
                          listPrepend(
                            stat(
                              "balance",
                              $model.format_usd(spend.balance_usd),
                            ),
                            listPrepend(
                              $html.span(
                                listPrepend(
                                  $attribute.class$(cache_class(spend)),
                                  $List$Empty$const,
                                ),
                                listPrepend(
                                  text(cache_label(spend)),
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

function short(text_value, limit) {
  let $ = $string.length(text_value) > limit;
  if ($) {
    return $string.slice(text_value, 0, limit) + "…";
  } else {
    return text_value;
  }
}

function freshness_label(freshness) {
  if (freshness instanceof $model.Live) {
    return "live";
  } else if (freshness instanceof $model.Slow) {
    return "slow";
  } else if (freshness instanceof $model.Stale) {
    return "stale";
  } else {
    return "unknown";
  }
}

function or_default_vitals(vitals) {
  if (vitals instanceof Some) {
    let vitals$1 = vitals[0];
    return vitals$1;
  } else {
    return new $model.Vitals(
      Option$None$const,
      Option$None$const,
      $model.Freshness$Unknown$const,
      Option$None$const,
      Option$None$const,
      Option$None$const,
      Option$None$const,
      Option$None$const,
      Option$None$const,
      Option$None$const,
    );
  }
}

function vitals_card(current) {
  let _block;
  let _pipe = current.vitals;
  _block = or_default_vitals(_pipe);
  let vitals = _block;
  return $html.section(
    listPrepend($attribute.class$("card vitals"), $List$Empty$const),
    toList([
      section_title("VITALS"),
      stat("ledger entries", $model.format_count(vitals.entries)),
      stat("ledger size", $model.format_bytes(vitals.ledger_bytes)),
      sparkline(current, (sample) => { return sample.entries; }),
      stat("sync cursor", $model.format_age(vitals.sync_age_s)),
      stat("sync state", freshness_label(vitals.sync_state)),
      stat(
        "sync batch",
        (() => {
          let $ = vitals.sync_batch;
          if ($ instanceof Some) {
            let batch = $[0];
            return "#" + short(batch, 18);
          } else {
            return "—";
          }
        })(),
      ),
      stat("sync seq", $model.format_count(vitals.sync_seq)),
      stat("daemon errors 24h", $model.format_count(vitals.errors_24h)),
      stat("daemon uptime", $model.format_age(vitals.daemon_uptime_s)),
      stat("container uptime", $model.format_age(vitals.container_uptime_s)),
      (() => {
        let $ = current.agents;
        if ($ instanceof $option.Some) {
          let agents = $[0];
          if (!isEqual(agents.retired, new $option.Some(0))) {
            return stat("retired agents", $model.format_count(agents.retired));
          } else {
            return element_none();
          }
        } else {
          return element_none();
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
          return element_none();
        }
      })(),
    ]),
  );
}

function dashboard(current) {
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

function banner(problem) {
  if (problem instanceof Some) {
    let message = problem[0];
    return $html.div(
      listPrepend($attribute.class$("banner"), $List$Empty$const),
      listPrepend(text(message), $List$Empty$const),
    );
  } else {
    return element_none();
  }
}

function mode_label(mode) {
  if (mode instanceof $model.LiveMode) {
    return "live";
  } else {
    return "fake data";
  }
}

function tab_class(showing, tab) {
  let $ = isEqual(showing, tab);
  if ($) {
    return "tab active";
  } else {
    return "tab";
  }
}

function header(current) {
  return $html.header(
    listPrepend($attribute.class$("head"), $List$Empty$const),
    listPrepend(
      $html.h1(
        listPrepend($attribute.class$("title"), $List$Empty$const),
        listPrepend(text("THE WALL"), $List$Empty$const),
      ),
      listPrepend(
        $html.nav(
          listPrepend($attribute.class$("tabs"), $List$Empty$const),
          $list.map(
            listPrepend(
              $model.Tab$Dashboard$const,
              listPrepend($model.Tab$LogsTab$const, $List$Empty$const),
            ),
            (tab) => {
              return $html.button(
                listPrepend(
                  $attribute.attribute("type", "button"),
                  listPrepend(
                    $attribute.class$(tab_class(current.tab, tab)),
                    listPrepend(
                      $event.on_click(new $model.TabChosen(tab)),
                      $List$Empty$const,
                    ),
                  ),
                ),
                listPrepend(
                  text($string.uppercase($model.tab_label(tab))),
                  $List$Empty$const,
                ),
              );
            },
          ),
        ),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("mode"), $List$Empty$const),
            listPrepend(text(mode_label(current.mode)), $List$Empty$const),
          ),
          $List$Empty$const,
        ),
      ),
    ),
  );
}

export function view(current) {
  return $html.div(
    listPrepend($attribute.class$("wall"), $List$Empty$const),
    listPrepend(
      header(current),
      listPrepend(
        banner(current.error),
        listPrepend(
          (() => {
            let $ = current.tab;
            if ($ instanceof $model.Dashboard) {
              return dashboard(current);
            } else {
              return logs_tab(current);
            }
          })(),
          listPrepend(footer(current), $List$Empty$const),
        ),
      ),
    ),
  );
}
