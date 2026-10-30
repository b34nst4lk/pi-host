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
import { List$Empty$const as $List$Empty$const, prepend as listPrepend } from "../gleam.mjs";
import * as $logs from "../wall/logs.mjs";
import * as $model from "../wall/model.mjs";

export function section_title(label) {
  return $html.h2(
    listPrepend($attribute.class$("card-title"), $List$Empty$const),
    listPrepend(text(label), $List$Empty$const),
  );
}

export function stat(label, value) {
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

export function sparkline(current, pick) {
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

export function budget(label, fraction, value) {
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

export function element_none() {
  return $html.span(
    listPrepend($attribute.class$("hidden"), $List$Empty$const),
    $List$Empty$const,
  );
}

export function freshness_label(freshness) {
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

export function cache_class(spend) {
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

export function cache_label(spend) {
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

export function short(text_value, limit) {
  let $ = $string.length(text_value) > limit;
  if ($) {
    return $string.slice(text_value, 0, limit) + "…";
  } else {
    return text_value;
  }
}

export function float_round(value) {
  return $float.round(value);
}

export function or_default_vitals(vitals) {
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

export function or_default_agents(agents) {
  if (agents instanceof Some) {
    let agents$1 = agents[0];
    return agents$1;
  } else {
    return $model.empty_agents();
  }
}

export function or_default_queue(queue) {
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

/**
 * The logs a tab renders when nothing has arrived yet.
 */
export function or_default_logs(value) {
  if (value instanceof Some) {
    let value$1 = value[0];
    return value$1;
  } else {
    return $logs.empty_logs();
  }
}
