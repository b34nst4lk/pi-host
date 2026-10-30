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
import {
  toList,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
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
  return $html.section(
    listPrepend($attribute.class$("card queue"), $List$Empty$const),
    listPrepend(
      section_title("QUEUE"),
      listPrepend(
        stat("inbox depth", $model.format_count(queue.inbox_depth)),
        listPrepend(
          stat("tasks running", $model.format_count(queue.running)),
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

function fleet_card(current) {
  return $html.section(
    listPrepend($attribute.class$("card fleet"), $List$Empty$const),
    listPrepend(
      section_title("FLEET"),
      listPrepend(
        (() => {
          let $ = current.fleet;
          if ($ instanceof $Empty) {
            return $html.p(
              listPrepend($attribute.class$("muted"), $List$Empty$const),
              listPrepend(text("no subagents"), $List$Empty$const),
            );
          } else {
            let agents = $;
            return $html.div(
              listPrepend($attribute.class$("agents"), $List$Empty$const),
              $list.map(
                agents,
                (agent) => {
                  return $html.div(
                    listPrepend($attribute.class$("agent"), $List$Empty$const),
                    listPrepend(
                      $html.div(
                        listPrepend(
                          $attribute.class$("agent-name"),
                          $List$Empty$const,
                        ),
                        listPrepend(text(agent.name), $List$Empty$const),
                      ),
                      listPrepend(
                        $html.div(
                          listPrepend(
                            $attribute.class$("agent-state"),
                            $List$Empty$const,
                          ),
                          listPrepend(text(agent.state), $List$Empty$const),
                        ),
                        listPrepend(
                          $html.div(
                            listPrepend(
                              $attribute.class$("agent-branch"),
                              $List$Empty$const,
                            ),
                            listPrepend(text(agent.branch), $List$Empty$const),
                          ),
                          listPrepend(
                            $html.div(
                              listPrepend(
                                $attribute.class$("agent-worktree"),
                                $List$Empty$const,
                              ),
                              listPrepend(
                                text(agent.worktree),
                                $List$Empty$const,
                              ),
                            ),
                            listPrepend(
                              $html.div(
                                listPrepend(
                                  $attribute.class$("agent-reports"),
                                  $List$Empty$const,
                                ),
                                listPrepend(
                                  text(
                                    $int.to_string(agent.reports) + " report(s)",
                                  ),
                                  $List$Empty$const,
                                ),
                              ),
                              $List$Empty$const,
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          }
        })(),
        $List$Empty$const,
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

function element_none() {
  return $html.span(
    listPrepend($attribute.class$("hidden"), $List$Empty$const),
    $List$Empty$const,
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

function header(current) {
  return $html.header(
    listPrepend($attribute.class$("head"), $List$Empty$const),
    listPrepend(
      $html.h1(
        listPrepend($attribute.class$("title"), $List$Empty$const),
        listPrepend(text("THE WALL"), $List$Empty$const),
      ),
      listPrepend(
        $html.span(
          listPrepend($attribute.class$("mode"), $List$Empty$const),
          listPrepend(text(mode_label(current.mode)), $List$Empty$const),
        ),
        $List$Empty$const,
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
          $html.div(
            listPrepend($attribute.class$("grid"), $List$Empty$const),
            listPrepend(
              vitals_card(current),
              listPrepend(
                spend_card(current),
                listPrepend(
                  fleet_card(current),
                  listPrepend(queue_card(current), $List$Empty$const),
                ),
              ),
            ),
          ),
          listPrepend(footer(current), $List$Empty$const),
        ),
      ),
    ),
  );
}
