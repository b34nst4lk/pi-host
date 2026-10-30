import * as $json from "../../gleam_json/gleam/json.mjs";
import * as $decode from "../../gleam_stdlib/gleam/dynamic/decode.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  Ok,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
} from "../gleam.mjs";

/**
 * Two spaces per level, the width `JSON.stringify(…, null, 2)` uses.
 * 
 * @ignore
 */
const tab = "  ";

/**
 * Records longer than this are shown as they arrived: an indent pass on a
 * megabyte of thinking buys nothing and costs a repaint. (The reader caps a page
 * at 200 rows, so this is a ceiling on one row, not on a page.)
 */
export const max_pretty_chars = 100_000;

function literal_body(loop$rest, loop$out) {
  while (true) {
    let rest = loop$rest;
    let out = loop$out;
    if (rest instanceof $Empty) {
      return [out, $List$Empty$const];
    } else {
      let $ = rest.tail;
      if ($ instanceof $Empty) {
        let $1 = rest.head;
        if ($1 === "\"") {
          let tail = $;
          return [out + "\"", tail];
        } else {
          let token = $1;
          let tail = $;
          loop$rest = tail;
          loop$out = out + token;
        }
      } else {
        let $1 = rest.head;
        if ($1 === "\\") {
          let escaped = $.head;
          let tail = $.tail;
          loop$rest = tail;
          loop$out = (out + "\\") + escaped;
        } else if ($1 === "\"") {
          let tail = $;
          return [out + "\"", tail];
        } else {
          let token = $1;
          let tail = $;
          loop$rest = tail;
          loop$out = out + token;
        }
      }
    }
  }
}

/**
 * A whole string literal, quotes included, escapes intact.
 * 
 * @ignore
 */
function literal(tokens) {
  if (tokens instanceof $Empty) {
    return ["", tokens];
  } else if (tokens.head === "\"") {
    let tail = tokens.tail;
    return literal_body(tail, "\"");
  } else {
    return ["", tokens];
  }
}

function int_max(depth) {
  let $ = depth < 0;
  if ($) {
    return 0;
  } else {
    return depth;
  }
}

function indent(depth) {
  return $string.repeat(tab, int_max(depth));
}

function drop_space(loop$tokens) {
  while (true) {
    let tokens = loop$tokens;
    if (tokens instanceof $Empty) {
      return tokens;
    } else {
      let $ = tokens.head;
      if ($ === " ") {
        let rest = tokens.tail;
        loop$tokens = rest;
      } else if ($ === "\n") {
        let rest = tokens.tail;
        loop$tokens = rest;
      } else if ($ === "\r") {
        let rest = tokens.tail;
        loop$tokens = rest;
      } else if ($ === "\t") {
        let rest = tokens.tail;
        loop$tokens = rest;
      } else {
        return tokens;
      }
    }
  }
}

/**
 * An opener, then either its matching closer straight away (`{}`, `[]`) or a
 * newline and one more level of indentation.
 * 
 * @ignore
 */
function open(opener, rest, closer, depth, out) {
  let $ = drop_space(rest);
  if ($ instanceof $Empty) {
    return tokens(rest, depth + 1, ((out + opener) + "\n") + indent(depth + 1));
  } else {
    let next = $.head;
    if (next === closer) {
      let tail = $.tail;
      return tokens(tail, depth, (out + opener) + closer);
    } else {
      return tokens(
        rest,
        depth + 1,
        ((out + opener) + "\n") + indent(depth + 1),
      );
    }
  }
}

function tokens(loop$rest, loop$depth, loop$out) {
  while (true) {
    let rest = loop$rest;
    let depth = loop$depth;
    let out = loop$out;
    let $ = drop_space(rest);
    if ($ instanceof $Empty) {
      return out;
    } else {
      let token = $.head;
      let tail = $.tail;
      if (token === "{") {
        return open(token, tail, "}", depth, out);
      } else if (token === "[") {
        return open(token, tail, "]", depth, out);
      } else if (token === "}") {
        loop$rest = tail;
        loop$depth = depth - 1;
        loop$out = ((out + "\n") + indent(depth - 1)) + token;
      } else if (token === "]") {
        loop$rest = tail;
        loop$depth = depth - 1;
        loop$out = ((out + "\n") + indent(depth - 1)) + token;
      } else if (token === ",") {
        loop$rest = tail;
        loop$depth = depth;
        loop$out = (out + ",\n") + indent(depth);
      } else if (token === ":") {
        loop$rest = tail;
        loop$depth = depth;
        loop$out = out + ": ";
      } else if (token === "\"") {
        let $1 = literal(listPrepend(token, tail));
        let literal$1 = $1[0];
        let rest$1 = $1[1];
        loop$rest = rest$1;
        loop$depth = depth;
        loop$out = out + literal$1;
      } else {
        loop$rest = tail;
        loop$depth = depth;
        loop$out = out + token;
      }
    }
  }
}

/**
 * Indent `raw` if it is JSON; otherwise hand it back untouched.
 */
export function json(raw) {
  let trimmed = $string.trim(raw);
  let $ = $string.length(trimmed) > max_pretty_chars;
  if ($) {
    return raw;
  } else {
    let $1 = $json.parse(trimmed, $decode.dynamic);
    if ($1 instanceof Ok) {
      return tokens($string.to_graphemes(trimmed), 0, "");
    } else {
      return raw;
    }
  }
}
