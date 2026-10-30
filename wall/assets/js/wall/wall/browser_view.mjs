import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { None, Some } from "../../gleam_stdlib/gleam/option.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import * as $attribute from "../../lustre/lustre/attribute.mjs";
import * as $element from "../../lustre/lustre/element.mjs";
import { text } from "../../lustre/lustre/element.mjs";
import * as $html from "../../lustre/lustre/element/html.mjs";
import * as $event from "../../lustre/lustre/event.mjs";
import {
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
} from "../gleam.mjs";
import * as $browser from "../wall/browser.mjs";
import * as $logs from "../wall/logs.mjs";
import * as $logs_view from "../wall/logs_view.mjs";
import * as $model from "../wall/model.mjs";
import * as $ui from "../wall/ui.mjs";

export function pane_title(item) {
  let $ = $browser.selected_conversation(item);
  if ($ instanceof Some) {
    let space = $[0];
    return (space.title + " · ") + $model.agent_state_label(space.state);
  } else {
    return "select a space";
  }
}

export function browser_pane(browser) {
  let logs = $ui.or_default_logs(browser.stream);
  return $html.div(
    listPrepend($attribute.class$("pane"), $List$Empty$const),
    listPrepend(
      $html.div(
        listPrepend($attribute.class$("pane-head"), $List$Empty$const),
        listPrepend(
          $html.h2(
            listPrepend($attribute.class$("pane-title"), $List$Empty$const),
            listPrepend(text(pane_title(browser)), $List$Empty$const),
          ),
          listPrepend(
            (() => {
              let $ = browser.anchor;
              if ($ instanceof Some) {
                return $html.button(
                  listPrepend(
                    $attribute.attribute("type", "button"),
                    listPrepend(
                      $attribute.class$("older"),
                      listPrepend(
                        $event.on_click($model.Msg$BrowserTailRequested$const),
                        $List$Empty$const,
                      ),
                    ),
                  ),
                  listPrepend(text("back to the tail"), $List$Empty$const),
                );
              } else {
                return $ui.element_none();
              }
            })(),
            listPrepend(
              $html.span(
                listPrepend($attribute.class$("log-line"), $List$Empty$const),
                listPrepend(text($logs.logs_line(logs)), $List$Empty$const),
              ),
              $List$Empty$const,
            ),
          ),
        ),
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
          $logs_view.log_rows(logs, $browser.browser_options(browser.anchor)),
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
  );
}

/**
 * One space: title, the same state badge the AGENTS card uses, how many entries
 * it holds and when it ran. The main conversation is pinned first by
 * `browser.order_conversations`.
 */
export function conversation_card(browser, item) {
  return $html.button(
    listPrepend(
      $attribute.attribute("type", "button"),
      listPrepend(
        $attribute.class$($browser.space_class(browser.selected, item.id)),
        listPrepend(
          $event.on_click(new $model.ConversationChosen(item.id)),
          $List$Empty$const,
        ),
      ),
    ),
    listPrepend(
      $html.span(
        listPrepend($attribute.class$("space-head"), $List$Empty$const),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("space-title"), $List$Empty$const),
            listPrepend(text(item.title), $List$Empty$const),
          ),
          listPrepend(
            $html.span(
              listPrepend(
                $attribute.class$($model.agent_state_class(item.state)),
                $List$Empty$const,
              ),
              listPrepend(
                text($model.agent_state_label(item.state)),
                $List$Empty$const,
              ),
            ),
            $List$Empty$const,
          ),
        ),
      ),
      listPrepend(
        $html.span(
          listPrepend($attribute.class$("space-meta"), $List$Empty$const),
          listPrepend(text($browser.conversation_line(item)), $List$Empty$const),
        ),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("space-meta"), $List$Empty$const),
            listPrepend(
              text($browser.conversation_span(item)),
              $List$Empty$const,
            ),
          ),
          $List$Empty$const,
        ),
      ),
    ),
  );
}

