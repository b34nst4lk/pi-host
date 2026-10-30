import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
} from "../gleam.mjs";

export class Dashboard extends $CustomType {}
export const Tab$Dashboard$const = new Dashboard();
export const Tab$Dashboard = () => Tab$Dashboard$const;
export const Tab$isDashboard = (value) => value instanceof Dashboard;

export class LogsTab extends $CustomType {}
export const Tab$LogsTab$const = new LogsTab();
export const Tab$LogsTab = () => Tab$LogsTab$const;
export const Tab$isLogsTab = (value) => value instanceof LogsTab;

export class BrowserTab extends $CustomType {}
export const Tab$BrowserTab$const = new BrowserTab();
export const Tab$BrowserTab = () => Tab$BrowserTab$const;
export const Tab$isBrowserTab = (value) => value instanceof BrowserTab;

export class ProjectsTab extends $CustomType {}
export const Tab$ProjectsTab$const = new ProjectsTab();
export const Tab$ProjectsTab = () => Tab$ProjectsTab$const;
export const Tab$isProjectsTab = (value) => value instanceof ProjectsTab;

export class BothWays extends $CustomType {}
export const Direction$BothWays$const = new BothWays();
export const Direction$BothWays = () => Direction$BothWays$const;
export const Direction$isBothWays = (value) => value instanceof BothWays;

export class Incoming extends $CustomType {}
export const Direction$Incoming$const = new Incoming();
export const Direction$Incoming = () => Direction$Incoming$const;
export const Direction$isIncoming = (value) => value instanceof Incoming;

export class Outgoing extends $CustomType {}
export const Direction$Outgoing$const = new Outgoing();
export const Direction$Outgoing = () => Direction$Outgoing$const;
export const Direction$isOutgoing = (value) => value instanceof Outgoing;

export class LogFilters extends $CustomType {
  constructor(kinds, direction, query) {
    super();
    this.kinds = kinds;
    this.direction = direction;
    this.query = query;
  }
}
export const LogFilters$LogFilters = (kinds, direction, query) =>
  new LogFilters(kinds, direction, query);
export const LogFilters$isLogFilters = (value) => value instanceof LogFilters;
export const LogFilters$LogFilters$kinds = (value) => value.kinds;
export const LogFilters$LogFilters$0 = (value) => value.kinds;
export const LogFilters$LogFilters$direction = (value) => value.direction;
export const LogFilters$LogFilters$1 = (value) => value.direction;
export const LogFilters$LogFilters$query = (value) => value.query;
export const LogFilters$LogFilters$2 = (value) => value.query;

export class LogEntry extends $CustomType {
  constructor(id, kind, at, text, thread, spill, raw) {
    super();
    this.id = id;
    this.kind = kind;
    this.at = at;
    this.text = text;
    this.thread = thread;
    this.spill = spill;
    this.raw = raw;
  }
}
export const LogEntry$LogEntry = (id, kind, at, text, thread, spill, raw) =>
  new LogEntry(id, kind, at, text, thread, spill, raw);
export const LogEntry$isLogEntry = (value) => value instanceof LogEntry;
export const LogEntry$LogEntry$id = (value) => value.id;
export const LogEntry$LogEntry$0 = (value) => value.id;
export const LogEntry$LogEntry$kind = (value) => value.kind;
export const LogEntry$LogEntry$1 = (value) => value.kind;
export const LogEntry$LogEntry$at = (value) => value.at;
export const LogEntry$LogEntry$2 = (value) => value.at;
export const LogEntry$LogEntry$text = (value) => value.text;
export const LogEntry$LogEntry$3 = (value) => value.text;
export const LogEntry$LogEntry$thread = (value) => value.thread;
export const LogEntry$LogEntry$4 = (value) => value.thread;
export const LogEntry$LogEntry$spill = (value) => value.spill;
export const LogEntry$LogEntry$5 = (value) => value.spill;
export const LogEntry$LogEntry$raw = (value) => value.raw;
export const LogEntry$LogEntry$6 = (value) => value.raw;

export class Logs extends $CustomType {
  constructor(entries, next_before, tailing, appending, spills, error) {
    super();
    this.entries = entries;
    this.next_before = next_before;
    this.tailing = tailing;
    this.appending = appending;
    this.spills = spills;
    this.error = error;
  }
}
export const Logs$Logs = (entries, next_before, tailing, appending, spills, error) =>
  new Logs(entries, next_before, tailing, appending, spills, error);
export const Logs$isLogs = (value) => value instanceof Logs;
export const Logs$Logs$entries = (value) => value.entries;
export const Logs$Logs$0 = (value) => value.entries;
export const Logs$Logs$next_before = (value) => value.next_before;
export const Logs$Logs$1 = (value) => value.next_before;
export const Logs$Logs$tailing = (value) => value.tailing;
export const Logs$Logs$2 = (value) => value.tailing;
export const Logs$Logs$appending = (value) => value.appending;
export const Logs$Logs$3 = (value) => value.appending;
export const Logs$Logs$spills = (value) => value.spills;
export const Logs$Logs$4 = (value) => value.spills;
export const Logs$Logs$error = (value) => value.error;
export const Logs$Logs$5 = (value) => value.error;

/**
 * The kind chips. `app.*` is a prefix the reader understands.
 */
export const log_kinds = /* @__PURE__ */ listPrepend(
  "pi.user",
  listPrepend(
    "pi.assistant",
    listPrepend(
      "pi.tool-result",
      listPrepend(
        "pi.compaction",
        listPrepend("pi.system", listPrepend("app.*", $List$Empty$const)),
      ),
    ),
  ),
);

/**
 * One page. The reader's default is 50 and its ceiling 200; the tab asks for 50.
 */
