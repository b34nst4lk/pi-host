import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { None, Some } from "../../gleam_stdlib/gleam/option.mjs";
import * as $attribute from "../../lustre/lustre/attribute.mjs";
import * as $element from "../../lustre/lustre/element.mjs";
import { text } from "../../lustre/lustre/element.mjs";
import * as $html from "../../lustre/lustre/element/html.mjs";
import * as $event from "../../lustre/lustre/event.mjs";
import {
  Ok,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  isEqual,
} from "../gleam.mjs";
import * as $browser from "../wall/browser.mjs";
import * as $logs from "../wall/logs.mjs";
import * as $model from "../wall/model.mjs";
import * as $pretty from "../wall/pretty.mjs";
import * as $ui from "../wall/ui.mjs";

export function spill_text(logs, id) {
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
 */
export function spill_block(logs, entry) {
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
    return $ui.element_none();
  }
}

export function kind_class(kind) {
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

/**
 * The row a search hit landed on is marked: landing in a window of ±25 is only
 * useful if you can see which one you asked for.
 */
export function row_class(options, entry) {
  let $ = $browser.is_anchor(options, entry);
  if ($) {
    return "log-row hit";
  } else {
    return "log-row";
  }
}

export function log_row(logs, entry, options) {
  return $html.details(
    listPrepend($attribute.class$(row_class(options, entry)), $List$Empty$const),
    listPrepend(
      $html.summary(
        listPrepend($attribute.class$("log-head"), $List$Empty$const),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("log-at"), $List$Empty$const),
            listPrepend(text($logs.short_time(entry.at)), $List$Empty$const),
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
                  return $ui.element_none();
                }
              })(),
              listPrepend(
                $html.span(
                  listPrepend($attribute.class$("log-text"), $List$Empty$const),
                  listPrepend(text(entry.text), $List$Empty$const),
                ),
                listPrepend(
                  (() => {
                    let $ = $browser.is_anchor(options, entry);
                    if ($) {
                      return $html.span(
                        listPrepend(
                          $attribute.class$("log-hit"),
                          $List$Empty$const,
                        ),
                        listPrepend(text("hit"), $List$Empty$const),
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
        ),
      ),
      listPrepend(
        $html.pre(
          listPrepend($attribute.class$("log-raw"), $List$Empty$const),
          listPrepend(text($pretty.json(entry.raw)), $List$Empty$const),
        ),
        listPrepend(spill_block(logs, entry), $List$Empty$const),
      ),
    ),
  );
}

/**
 * A compaction boundary: a full-width rule with the summary one click away. The
 * entries on either side stay in the same list, in the same order.
 */
export function divider_row(entry, seen) {
  return $html.div(
    listPrepend($attribute.class$("log-divider"), $List$Empty$const),
    listPrepend(
      $html.span(
        listPrepend($attribute.class$("divider-rule"), $List$Empty$const),
        listPrepend(text($browser.divider_label(seen)), $List$Empty$const),
      ),
      listPrepend(
        $html.details(
          listPrepend($attribute.class$("divider-summary"), $List$Empty$const),
          listPrepend(
            $html.summary(
              listPrepend($attribute.class$("divider-head"), $List$Empty$const),
              listPrepend(
                text("summary · " + $logs.short_time(entry.at)),
                $List$Empty$const,
              ),
            ),
            listPrepend(
              $html.pre(
                listPrepend($attribute.class$("log-raw"), $List$Empty$const),
                listPrepend(text($pretty.json(entry.raw)), $List$Empty$const),
              ),
              $List$Empty$const,
            ),
          ),
        ),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("divider-rule"), $List$Empty$const),
            $List$Empty$const,
          ),
          $List$Empty$const,
        ),
      ),
    ),
  );
}

/**
 * The one place rows and dividers are interleaved, so LOGS and the browser pane
 * cannot drift apart. The fold carries how many compaction dividers have been
 * drawn so far: the first one says history *begins*, later ones say it
 * *continues*, and nothing above or below is collapsed.
 */
export function stream_rows(logs, entries, options) {
  let $ = $list.fold(
    entries,
    [$List$Empty$const, 0],
    (state, entry) => {
      let done = state[0];
      let seen = state[1];
      let $1 = options.dividers && $browser.is_divider(entry.kind);
      if ($1) {
        return [listPrepend(divider_row(entry, seen), done), seen + 1];
      } else {
        return [listPrepend(log_row(logs, entry, options), done), seen];
      }
    },
  );
  let rendered = $[0];
  return $list.reverse(rendered);
}

export function log_rows(logs, options) {
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
      stream_rows(logs, entries, options),
    );
  }
}

export function chip_class(active) {
  if (active) {
    return "chip active";
  } else {
    return "chip";
  }
}

export function kind_chips(filters) {
  return $list.map(
    $logs.log_kinds,
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

export function or_default_logs(logs) {
  if (logs instanceof Some) {
    let logs$1 = logs[0];
    return logs$1;
  } else {
    return $logs.empty_logs();
  }
}

export function logs_tab(current) {
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
                $logs.Direction$BothWays$const,
                listPrepend(
                  $logs.Direction$Incoming$const,
                  listPrepend($logs.Direction$Outgoing$const, $List$Empty$const),
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
                    text($logs.direction_label(direction)),
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
          listPrepend(text($logs.logs_line(logs)), $List$Empty$const),
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
              return $ui.element_none();
            }
          })(),
          listPrepend(
            log_rows(logs, $browser.log_options()),
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
                  return $ui.element_none();
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
