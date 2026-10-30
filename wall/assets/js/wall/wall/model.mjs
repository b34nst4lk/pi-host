import * as $float from "../../gleam_stdlib/gleam/float.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
  divideFloat,
} from "../gleam.mjs";

export class Live extends $CustomType {}
export const Freshness$Live$const = new Live();
export const Freshness$Live = () => Freshness$Live$const;
export const Freshness$isLive = (value) => value instanceof Live;

export class Slow extends $CustomType {}
export const Freshness$Slow$const = new Slow();
export const Freshness$Slow = () => Freshness$Slow$const;
export const Freshness$isSlow = (value) => value instanceof Slow;

export class Stale extends $CustomType {}
export const Freshness$Stale$const = new Stale();
export const Freshness$Stale = () => Freshness$Stale$const;
export const Freshness$isStale = (value) => value instanceof Stale;

export class Unknown extends $CustomType {}
export const Freshness$Unknown$const = new Unknown();
export const Freshness$Unknown = () => Freshness$Unknown$const;
export const Freshness$isUnknown = (value) => value instanceof Unknown;

export class Vitals extends $CustomType {
  constructor(entries, ledger_bytes, sync_state, sync_age_s, sync_batch, sync_seq, errors_24h, last_error, daemon_uptime_s, container_uptime_s) {
    super();
    this.entries = entries;
    this.ledger_bytes = ledger_bytes;
    this.sync_state = sync_state;
    this.sync_age_s = sync_age_s;
    this.sync_batch = sync_batch;
    this.sync_seq = sync_seq;
    this.errors_24h = errors_24h;
    this.last_error = last_error;
    this.daemon_uptime_s = daemon_uptime_s;
    this.container_uptime_s = container_uptime_s;
  }
}
export const Vitals$Vitals = (entries, ledger_bytes, sync_state, sync_age_s, sync_batch, sync_seq, errors_24h, last_error, daemon_uptime_s, container_uptime_s) =>
  new Vitals(entries,
  ledger_bytes,
  sync_state,
  sync_age_s,
  sync_batch,
  sync_seq,
  errors_24h,
  last_error,
  daemon_uptime_s,
  container_uptime_s);
export const Vitals$isVitals = (value) => value instanceof Vitals;
export const Vitals$Vitals$entries = (value) => value.entries;
export const Vitals$Vitals$0 = (value) => value.entries;
export const Vitals$Vitals$ledger_bytes = (value) => value.ledger_bytes;
export const Vitals$Vitals$1 = (value) => value.ledger_bytes;
export const Vitals$Vitals$sync_state = (value) => value.sync_state;
export const Vitals$Vitals$2 = (value) => value.sync_state;
export const Vitals$Vitals$sync_age_s = (value) => value.sync_age_s;
export const Vitals$Vitals$3 = (value) => value.sync_age_s;
export const Vitals$Vitals$sync_batch = (value) => value.sync_batch;
export const Vitals$Vitals$4 = (value) => value.sync_batch;
export const Vitals$Vitals$sync_seq = (value) => value.sync_seq;
export const Vitals$Vitals$5 = (value) => value.sync_seq;
export const Vitals$Vitals$errors_24h = (value) => value.errors_24h;
export const Vitals$Vitals$6 = (value) => value.errors_24h;
export const Vitals$Vitals$last_error = (value) => value.last_error;
export const Vitals$Vitals$7 = (value) => value.last_error;
export const Vitals$Vitals$daemon_uptime_s = (value) => value.daemon_uptime_s;
export const Vitals$Vitals$8 = (value) => value.daemon_uptime_s;
export const Vitals$Vitals$container_uptime_s = (value) =>
  value.container_uptime_s;
export const Vitals$Vitals$9 = (value) => value.container_uptime_s;

