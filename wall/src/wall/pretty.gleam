//// Indenting a JSON record for display.
////
//// The reader hands the wall each ledger record verbatim (`raw`, one long line
//// of compact JSON), because re-serialising it there would lose whatever the
//// harness actually wrote. That is the right thing for the wire and the wrong
//// thing for a human: one 4 KB line, no way in. So the wall indents it at render
//// time and never anywhere else — the transport shape stays untouched.
////
//// Two rules keep this safe:
////
//// 1. a record that does not parse as JSON is returned **unchanged** (a
////    half-written row is still worth reading);
//// 2. nothing inside a string literal is touched, so a record quoting `{`, `,`
////    or `\"` survives the trip.

import gleam/dynamic/decode
import gleam/json
import gleam/string

/// Records longer than this are shown as they arrived: an indent pass on a
/// megabyte of thinking buys nothing and costs a repaint. (The reader caps a page
/// at 200 rows, so this is a ceiling on one row, not on a page.)
pub const max_pretty_chars = 100_000

/// Two spaces per level, the width `JSON.stringify(…, null, 2)` uses.
const tab = "  "

/// Indent `raw` if it is JSON; otherwise hand it back untouched.
pub fn json(raw: String) -> String {
  let trimmed = string.trim(raw)
  case string.length(trimmed) > max_pretty_chars {
    True -> raw
    False ->
      case json.parse(trimmed, using: decode.dynamic) {
        Error(_) -> raw
        Ok(_) -> tokens(string.to_graphemes(trimmed), 0, "")
      }
  }
}

fn tokens(rest: List(String), depth: Int, out: String) -> String {
  // whitespace between tokens is ours to decide, so it never reaches `out`
  case drop_space(rest) {
    [] -> out
    [token, ..tail] ->
      case token {
        "{" -> open(token, tail, "}", depth, out)
        "[" -> open(token, tail, "]", depth, out)
        "}" | "]" -> tokens(tail, depth - 1, out <> "\n" <> indent(depth - 1) <> token)
        "," -> tokens(tail, depth, out <> ",\n" <> indent(depth))
        ":" -> tokens(tail, depth, out <> ": ")
        "\"" -> {
          let #(literal, rest) = literal([token, ..tail])
          tokens(rest, depth, out <> literal)
        }
        // numbers, true, false, null: copied as they are
        _ -> tokens(tail, depth, out <> token)
      }
  }
}

/// An opener, then either its matching closer straight away (`{}`, `[]`) or a
/// newline and one more level of indentation.
fn open(opener: String, rest: List(String), closer: String, depth: Int, out: String) -> String {
  case drop_space(rest) {
    [next, ..tail] if next == closer -> tokens(tail, depth, out <> opener <> closer)
    _ -> tokens(rest, depth + 1, out <> opener <> "\n" <> indent(depth + 1))
  }
}

/// A whole string literal, quotes included, escapes intact.
fn literal(tokens: List(String)) -> #(String, List(String)) {
  case tokens {
    ["\"", ..tail] -> literal_body(tail, "\"")
    _ -> #("", tokens)
  }
}

fn literal_body(rest: List(String), out: String) -> #(String, List(String)) {
  case rest {
    [] -> #(out, [])
    // the escaped character is copied with the backslash, quote or not
    ["\\", escaped, ..tail] -> literal_body(tail, out <> "\\" <> escaped)
    ["\"", ..tail] -> #(out <> "\"", tail)
    [token, ..tail] -> literal_body(tail, out <> token)
  }
}

fn drop_space(tokens: List(String)) -> List(String) {
  case tokens {
    [" ", ..rest] | ["\n", ..rest] | ["\r", ..rest] | ["\t", ..rest] -> drop_space(rest)
    _ -> tokens
  }
}

fn indent(depth: Int) -> String {
  string.repeat(tab, int_max(depth))
}

fn int_max(depth: Int) -> Int {
  case depth < 0 {
    True -> 0
    False -> depth
  }
}
