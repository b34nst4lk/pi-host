import * as $float from "../../gleam_stdlib/gleam/float.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { None, Some } from "../../gleam_stdlib/gleam/option.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  divideFloat,
} from "../gleam.mjs";

function chunks_of_three(loop$remaining, loop$acc) {
  while (true) {
    let remaining = loop$remaining;
    let acc = loop$acc;
    let $ = $string.length(remaining);
    if ($ === 0) {
      return $list.reverse(acc);
    } else {
      loop$remaining = $string.drop_start(remaining, 3);
      loop$acc = listPrepend($string.slice(remaining, 0, 3), acc);
    }
  }
}

/**
 * `1832` → `1,832`; `1234567` → `1,234,567`; keeps a leading minus.
 * 
 * @ignore
 */
function group_digits(text) {
  let negative = $string.starts_with(text, "-");
  let _block;
  if (negative) {
    _block = $string.drop_start(text, 1);
  } else {
    _block = text;
  }
  let digits = _block;
  let _block$1;
  let $ = $string.length(digits) % 3;
  if ($ === 0) {
    _block$1 = 3;
  } else {
    _block$1 = $;
  }
  let head_length = _block$1;
  let head = $string.slice(digits, 0, head_length);
  let tail = chunks_of_three(
    $string.drop_start(digits, head_length),
    $List$Empty$const,
  );
  let grouped = $string.join(listPrepend(head, tail), ",");
  if (negative) {
    return "-" + grouped;
  } else {
    return grouped;
  }
}

/**
 * One decimal place, with a trailing `.0` dropped: `1.2`, `3`, `5.6`.
 * 
 * @ignore
 */
function one_decimal(value) {
  let tenths = $float.round(value * 10.0);
  let whole = globalThis.Math.trunc(tenths / 10);
  let fraction = $int.absolute_value(tenths % 10);
  if (fraction === 0) {
    return $int.to_string(whole);
  } else {
    return ($int.to_string(whole) + ".") + $int.to_string(fraction);
  }
}

/**
 * `—` for nothing, `12,043` for counts, `1.2M` above a million.
 */
export function format_count(value) {
  if (value instanceof Some) {
    let value$1 = value[0];
    let magnitude = $int.absolute_value(value$1);
    let $ = magnitude >= 1_000_000;
    if ($) {
      return one_decimal($int.to_float(value$1) / 1000000.0) + "M";
    } else {
      let $1 = magnitude >= 10_000;
      if ($1) {
        return one_decimal($int.to_float(value$1) / 1000.0) + "k";
      } else {
        return group_digits($int.to_string(value$1));
      }
    }
  } else {
    return "—";
  }
}

/**
 * `—` for nothing, `820 KB`/`1.4 MB` for byte counts.
 */
export function format_bytes(value) {
  if (value instanceof Some) {
    let $ = value[0];
    if ($ === 0) {
      return "0 B";
    } else {
      let bytes = $;
      let as_float = $int.to_float(bytes);
      let $1 = as_float >= (1024.0 * 1024.0);
      if ($1) {
        return one_decimal(divideFloat(as_float, (1024.0 * 1024.0))) + " MB";
      } else {
        let $2 = as_float >= 1024.0;
        if ($2) {
          return one_decimal(as_float / 1024.0) + " KB";
        } else {
          return $int.to_string(bytes) + " B";
        }
      }
    }
  } else {
    return "—";
  }
}

function pad2(value) {
  let $ = value < 10;
  if ($) {
    return "0" + $int.to_string(value);
  } else {
    return $int.to_string(value);
  }
}

/**
 * `—` for nothing, `7 s`/`42 min`/`3 h 07 m` for durations.
 */
export function format_age(seconds) {
  if (seconds instanceof Some) {
    let seconds$1 = seconds[0];
    let $ = seconds$1 < 90;
    if ($) {
      return $int.to_string(seconds$1) + " s";
    } else {
      let $1 = seconds$1 < 3600;
      if ($1) {
        return $int.to_string(globalThis.Math.trunc(seconds$1 / 60)) + " min";
      } else {
        return (($int.to_string(globalThis.Math.trunc(seconds$1 / 3600)) + " h ") + pad2(
          globalThis.Math.trunc(((seconds$1 % 3600)) / 60),
        )) + " m";
      }
    }
  } else {
    return "—";
  }
}

/**
 * `$0.00`, always two decimals.
 */
export function format_usd(value) {
  if (value instanceof Some) {
    let usd = value[0];
    let cents = $float.round(usd * 100.0);
    let _block;
    let $ = cents < 0;
    if ($) {
      _block = "-";
    } else {
      _block = "";
    }
    let sign = _block;
    let absolute = $int.absolute_value(cents);
    return ((("$" + sign) + $int.to_string(
      globalThis.Math.trunc(absolute / 100),
    )) + ".") + pad2(absolute % 100);
  } else {
    return "—";
  }
}

/**
 * `12%`, whole numbers, `—` when unknown.
 */
export function format_percent(value) {
  if (value instanceof Some) {
    let percent = value[0];
    return $int.to_string($float.round(percent)) + "%";
  } else {
    return "—";
  }
}

/**
 * A budget bar's fill in `0.0..1.0`; clamped, so the bar never overflows.
 */
export function budget_fraction(used, limit) {
  if (used instanceof Some && limit instanceof Some) {
    let used$1 = used[0];
    let limit$1 = limit[0];
    let $ = limit$1 <= 0;
    if ($) {
      return 0.0;
    } else {
      return $float.max(
        0.0,
        $float.min(
          1.0,
          divideFloat($int.to_float(used$1), $int.to_float(limit$1)),
        ),
      );
    }
  } else {
    return 0.0;
  }
}
