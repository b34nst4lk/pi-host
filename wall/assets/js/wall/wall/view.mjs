import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { None, Some } from "../../gleam_stdlib/gleam/option.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import * as $attribute from "../../lustre/lustre/attribute.mjs";
import * as $element from "../../lustre/lustre/element.mjs";
import { text } from "../../lustre/lustre/element.mjs";
import * as $html from "../../lustre/lustre/element/html.mjs";
import * as $event from "../../lustre/lustre/event.mjs";
import { List$Empty$const as $List$Empty$const, prepend as listPrepend, isEqual } from "../gleam.mjs";
import * as $browser_view from "../wall/browser_view.mjs";
import * as $dashboard from "../wall/dashboard.mjs";
import * as $logs from "../wall/logs.mjs";
import * as $logs_view from "../wall/logs_view.mjs";
import * as $model from "../wall/model.mjs";
import * as $ui from "../wall/ui.mjs";

function footer(current) {
  return $html.footer(
    listPrepend($attribute.class$("foot"), $List$Empty$const),
    listPrepend(
      text(("poll #" + $int.to_string(current.polls)) + " · contract v1"),
      $List$Empty$const,
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
    return $ui.element_none();
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
              $logs.Tab$Dashboard$const,
              listPrepend(
                $logs.Tab$LogsTab$const,
                listPrepend(
                  $logs.Tab$BrowserTab$const,
                  listPrepend($logs.Tab$ProjectsTab$const, $List$Empty$const),
                ),
              ),
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
                  text($string.uppercase($logs.tab_label(tab))),
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
            if ($ instanceof $logs.Dashboard) {
              return $dashboard.dashboard(current);
            } else if ($ instanceof $logs.LogsTab) {
              return $logs_view.logs_tab(current);
            } else if ($ instanceof $logs.BrowserTab) {
              return $browser_view.browser_tab(current);
            } else {
              return $dashboard.projects_tab(current);
            }
          })(),
          listPrepend(footer(current), $List$Empty$const),
        ),
      ),
    ),
  );
}