export class Spend extends $CustomType {
  constructor(requests, input_tokens, output_tokens, balance_usd, percent_used, used_in_window, max_per_minute, cached, stale, error) {
    super();
    this.requests = requests;
    this.input_tokens = input_tokens;
    this.output_tokens = output_tokens;
    this.balance_usd = balance_usd;
    this.percent_used = percent_used;
    this.used_in_window = used_in_window;
    this.max_per_minute = max_per_minute;
    this.cached = cached;
    this.stale = stale;
    this.error = error;
  }
}
export const Spend$Spend = (requests, input_tokens, output_tokens, balance_usd, percent_used, used_in_window, max_per_minute, cached, stale, error) =>
  new Spend(requests,
  input_tokens,
  output_tokens,
  balance_usd,
  percent_used,
  used_in_window,
  max_per_minute,
  cached,
  stale,
  error);
export const Spend$isSpend = (value) => value instanceof Spend;
export const Spend$Spend$requests = (value) => value.requests;
export const Spend$Spend$0 = (value) => value.requests;
export const Spend$Spend$input_tokens = (value) => value.input_tokens;
export const Spend$Spend$1 = (value) => value.input_tokens;
export const Spend$Spend$output_tokens = (value) => value.output_tokens;
export const Spend$Spend$2 = (value) => value.output_tokens;
export const Spend$Spend$balance_usd = (value) => value.balance_usd;
export const Spend$Spend$3 = (value) => value.balance_usd;
export const Spend$Spend$percent_used = (value) => value.percent_used;
export const Spend$Spend$4 = (value) => value.percent_used;
export const Spend$Spend$used_in_window = (value) => value.used_in_window;
export const Spend$Spend$5 = (value) => value.used_in_window;
export const Spend$Spend$max_per_minute = (value) => value.max_per_minute;
export const Spend$Spend$6 = (value) => value.max_per_minute;
export const Spend$Spend$cached = (value) => value.cached;
export const Spend$Spend$7 = (value) => value.cached;
export const Spend$Spend$stale = (value) => value.stale;
export const Spend$Spend$8 = (value) => value.stale;
export const Spend$Spend$error = (value) => value.error;
export const Spend$Spend$9 = (value) => value.error;

export class Agent extends $CustomType {
  constructor(name, branch, worktree, reports, state) {
    super();
    this.name = name;
    this.branch = branch;
    this.worktree = worktree;
    this.reports = reports;
    this.state = state;
  }
}
export const Agent$Agent = (name, branch, worktree, reports, state) =>
  new Agent(name, branch, worktree, reports, state);
export const Agent$isAgent = (value) => value instanceof Agent;
export const Agent$Agent$name = (value) => value.name;
export const Agent$Agent$0 = (value) => value.name;
export const Agent$Agent$branch = (value) => value.branch;
export const Agent$Agent$1 = (value) => value.branch;
export const Agent$Agent$worktree = (value) => value.worktree;
export const Agent$Agent$2 = (value) => value.worktree;
export const Agent$Agent$reports = (value) => value.reports;
export const Agent$Agent$3 = (value) => value.reports;
export const Agent$Agent$state = (value) => value.state;
export const Agent$Agent$4 = (value) => value.state;

export class AgentCard extends $CustomType {
  constructor(name, state, branch, worktree, last_reply) {
    super();
    this.name = name;
    this.state = state;
    this.branch = branch;
    this.worktree = worktree;
    this.last_reply = last_reply;
  }
}
export const AgentCard$AgentCard = (name, state, branch, worktree, last_reply) =>
  new AgentCard(name, state, branch, worktree, last_reply);
export const AgentCard$isAgentCard = (value) => value instanceof AgentCard;
export const AgentCard$AgentCard$name = (value) => value.name;
export const AgentCard$AgentCard$0 = (value) => value.name;
export const AgentCard$AgentCard$state = (value) => value.state;
export const AgentCard$AgentCard$1 = (value) => value.state;
export const AgentCard$AgentCard$branch = (value) => value.branch;
export const AgentCard$AgentCard$2 = (value) => value.branch;
export const AgentCard$AgentCard$worktree = (value) => value.worktree;
export const AgentCard$AgentCard$3 = (value) => value.worktree;
export const AgentCard$AgentCard$last_reply = (value) => value.last_reply;
export const AgentCard$AgentCard$4 = (value) => value.last_reply;

