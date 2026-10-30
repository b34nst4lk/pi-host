import * as $float from "../../gleam_stdlib/gleam/float.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  CustomType as $CustomType,
  divideFloat,
} from "../gleam.mjs";
import * as $browser from "../wall/browser.mjs";
import * as $format from "../wall/format.mjs";
import * as $logs from "../wall/logs.mjs";

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
  constructor(kind, name, state, branch, worktree, last_reply, room, cwd, summary, entries) {
    super();
    this.kind = kind;
    this.name = name;
    this.state = state;
    this.branch = branch;
    this.worktree = worktree;
    this.last_reply = last_reply;
    this.room = room;
    this.cwd = cwd;
    this.summary = summary;
    this.entries = entries;
  }
}
export const AgentCard$AgentCard = (kind, name, state, branch, worktree, last_reply, room, cwd, summary, entries) =>
  new AgentCard(kind,
  name,
  state,
  branch,
  worktree,
  last_reply,
  room,
  cwd,
  summary,
  entries);
export const AgentCard$isAgentCard = (value) => value instanceof AgentCard;
export const AgentCard$AgentCard$kind = (value) => value.kind;
export const AgentCard$AgentCard$0 = (value) => value.kind;
export const AgentCard$AgentCard$name = (value) => value.name;
export const AgentCard$AgentCard$1 = (value) => value.name;
export const AgentCard$AgentCard$state = (value) => value.state;
export const AgentCard$AgentCard$2 = (value) => value.state;
export const AgentCard$AgentCard$branch = (value) => value.branch;
export const AgentCard$AgentCard$3 = (value) => value.branch;
export const AgentCard$AgentCard$worktree = (value) => value.worktree;
export const AgentCard$AgentCard$4 = (value) => value.worktree;
export const AgentCard$AgentCard$last_reply = (value) => value.last_reply;
export const AgentCard$AgentCard$5 = (value) => value.last_reply;
export const AgentCard$AgentCard$room = (value) => value.room;
export const AgentCard$AgentCard$6 = (value) => value.room;
export const AgentCard$AgentCard$cwd = (value) => value.cwd;
export const AgentCard$AgentCard$7 = (value) => value.cwd;
export const AgentCard$AgentCard$summary = (value) => value.summary;
export const AgentCard$AgentCard$8 = (value) => value.summary;
export const AgentCard$AgentCard$entries = (value) => value.entries;
export const AgentCard$AgentCard$9 = (value) => value.entries;

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
  constructor(spike_kind, spike_state, named, orphans, retired, in_flight, queued) {
    super();
    this.spike_kind = spike_kind;
    this.spike_state = spike_state;
    this.named = named;
    this.orphans = orphans;
    this.retired = retired;
    this.in_flight = in_flight;
    this.queued = queued;
  }
}
export const Agents$Agents = (spike_kind, spike_state, named, orphans, retired, in_flight, queued) =>
  new Agents(spike_kind, spike_state, named, orphans, retired, in_flight, queued);
export const Agents$isAgents = (value) => value instanceof Agents;
export const Agents$Agents$spike_kind = (value) => value.spike_kind;
export const Agents$Agents$0 = (value) => value.spike_kind;
export const Agents$Agents$spike_state = (value) => value.spike_state;
export const Agents$Agents$1 = (value) => value.spike_state;
export const Agents$Agents$named = (value) => value.named;
export const Agents$Agents$2 = (value) => value.named;
export const Agents$Agents$orphans = (value) => value.orphans;
export const Agents$Agents$3 = (value) => value.orphans;
export const Agents$Agents$retired = (value) => value.retired;
export const Agents$Agents$4 = (value) => value.retired;
export const Agents$Agents$in_flight = (value) => value.in_flight;
export const Agents$Agents$5 = (value) => value.in_flight;
export const Agents$Agents$queued = (value) => value.queued;
export const Agents$Agents$6 = (value) => value.queued;

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
  constructor(mode, vitals, spend, agents, queue, samples, polls, error, tab, filters, logs, browser) {
    super();
    this.mode = mode;
    this.vitals = vitals;
    this.spend = spend;
    this.agents = agents;
    this.queue = queue;
    this.samples = samples;
    this.polls = polls;
    this.error = error;
    this.tab = tab;
    this.filters = filters;
    this.logs = logs;
    this.browser = browser;
  }
}
export const Model$Model = (mode, vitals, spend, agents, queue, samples, polls, error, tab, filters, logs, browser) =>
  new Model(mode,
  vitals,
  spend,
  agents,
  queue,
  samples,
  polls,
  error,
  tab,
  filters,
  logs,
  browser);
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
export const Model$Model$tab = (value) => value.tab;
export const Model$Model$8 = (value) => value.tab;
export const Model$Model$filters = (value) => value.filters;
export const Model$Model$9 = (value) => value.filters;
export const Model$Model$logs = (value) => value.logs;
export const Model$Model$10 = (value) => value.logs;
export const Model$Model$browser = (value) => value.browser;
export const Model$Model$11 = (value) => value.browser;

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
 * The logs tab: which half shows, what the query is, and the pages it got.
 */