export const log_limit = 50;

/**
 * The browser's cross-conversation search: the reader caps it at 100, and a
 * hits list is short by design (it is a jump list, not a report).
 */
export const search_limit = 25;

export function empty_filters() {
  return new LogFilters($List$Empty$const, Direction$BothWays$const, "");
}

export function empty_logs() {
  return new Logs(
    $List$Empty$const,
    Option$None$const,
    true,
    false,
    $List$Empty$const,
    Option$None$const,
  );
}

export function tab_label(tab) {
  if (tab instanceof Dashboard) {
    return "dashboard";
  } else if (tab instanceof LogsTab) {
    return "logs";
  } else if (tab instanceof BrowserTab) {
    return "browser";
  } else {
    return "projects";
  }
}

export function direction_label(direction) {
  if (direction instanceof BothWays) {
    return "all";
  } else if (direction instanceof Incoming) {
    return "in";
  } else {
    return "out";
  }
}

/**
 * What the direction means in the reader's vocabulary: `in` is the user's
 * steers, `out` is what the agent and the apps write.
 */
export function direction_kinds(direction) {
  if (direction instanceof BothWays) {
    return $List$Empty$const;
  } else if (direction instanceof Incoming) {
    return listPrepend("pi.user", $List$Empty$const);
  } else {
    return listPrepend("pi.assistant", listPrepend("app.*", $List$Empty$const));
  }
}

function kind_matches(pattern, kind) {
  if (pattern === "app.*") {
    return $string.starts_with(kind, "app.");
  } else {
    return pattern === kind;
  }
}

/**
 * The `kind=` list actually sent. Chips narrow the direction; a combination
 * that cannot match anything asks for a kind nobody wrote, so the tab shows an
 * empty page instead of silently showing everything.
 */
export function effective_kinds(filters) {
  let $ = direction_kinds(filters.direction);
  let $1 = filters.kinds;
  if ($ instanceof $Empty) {
    if ($1 instanceof $Empty) {
      return $;
    } else {
      return $1;
    }
  } else if ($1 instanceof $Empty) {
    return $;
  } else {
    let directed = $;
    let chips = $1;
    let kept = $list.filter(
      chips,
      (chip) => {
        return $list.any(
          directed,
          (directed_kind) => { return kind_matches(directed_kind, chip); },
        );
      },
    );
    if (kept instanceof $Empty) {
      return listPrepend("(no such kind)", $List$Empty$const);
    } else {
      return kept;
    }
  }
}

/**
 * Percent-encode the characters that would otherwise change the query. Bytes
 * above ASCII are left alone: `fetch` encodes them, and the reader decodes them.
 */
export function url_encode(value) {
  let _pipe = value;
  let _pipe$1 = $string.to_graphemes(_pipe);
  let _pipe$2 = $list.map(
    _pipe$1,
    (character) => {
      if (character === " ") {
        return "%20";
      } else if (character === "%") {
        return "%25";
      } else if (character === "&") {
        return "%26";
      } else if (character === "#") {
        return "%23";
      } else if (character === "+") {
        return "%2B";
      } else if (character === "=") {
        return "%3D";
      } else if (character === "?") {
        return "%3F";
      } else if (character === "/") {
        return "%2F";
      } else if (character === ",") {
        return "%2C";
      } else {
        return character;
      }
    },
  );
  return $string.join(_pipe$2, "");
}

/**
 * The reader URL for one page. The tab always asks `dir=desc` (newest first);
 * `asc` exists for the contract, not for this view.
 */
export function logs_path(filters, before, limit) {
  let head = ("/api/logs?limit=" + $int.to_string(limit)) + "&dir=desc";
  let kinds = effective_kinds(filters);
  let _block;
  let $ = $list.length(kinds);
  if ($ === 0) {
    _block = "";
  } else {
    _block = "&kind=" + $string.join($list.map(kinds, url_encode), ",");
  }
  let kind_part = _block;
  let _block$1;
  if (before instanceof Some) {
    let id = before[0];
    _block$1 = "&before=" + $int.to_string(id);
  } else {
    _block$1 = "";
  }
  let before_part = _block$1;
  let _block$2;
  let $1 = $string.trim(filters.query);
  if ($1 === "") {
    _block$2 = $1;
  } else {
    let query = $1;
    _block$2 = "&q=" + url_encode(query);
  }
  let query_part = _block$2;
  return ((head + kind_part) + before_part) + query_part;
}

/**
 * `3 entries · live tail` / `50 entries · paged back`.
 */
export function logs_line(logs) {
  let count = $list.length(logs.entries);
  return ($int.to_string(count) + (() => {
    if (count === 1) {
      return " entry";
    } else {
      return " entries";
    }
  })()) + (() => {
    let $ = logs.tailing;
    if ($) {
      return " · live tail";
    } else {
      return " · paged back";
    }
  })();
}

/**
 * `12:34:56` from an ISO timestamp; the date is already in the ledger's own
 * ordering, and the row's raw record carries the full value.
 */
export function short_time(at) {
  if (at instanceof Some) {
    let iso = at[0];
    let $ = $string.length(iso) >= 19;
    if ($) {
      return $string.slice(iso, 11, 8);
    } else {
      return iso;
    }
  } else {
    return "—";
  }
}

/**
 * `10-29 14:30` from an ISO timestamp: a conversation card spans days, so the
 * date matters where a log row only needs the time of day.
 */
export function short_stamp(at) {
  if (at instanceof Some) {
    let iso = at[0];
    let $ = $string.length(iso) >= 16;
    if ($) {
      return ($string.slice(iso, 5, 5) + " ") + $string.slice(iso, 11, 5);
    } else {
      return short_time(new Some(iso));
    }
  } else {
    return "—";
  }
}