export class Orphan extends $CustomType {
  constructor(anchor, conversation) {
    super();
    this.anchor = anchor;
    this.conversation = conversation;
  }
}
export const Orphan$Orphan = (anchor, conversation) =>
  new Orphan(anchor, conversation);
export const Orphan$isOrphan = (value) => value instanceof Orphan;
export const Orphan$Orphan$anchor = (value) => value.anchor;
export const Orphan$Orphan$0 = (value) => value.anchor;
export const Orphan$Orphan$conversation = (value) => value.conversation;
export const Orphan$Orphan$1 = (value) => value.conversation;

export class Agents extends $CustomType {
  constructor(spike_state, named, orphans, retired, in_flight, queued) {
    super();
    this.spike_state = spike_state;
    this.named = named;
    this.orphans = orphans;
    this.retired = retired;
    this.in_flight = in_flight;
    this.queued = queued;
  }
}
export const Agents$Agents = (spike_state, named, orphans, retired, in_flight, queued) =>
  new Agents(spike_state, named, orphans, retired, in_flight, queued);
export const Agents$isAgents = (value) => value instanceof Agents;
export const Agents$Agents$spike_state = (value) => value.spike_state;
export const Agents$Agents$0 = (value) => value.spike_state;
export const Agents$Agents$named = (value) => value.named;
export const Agents$Agents$1 = (value) => value.named;
export const Agents$Agents$orphans = (value) => value.orphans;
export const Agents$Agents$2 = (value) => value.orphans;
export const Agents$Agents$retired = (value) => value.retired;
export const Agents$Agents$3 = (value) => value.retired;
export const Agents$Agents$in_flight = (value) => value.in_flight;
export const Agents$Agents$4 = (value) => value.in_flight;
export const Agents$Agents$queued = (value) => value.queued;
export const Agents$Agents$5 = (value) => value.queued;

export class Queue extends $CustomType {
  constructor(inbox_depth, running, pending, unanswered, errors) {
    super();
    this.inbox_depth = inbox_depth;
    this.running = running;
    this.pending = pending;
    this.unanswered = unanswered;
    this.errors = errors;
  }
}
export const Queue$Queue = (inbox_depth, running, pending, unanswered, errors) =>
  new Queue(inbox_depth, running, pending, unanswered, errors);
export const Queue$isQueue = (value) => value instanceof Queue;
export const Queue$Queue$inbox_depth = (value) => value.inbox_depth;
export const Queue$Queue$0 = (value) => value.inbox_depth;
export const Queue$Queue$running = (value) => value.running;
export const Queue$Queue$1 = (value) => value.running;
export const Queue$Queue$pending = (value) => value.pending;
export const Queue$Queue$2 = (value) => value.pending;
export const Queue$Queue$unanswered = (value) => value.unanswered;
export const Queue$Queue$3 = (value) => value.unanswered;
export const Queue$Queue$errors = (value) => value.errors;
export const Queue$Queue$4 = (value) => value.errors;

export class Sample extends $CustomType {
  constructor(at, entries, running, requests) {
    super();
    this.at = at;
    this.entries = entries;
    this.running = running;
    this.requests = requests;
  }
}
export const Sample$Sample = (at, entries, running, requests) =>
  new Sample(at, entries, running, requests);
export const Sample$isSample = (value) => value instanceof Sample;
export const Sample$Sample$at = (value) => value.at;
export const Sample$Sample$0 = (value) => value.at;
export const Sample$Sample$entries = (value) => value.entries;
export const Sample$Sample$1 = (value) => value.entries;
export const Sample$Sample$running = (value) => value.running;
export const Sample$Sample$2 = (value) => value.running;
export const Sample$Sample$requests = (value) => value.requests;
export const Sample$Sample$3 = (value) => value.requests;

export class LiveMode extends $CustomType {}
export const Mode$LiveMode$const = new LiveMode();
export const Mode$LiveMode = () => Mode$LiveMode$const;
export const Mode$isLiveMode = (value) => value instanceof LiveMode;

