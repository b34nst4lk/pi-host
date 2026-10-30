//// Human formatting for the wall: counts, bytes, ages, money, percentages.
////
//// Every function takes what the reader can fail to provide as an `Option` and
//// renders `—` for `None` rather than inventing a zero. No contract types live
//// here, so anything may import this module.

import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

/// `—` for nothing, `12,043` for counts, `1.2M` above a million.
pub fn format_count(value: Option(Int)) -> String {
  case value {
    None -> "—"
    Some(value) -> {
      let magnitude = int.absolute_value(value)
      case magnitude >= 1_000_000 {
        True -> one_decimal(int.to_float(value) /. 1_000_000.0) <> "M"
        False ->
          case magnitude >= 10_000 {
            True -> one_decimal(int.to_float(value) /. 1_000.0) <> "k"
            False -> group_digits(int.to_string(value))
          }
      }
    }
  }
}

/// `—` for nothing, `820 KB`/`1.4 MB` for byte counts.
pub fn format_bytes(value: Option(Int)) -> String {
  case value {
    None -> "—"
    Some(0) -> "0 B"
    Some(bytes) -> {
      let as_float = int.to_float(bytes)
      case as_float >=. 1024.0 *. 1024.0 {
        True -> one_decimal(as_float /. { 1024.0 *. 1024.0 }) <> " MB"
        False ->
          case as_float >=. 1024.0 {
            True -> one_decimal(as_float /. 1024.0) <> " KB"
            False -> int.to_string(bytes) <> " B"
          }
      }
    }
  }
}

/// `—` for nothing, `7 s`/`42 min`/`3 h 07 m` for durations.
pub fn format_age(seconds: Option(Int)) -> String {
  case seconds {
    None -> "—"
    Some(seconds) ->
      case seconds < 90 {
        True -> int.to_string(seconds) <> " s"
        False ->
          case seconds < 3600 {
            True -> int.to_string(seconds / 60) <> " min"
            False -> int.to_string(seconds / 3600) <> " h " <> pad2(seconds % 3600 / 60) <> " m"
          }
      }
  }
}

/// `$0.00`, always two decimals.
pub fn format_usd(value: Option(Float)) -> String {
  case value {
    None -> "—"
    Some(usd) -> {
      let cents = float.round(usd *. 100.0)
      let sign = case cents < 0 {
        True -> "-"
        False -> ""
      }
      let absolute = int.absolute_value(cents)
      "$" <> sign <> int.to_string(absolute / 100) <> "." <> pad2(absolute % 100)
    }
  }
}

/// `12%`, whole numbers, `—` when unknown.
pub fn format_percent(value: Option(Float)) -> String {
  case value {
    None -> "—"
    Some(percent) -> int.to_string(float.round(percent)) <> "%"
  }
}

/// A budget bar's fill in `0.0..1.0`; clamped, so the bar never overflows.
pub fn budget_fraction(used: Option(Int), limit: Option(Int)) -> Float {
  case used, limit {
    Some(used), Some(limit) ->
      case limit <= 0 {
        True -> 0.0
        False -> float.max(0.0, float.min(1.0, int.to_float(used) /. int.to_float(limit)))
      }
    _, _ -> 0.0
  }
}



/// One decimal place, with a trailing `.0` dropped: `1.2`, `3`, `5.6`.
fn one_decimal(value: Float) -> String {
  let tenths = float.round(value *. 10.0)
  let whole = tenths / 10
  let fraction = int.absolute_value(tenths % 10)
  case fraction {
    0 -> int.to_string(whole)
    _ -> int.to_string(whole) <> "." <> int.to_string(fraction)
  }
}

fn pad2(value: Int) -> String {
  case value < 10 {
    True -> "0" <> int.to_string(value)
    False -> int.to_string(value)
  }
}

/// `1832` → `1,832`; `1234567` → `1,234,567`; keeps a leading minus.
fn group_digits(text: String) -> String {
  let negative = string.starts_with(text, "-")
  let digits = case negative {
    True -> string.drop_start(text, 1)
    False -> text
  }
  let head_length = case string.length(digits) % 3 {
    0 -> 3
    remainder -> remainder
  }
  let head = string.slice(digits, 0, head_length)
  let tail = chunks_of_three(string.drop_start(digits, head_length), [])
  let grouped = string.join([head, ..tail], ",")
  case negative {
    True -> "-" <> grouped
    False -> grouped
  }
}

fn chunks_of_three(remaining: String, acc: List(String)) -> List(String) {
  case string.length(remaining) {
    0 -> list.reverse(acc)
    _ -> chunks_of_three(string.drop_start(remaining, 3), [string.slice(remaining, 0, 3), ..acc])
  }
}