export function conversation_rail(browser) {
  return $html.div(
    listPrepend($attribute.class$("rail"), $List$Empty$const),
    listPrepend(
      $html.p(
        listPrepend($attribute.class$("rail-head"), $List$Empty$const),
        listPrepend(text("spaces"), $List$Empty$const),
      ),
      listPrepend(
        (() => {
          let $ = browser.conversations_error;
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
          (() => {
            let $ = $browser.order_conversations(browser.conversations);
            if ($ instanceof $Empty) {
              return $html.p(
                listPrepend($attribute.class$("muted"), $List$Empty$const),
                listPrepend(text("no conversations yet"), $List$Empty$const),
              );
            } else {
              let items = $;
              return $html.div(
                listPrepend($attribute.class$("rail-cards"), $List$Empty$const),
                $list.map(
                  items,
                  (item) => { return conversation_card(browser, item); },
                ),
              );
            }
          })(),
          $List$Empty$const,
        ),
      ),
    ),
  );
}

/**
 * A hit line is one line: the full text is in the row you land on.
 */
export function clip(text, limit) {
  let $ = $string.length(text) > limit;
  if ($) {
    return $string.slice(text, 0, limit) + "…";
  } else {
    return text;
  }
}

/**
 * One hit: which space, when, which kind, and the matched line. Clicking it
 * selects that space and opens a window around the entry.
 */
export function hit_row(hit) {
  return $html.button(
    listPrepend(
      $attribute.attribute("type", "button"),
      listPrepend(
        $attribute.class$("hit"),
        listPrepend(
          $event.on_click(new $model.HitChosen(hit.conversation, hit.entry)),
          $List$Empty$const,
        ),
      ),
    ),
    listPrepend(
      $html.span(
        listPrepend($attribute.class$("hit-space"), $List$Empty$const),
        listPrepend(text(hit.conversation_title), $List$Empty$const),
      ),
      listPrepend(
        $html.span(
          listPrepend($attribute.class$("hit-at"), $List$Empty$const),
          listPrepend(text($logs.short_stamp(hit.at)), $List$Empty$const),
        ),
        listPrepend(
          $html.span(
            listPrepend(
              $attribute.class$("log-kind " + $logs_view.kind_class(hit.kind)),
              $List$Empty$const,
            ),
            listPrepend(text(hit.kind), $List$Empty$const),
          ),
          listPrepend(
            $html.span(
              listPrepend($attribute.class$("hit-text"), $List$Empty$const),
              listPrepend(text(clip(hit.text, 160)), $List$Empty$const),
            ),
            $List$Empty$const,
          ),
        ),
      ),
    ),
  );
}

export function browser_hits(search) {
  let $ = search.asked;
  let $1 = search.hits;
  let $2 = search.error;
  if ($1 instanceof $Empty && $2 instanceof None && $ === "") {
    return $ui.element_none();
  } else {
    return $html.div(
      listPrepend($attribute.class$("hits"), $List$Empty$const),
      listPrepend(
        (() => {
          let $3 = search.error;
          if ($3 instanceof Some) {
            let problem = $3[0];
            return $html.p(
              listPrepend($attribute.class$("banner"), $List$Empty$const),
              listPrepend(text(problem), $List$Empty$const),
            );
          } else {
            return $ui.element_none();
          }
        })(),
        listPrepend(
          $html.div(
            listPrepend($attribute.class$("hit-rows"), $List$Empty$const),
            $list.map(search.hits, hit_row),
          ),
          $List$Empty$const,
        ),
      ),
    );
  }
}

export function browser_search(search) {
  return $html.div(
    listPrepend(
      $attribute.class$("log-controls browser-search"),
      $List$Empty$const,
    ),
    listPrepend(
      $html.input(
        listPrepend(
          $attribute.attribute("type", "search"),
          listPrepend(
            $attribute.attribute(
              "placeholder",
              "search every conversation — enter",
            ),
            listPrepend(
              $attribute.attribute("value", search.query),
              listPrepend(
                $attribute.class$("search"),
                listPrepend(
                  $event.on_input(
                    (var0) => { return new $model.SearchChanged(var0); },
                  ),
                  listPrepend(
                    $event.on_keydown(
                      (var0) => { return new $model.SearchKeyed(var0); },
                    ),
                    $List$Empty$const,
                  ),
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
                $event.on_click($model.Msg$SearchSubmitted$const),
                $List$Empty$const,
              ),
            ),
          ),
          listPrepend(text("search"), $List$Empty$const),
        ),
        listPrepend(
          $html.span(
            listPrepend($attribute.class$("log-line"), $List$Empty$const),
            listPrepend(text($browser.search_line(search)), $List$Empty$const),
          ),
          $List$Empty$const,
        ),
      ),
    ),
  );
}

/**
 * Search box on top, jump list under it, then rail + pane. The search is over
 * every conversation, so a hit can be in a space that is not the one on screen.
 */
export function browser_tab(current) {
  let browser = current.browser;
  return $html.section(
    listPrepend($attribute.class$("browser"), $List$Empty$const),
    listPrepend(
      browser_search(browser.search),
      listPrepend(
        browser_hits(browser.search),
        listPrepend(
          $html.div(
            listPrepend($attribute.class$("browser-body"), $List$Empty$const),
            listPrepend(
              conversation_rail(browser),
              listPrepend(browser_pane(browser), $List$Empty$const),
            ),
          ),
          $List$Empty$const,
        ),
      ),
    ),
  );
}