export class FakeMode extends $CustomType {}
export const Mode$FakeMode$const = new FakeMode();
export const Mode$FakeMode = () => Mode$FakeMode$const;
export const Mode$isFakeMode = (value) => value instanceof FakeMode;

export class Model extends $CustomType {
  constructor(mode, vitals, spend, agents, queue, samples, polls, error) {
    super();
    this.mode = mode;
    this.vitals = vitals;
    this.spend = spend;
    this.agents = agents;
    this.queue = queue;
    this.samples = samples;
    this.polls = polls;
    this.error = error;
  }
}
export const Model$Model = (mode, vitals, spend, agents, queue, samples, polls, error) =>
  new Model(mode, vitals, spend, agents, queue, samples, polls, error);
export const Model$isModel = (value) => value instanceof Model;
export const Model$Model$mode = (value) => value.mode;
export const Model$Model$0 = (value) => value.mode;
export const Model$Model$vitals = (value) => value.vitals;
export const Model$Model$1 = (value) => value.vitals;
export const Model$Model$spend = (value) => value.spend;
export const Model$Model$2 = (value) => value.spend;
export const Model$Model$agents = (value) => value.agents;
export const Model$Model$3 = (value) => value.agents;
export const Model$Model$queue = (value) => value.queue;
export const Model$Model$4 = (value) => value.queue;
export const Model$Model$samples = (value) => value.samples;
export const Model$Model$5 = (value) => value.samples;
export const Model$Model$polls = (value) => value.polls;
export const Model$Model$6 = (value) => value.polls;
export const Model$Model$error = (value) => value.error;
export const Model$Model$7 = (value) => value.error;

/**
 * Poll the reader (`Live`) or nudge the fixtures (`Fake`).
 */
export class Tick extends $CustomType {}
export const Msg$Tick$const = new Tick();
export const Msg$Tick = () => Msg$Tick$const;
export const Msg$isTick = (value) => value instanceof Tick;

export class StateArrived extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$StateArrived = ($0) => new StateArrived($0);
export const Msg$isStateArrived = (value) => value instanceof StateArrived;
export const Msg$StateArrived$0 = (value) => value[0];

export class SpendArrived extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$SpendArrived = ($0) => new SpendArrived($0);
export const Msg$isSpendArrived = (value) => value instanceof SpendArrived;
export const Msg$SpendArrived$0 = (value) => value[0];

export class Failed extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$Failed = ($0) => new Failed($0);
export const Msg$isFailed = (value) => value instanceof Failed;
export const Msg$Failed$0 = (value) => value[0];

export class ToggleMode extends $CustomType {}
export const Msg$ToggleMode$const = new ToggleMode();
export const Msg$ToggleMode = () => Msg$ToggleMode$const;
export const Msg$isToggleMode = (value) => value instanceof ToggleMode;

/**
 * How many polls of history the sparklines keep (60 × 10 s = 10 minutes).
 */
export const history_length = 60;

/**
 * The six states, in precedence order (highest first), plus the seventh the
 * reader sends when it cannot tell. Kept here so the view and the tests agree
 * on the vocabulary instead of repeating string literals.
 */
export const agent_states = /* @__PURE__ */ listPrepend(
  "working",
  listPrepend(
    "queued",
    listPrepend(
      "reporting",
      listPrepend(
        "alive",
        listPrepend(
          "orphaned",
          listPrepend("retired", listPrepend("unknown", $List$Empty$const)),
        ),
      ),
    ),
  ),
);

export function initial(mode) {
  return new Model(
    mode,
    Option$None$const,
    Option$None$const,
    Option$None$const,
    Option$None$const,
    $List$Empty$const,
    0,
    Option$None$const,
  );
}

/**
 * Append one sample, keeping at most `history_length` of them (newest last).
 * Samples are only appended for values that actually arrived — a `None` from
 * the reader leaves the sparkline alone instead of drawing a fake zero.
 */