export class TabChosen extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$TabChosen = ($0) => new TabChosen($0);
export const Msg$isTabChosen = (value) => value instanceof TabChosen;
export const Msg$TabChosen$0 = (value) => value[0];

export class DirectionChosen extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$DirectionChosen = ($0) => new DirectionChosen($0);
export const Msg$isDirectionChosen = (value) =>
  value instanceof DirectionChosen;
export const Msg$DirectionChosen$0 = (value) => value[0];

export class KindToggled extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$KindToggled = ($0) => new KindToggled($0);
export const Msg$isKindToggled = (value) => value instanceof KindToggled;
export const Msg$KindToggled$0 = (value) => value[0];

export class QueryChanged extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$QueryChanged = ($0) => new QueryChanged($0);
export const Msg$isQueryChanged = (value) => value instanceof QueryChanged;
export const Msg$QueryChanged$0 = (value) => value[0];

export class OlderRequested extends $CustomType {}
export const Msg$OlderRequested$const = new OlderRequested();
export const Msg$OlderRequested = () => Msg$OlderRequested$const;
export const Msg$isOlderRequested = (value) => value instanceof OlderRequested;

export class LogsArrived extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$LogsArrived = ($0) => new LogsArrived($0);
export const Msg$isLogsArrived = (value) => value instanceof LogsArrived;
export const Msg$LogsArrived$0 = (value) => value[0];

export class SpillRequested extends $CustomType {
  constructor($0, $1) {
    super();
    this[0] = $0;
    this[1] = $1;
  }
}
export const Msg$SpillRequested = ($0, $1) => new SpillRequested($0, $1);
export const Msg$isSpillRequested = (value) => value instanceof SpillRequested;
export const Msg$SpillRequested$0 = (value) => value[0];
export const Msg$SpillRequested$1 = (value) => value[1];

export class SpillArrived extends $CustomType {
  constructor($0, $1) {
    super();
    this[0] = $0;
    this[1] = $1;
  }
}
export const Msg$SpillArrived = ($0, $1) => new SpillArrived($0, $1);
export const Msg$isSpillArrived = (value) => value instanceof SpillArrived;
export const Msg$SpillArrived$0 = (value) => value[0];
export const Msg$SpillArrived$1 = (value) => value[1];

export class SpillFailed extends $CustomType {
  constructor($0, $1) {
    super();
    this[0] = $0;
    this[1] = $1;
  }
}
export const Msg$SpillFailed = ($0, $1) => new SpillFailed($0, $1);
export const Msg$isSpillFailed = (value) => value instanceof SpillFailed;
export const Msg$SpillFailed$0 = (value) => value[0];
export const Msg$SpillFailed$1 = (value) => value[1];

/**
 * The browser tab: the picker, the selected space, its stream, the jump list.
 */
export class ConversationsArrived extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$ConversationsArrived = ($0) => new ConversationsArrived($0);
export const Msg$isConversationsArrived = (value) =>
  value instanceof ConversationsArrived;
export const Msg$ConversationsArrived$0 = (value) => value[0];

export class ConversationChosen extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$ConversationChosen = ($0) => new ConversationChosen($0);
export const Msg$isConversationChosen = (value) =>
  value instanceof ConversationChosen;
export const Msg$ConversationChosen$0 = (value) => value[0];

export class BrowserLogsArrived extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$BrowserLogsArrived = ($0) => new BrowserLogsArrived($0);
export const Msg$isBrowserLogsArrived = (value) =>
  value instanceof BrowserLogsArrived;
export const Msg$BrowserLogsArrived$0 = (value) => value[0];

/**
 * Landing on a hit: which space it lives in, and which entry to open around.
 */
export class HitChosen extends $CustomType {
  constructor($0, $1) {
    super();
    this[0] = $0;
    this[1] = $1;
  }
}
export const Msg$HitChosen = ($0, $1) => new HitChosen($0, $1);
export const Msg$isHitChosen = (value) => value instanceof HitChosen;
export const Msg$HitChosen$0 = (value) => value[0];
export const Msg$HitChosen$1 = (value) => value[1];