export function push_sample(samples, sample) {
  let all = $list.append(samples, listPrepend(sample, $List$Empty$const));
  let $ = $list.length(all) > history_length;
  if ($) {
    return $list.drop(all, $list.length(all) - history_length);
  } else {
    return all;
  }
}

/**
 * The normalised points of a sparkline: `#(x, y)` in a `0..width` × `0..height`
 * box, oldest first, ready for `svg.polyline`. `[]` when there is nothing to
 * draw (fewer than two samples).
 */
export function sparkline_points(values, width, height) {
  let count = $list.length(values);
  let $ = count < 2;
  if ($) {
    return $List$Empty$const;
  } else {
    let low = $list.fold(
      values,
      (() => {
        let _pipe = $list.first(values);
        return $result.unwrap(_pipe, 0.0);
      })(),
      $float.min,
    );
    let high = $list.fold(
      values,
      (() => {
        let _pipe = $list.first(values);
        return $result.unwrap(_pipe, 0.0);
      })(),
      $float.max,
    );
    let span = high - low;
    let box_height = $int.to_float(height);
    let step = divideFloat($int.to_float(width), $int.to_float(count - 1));
    let _pipe = values;
    return $list.index_map(
      _pipe,
      (value, index) => {
        let x = $int.to_float(index) * step;
        let _block;
        let $1 = span > 0.0;
        if ($1) {
          _block = divideFloat((value - low), span);
        } else {
          _block = 0.0;
        }
        let share = _block;
        return [x, box_height - (share * box_height)];
      },
    );
  }
}

/**
 * `"0,10 50,20 …"` — the `points` attribute of an `svg.polyline`.
 */
export function polyline_points(points) {
  let _pipe = points;
  let _pipe$1 = $list.map(
    _pipe,
    (point) => {
      return ($float.to_string(point[0]) + ",") + $float.to_string(point[1]);
    },
  );
  return $string.join(_pipe$1, " ");
}

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

export function freshness_from_state(text) {
  if (text === "live") {
    return Freshness$Live$const;
  } else if (text === "slow") {
    return Freshness$Slow$const;
  } else if (text === "stale") {
    return Freshness$Stale$const;
  } else {
    return Freshness$Unknown$const;
  }
}

/**
 * The badge label for a state word. Anything the reader invents beyond the
 * enum renders as `unknown` rather than as a confidently wrong badge.
 */
export function agent_state_label(state) {
  if (state === "working") {
    return state;
  } else if (state === "queued") {
    return state;
  } else if (state === "reporting") {
    return state;
  } else if (state === "alive") {
    return state;
  } else if (state === "orphaned") {
    return "unnamed (prunable)";
  } else if (state === "retired") {
    return state;
  } else {
    return "unknown";
  }
}

/**
 * The CSS class for a state badge; unknown words get the neutral class.
 */
export function agent_state_class(state) {
  if (state === "working") {
    return "badge state-working";
  } else if (state === "queued") {
    return "badge state-queued";
  } else if (state === "reporting") {
    return "badge state-reporting";
  } else if (state === "alive") {
    return "badge state-alive";
  } else if (state === "orphaned") {
    return "badge state-orphaned";
  } else if (state === "retired") {
    return "badge state-retired";
  } else {
    return "badge state-unknown";
  }
}

/**
 * `work: 3 in flight · 0 queued` — the line that replaced "tasks running".
 */
export function work_line(agents) {
  return ((("work: " + format_count(agents.in_flight)) + " in flight · ") + format_count(
    agents.queued,
  )) + " queued";
}

/**
 * `work: — in flight · — queued` when there are no agents yet.
 */
export function empty_agents() {
  return new Agents(
    "unknown",
    $List$Empty$const,
    $List$Empty$const,
    Option$None$const,
    Option$None$const,
    Option$None$const,
  );
}

/**
 * `2 unnamed (prunable)` / `no orphans`, for the one-line summary.
 */
export function orphan_summary(agents) {
  let $ = $list.length(agents.orphans);
  if ($ === 0) {
    return "no orphans";
  } else {
    let count = $;
    return $int.to_string(count) + " unnamed (prunable)";
  }
}