/**
 * "Back to the tail": drop the window and follow the space again.
 */
export class BrowserTailRequested extends $CustomType {}
export const Msg$BrowserTailRequested$const = new BrowserTailRequested();
export const Msg$BrowserTailRequested = () => Msg$BrowserTailRequested$const;
export const Msg$isBrowserTailRequested = (value) =>
  value instanceof BrowserTailRequested;

export class SearchChanged extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$SearchChanged = ($0) => new SearchChanged($0);
export const Msg$isSearchChanged = (value) => value instanceof SearchChanged;
export const Msg$SearchChanged$0 = (value) => value[0];

/**
 * A keypress in the search box; `Enter` submits.
 */
export class SearchKeyed extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$SearchKeyed = ($0) => new SearchKeyed($0);
export const Msg$isSearchKeyed = (value) => value instanceof SearchKeyed;
export const Msg$SearchKeyed$0 = (value) => value[0];

export class SearchSubmitted extends $CustomType {}
export const Msg$SearchSubmitted$const = new SearchSubmitted();
export const Msg$SearchSubmitted = () => Msg$SearchSubmitted$const;
export const Msg$isSearchSubmitted = (value) =>
  value instanceof SearchSubmitted;

export class SearchArrived extends $CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
export const Msg$SearchArrived = ($0) => new SearchArrived($0);
export const Msg$isSearchArrived = (value) => value instanceof SearchArrived;
export const Msg$SearchArrived$0 = (value) => value[0];

/**
 * How many polls of history the sparklines keep (60 × 10 s = 10 minutes).
 */
export const history_length = 60;

/**
 * How often the wall polls the reader: 10 s, the pace the sparklines assume.
 */
export const poll_interval_ms = 10_000;

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
    $logs.Tab$Dashboard$const,
    $logs.empty_filters(),
    Option$None$const,
    $browser.empty_browser(),
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
  return ((("work: " + $format.format_count(agents.in_flight)) + " in flight · ") + $format.format_count(
    agents.queued,
  )) + " queued";
}

/**
 * `work: — in flight · — queued` when there are no agents yet.
 */
export function empty_agents() {
  return new Agents(
    "main",
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

/**
 * The cards that are projects: the AGENTS list, filtered by kind.
 */
export function project_cards(agents) {
  return $list.filter(
    agents.named,
    (card) => { return card.kind === "project"; },
  );
}

/**
 * The subagent cards, same list, the other side of the filter.
 */
export function subagent_cards(agents) {
  return $list.filter(
    agents.named,
    (card) => { return card.kind !== "project"; },
  );
}

/**
 * `!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU` → `!ig3PmgqC-r…XpufmU`.
 * A short id (`!short:jacks.im`) is already readable, so it comes back whole.
 */
export function room_short(room) {
  let $ = $string.length(room) > 20;
  if ($) {
    return ($string.slice(room, 0, 11) + "…") + $string.slice(
      room,
      $string.length(room) - 6,
      $string.length(room),
    );
  } else {
    return room;
  }
}

/**
 * `app — room !ig3PmgqC-r…XpufmU — 12 entries`: what the projects pane prints
 * above a card's directory. Unknowns say so instead of printing `None`.
 */
export function project_line(card) {
  let _block;
  let $ = card.room;
  if ($ instanceof Some) {
    let room = $[0];
    _block = room_short(room);
  } else {
    _block = "no room";
  }
  let room = _block;
  return ((((card.name + " — room ") + room) + " — ") + $format.format_count(
    card.entries,
  )) + " entries";
}

/**
 * The directory a project works in, or a plain statement that nothing said.
 */
export function project_dir(card) {
  let $ = card.cwd;
  if ($ instanceof Some) {
    let cwd = $[0];
    return cwd;
  } else {
    return "no directory";
  }
}

/**
 * The one-line summary from `AGENTS.md`, or a nudge to write one.
 */
export function project_summary(card) {
  let $ = card.summary;
  if ($ instanceof Some) {
    let summary = $[0];
    if (summary !== "") {
      return summary;
    } else {
      return "no AGENTS.md summary yet";
    }
  } else {
    return "no AGENTS.md summary yet";
  }
}

/**
 * `2 projects` / `no projects yet`, the pane's heading line.
 */
export function project_count_line(cards) {
  if (cards instanceof $Empty) {
    return "no projects yet — bind one with /project new <name> in a room";
  } else if (cards.tail instanceof $Empty) {
    return "1 project";
  } else {
    return $int.to_string($list.length(cards)) + " projects";
  }
}
