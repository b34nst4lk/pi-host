import * as $float from "../../gleam_stdlib/gleam/float.mjs";
import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $order from "../../gleam_stdlib/gleam/order.mjs";
import * as $result from "../../gleam_stdlib/gleam/result.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import {
  Ok,
  Empty as $Empty,
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

export class Conversation extends $CustomType {
  constructor(id, kind, title, state, entries, first_at, last_at) {
    super();
    this.id = id;
    this.kind = kind;
    this.title = title;
    this.state = state;
    this.entries = entries;
    this.first_at = first_at;
    this.last_at = last_at;
  }
}
export const Conversation$Conversation = (id, kind, title, state, entries, first_at, last_at) =>
  new Conversation(id, kind, title, state, entries, first_at, last_at);
export const Conversation$isConversation = (value) =>
  value instanceof Conversation;
export const Conversation$Conversation$id = (value) => value.id;
export const Conversation$Conversation$0 = (value) => value.id;
export const Conversation$Conversation$kind = (value) => value.kind;
export const Conversation$Conversation$1 = (value) => value.kind;
export const Conversation$Conversation$title = (value) => value.title;
export const Conversation$Conversation$2 = (value) => value.title;
export const Conversation$Conversation$state = (value) => value.state;
export const Conversation$Conversation$3 = (value) => value.state;
export const Conversation$Conversation$entries = (value) => value.entries;
export const Conversation$Conversation$4 = (value) => value.entries;
export const Conversation$Conversation$first_at = (value) => value.first_at;
export const Conversation$Conversation$5 = (value) => value.first_at;
export const Conversation$Conversation$last_at = (value) => value.last_at;
export const Conversation$Conversation$6 = (value) => value.last_at;

export class SearchHit extends $CustomType {
  constructor(conversation, conversation_title, entry, kind, at, text) {
    super();
    this.conversation = conversation;
    this.conversation_title = conversation_title;
    this.entry = entry;
    this.kind = kind;
    this.at = at;
    this.text = text;
  }
}
export const SearchHit$SearchHit = (conversation, conversation_title, entry, kind, at, text) =>
  new SearchHit(conversation, conversation_title, entry, kind, at, text);
export const SearchHit$isSearchHit = (value) => value instanceof SearchHit;
export const SearchHit$SearchHit$conversation = (value) => value.conversation;
export const SearchHit$SearchHit$0 = (value) => value.conversation;
export const SearchHit$SearchHit$conversation_title = (value) =>
  value.conversation_title;
export const SearchHit$SearchHit$1 = (value) => value.conversation_title;
export const SearchHit$SearchHit$entry = (value) => value.entry;
export const SearchHit$SearchHit$2 = (value) => value.entry;
export const SearchHit$SearchHit$kind = (value) => value.kind;
export const SearchHit$SearchHit$3 = (value) => value.kind;
export const SearchHit$SearchHit$at = (value) => value.at;
export const SearchHit$SearchHit$4 = (value) => value.at;
export const SearchHit$SearchHit$text = (value) => value.text;
export const SearchHit$SearchHit$5 = (value) => value.text;

export class Search extends $CustomType {
  constructor(query, asked, hits, error, loading) {
    super();
    this.query = query;
    this.asked = asked;
    this.hits = hits;
    this.error = error;
    this.loading = loading;
  }
}
export const Search$Search = (query, asked, hits, error, loading) =>
  new Search(query, asked, hits, error, loading);
export const Search$isSearch = (value) => value instanceof Search;
export const Search$Search$query = (value) => value.query;
export const Search$Search$0 = (value) => value.query;
export const Search$Search$asked = (value) => value.asked;
export const Search$Search$1 = (value) => value.asked;
export const Search$Search$hits = (value) => value.hits;
export const Search$Search$2 = (value) => value.hits;
export const Search$Search$error = (value) => value.error;
export const Search$Search$3 = (value) => value.error;
export const Search$Search$loading = (value) => value.loading;
export const Search$Search$4 = (value) => value.loading;

export class Browser extends $CustomType {
  constructor(conversations, conversations_error, selected, stream, anchor, search) {
    super();
    this.conversations = conversations;
    this.conversations_error = conversations_error;
    this.selected = selected;
    this.stream = stream;
    this.anchor = anchor;
    this.search = search;
  }
}
export const Browser$Browser = (conversations, conversations_error, selected, stream, anchor, search) =>
  new Browser(conversations,
  conversations_error,
  selected,
  stream,
  anchor,
  search);
export const Browser$isBrowser = (value) => value instanceof Browser;
export const Browser$Browser$conversations = (value) => value.conversations;
export const Browser$Browser$0 = (value) => value.conversations;
export const Browser$Browser$conversations_error = (value) =>
  value.conversations_error;
export const Browser$Browser$1 = (value) => value.conversations_error;
export const Browser$Browser$selected = (value) => value.selected;
export const Browser$Browser$2 = (value) => value.selected;
export const Browser$Browser$stream = (value) => value.stream;
export const Browser$Browser$3 = (value) => value.stream;
export const Browser$Browser$anchor = (value) => value.anchor;
export const Browser$Browser$4 = (value) => value.anchor;
export const Browser$Browser$search = (value) => value.search;
export const Browser$Browser$5 = (value) => value.search;

export class RowOptions extends $CustomType {
  constructor(dividers, anchor) {
    super();
    this.dividers = dividers;
    this.anchor = anchor;
  }
}
export const RowOptions$RowOptions = (dividers, anchor) =>
  new RowOptions(dividers, anchor);
export const RowOptions$isRowOptions = (value) => value instanceof RowOptions;
export const RowOptions$RowOptions$dividers = (value) => value.dividers;
export const RowOptions$RowOptions$0 = (value) => value.dividers;
export const RowOptions$RowOptions$anchor = (value) => value.anchor;
export const RowOptions$RowOptions$1 = (value) => value.anchor;

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

export function empty_search() {
  return new Search("", "", $List$Empty$const, Option$None$const, false);
}

export function empty_browser() {
  return new Browser(
    $List$Empty$const,
    Option$None$const,
    Option$None$const,
    Option$None$const,
    Option$None$const,
    empty_search(),
  );
}

export function empty_filters() {
  return new LogFilters($List$Empty$const, Direction$BothWays$const, "");
}

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
    Tab$Dashboard$const,
    empty_filters(),
    Option$None$const,
    empty_browser(),
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
  } else {
    return "browser";
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

/**
 * A `pi.compaction` entry is a boundary in the stream, not a row: the wall draws
 * it as a divider with the summary one click away. Everything above and below it
 * stays one stream — nothing is collapsed, nothing is hidden.
 */
export function is_divider(kind) {
  return kind === "pi.compaction";
}

/**
 * `— summarized history begins —` for the first divider, `continues` after that.
 */
export function divider_label(seen) {
  if (seen === 0) {
    return "— summarized history begins —";
  } else {
    return "— summarized history continues —";
  }
}

function kind_rank(kind) {
  if (kind === "main") {
    return 0;
  } else {
    return 1;
  }
}

/**
 * The picker's order: main pinned first, children in id order. The reader sorts
 * too; this is the defence the tests can see, and it fixes the order of a
 * response that arrived unsorted.
 */
export function order_conversations(items) {
  return $list.sort(
    items,
    (a, b) => {
      let $ = $int.compare(kind_rank(a.kind), kind_rank(b.kind));
      if ($ instanceof $order.Eq) {
        return $int.compare(a.id, b.id);
      } else {
        return $;
      }
    },
  );
}

/**
 * `63 entries` — the count on a space card.
 */
export function conversation_line(item) {
  return $int.to_string(item.entries) + (() => {
    let $ = item.entries;
    if ($ === 1) {
      return " entry";
    } else {
      return " entries";
    }
  })();
}

/**
 * `10-28 09:12 → 10-29 14:31` — when the space starts and where it ended.
 */
export function conversation_span(item) {
  return (short_stamp(item.first_at) + " → ") + short_stamp(item.last_at);
}

/**
 * `3 hits for wall` / `no hits for wall` / `search every conversation`.
 */
export function search_line(search) {
  let $ = search.loading;
  if ($) {
    return "searching…";
  } else {
    let $1 = search.asked;
    if ($1 === "") {
      return "search every conversation";
    } else {
      let asked = $1;
      let $2 = $list.length(search.hits);
      if ($2 === 0) {
        return "no hits for " + asked;
      } else if ($2 === 1) {
        return "1 hit for " + asked;
      } else {
        let count = $2;
        return ($int.to_string(count) + " hits for ") + asked;
      }
    }
  }
}

/**
 * The space on screen, looked up so the view can title the pane without a map.
 */
export function selected_conversation(browser) {
  let $ = browser.selected;
  if ($ instanceof Some) {
    let id = $[0];
    let $1 = $list.find(
      browser.conversations,
      (item) => { return item.id === id; },
    );
    if ($1 instanceof Ok) {
      let item = $1[0];
      return new Some(item);
    } else {
      return Option$None$const;
    }
  } else {
    return $;
  }
}

/**
 * Show a space from its newest entry: the tail, no window, no highlight.
 */
export function select_conversation(browser, id) {
  return new Browser(
    browser.conversations,
    browser.conversations_error,
    new Some(id),
    new Some(empty_logs()),
    Option$None$const,
    browser.search,
  );
}

/**
 * Jump to a search hit: select its conversation *and* mark the entry, so the
 * pane opens as a window around the hit rather than at the top of the space.
 */
export function jump_to_hit(browser, conversation, entry) {
  if (conversation instanceof Some) {
    let id = conversation[0];
    let _record = select_conversation(browser, id);
    return new Browser(
      _record.conversations,
      _record.conversations_error,
      _record.selected,
      _record.stream,
      new Some(entry),
      _record.search,
    );
  } else {
    return browser;
  }
}

/**
 * Back to the live tail of the selected space.
 */
export function tail_conversation(browser) {
  return new Browser(
    browser.conversations,
    browser.conversations_error,
    browser.selected,
    browser.stream,
    Option$None$const,
    browser.search,
  );
}

/**
 * A space card's class: the selected one is visibly the selected one.
 */
export function space_class(selected, id) {
  if (selected instanceof Some) {
    let chosen = selected[0];
    if (chosen === id) {
      return "space-card selected";
    } else {
      return "space-card";
    }
  } else {
    return "space-card";
  }
}

/**
 * The LOGS tab: plain rows, no dividers, nothing marked.
 */
export function log_options() {
  return new RowOptions(false, Option$None$const);
}

/**
 * The BROWSER pane: compaction dividers, and the landed hit marked.
 */
export function browser_options(anchor) {
  return new RowOptions(true, anchor);
}

/**
 * Is this row the one a search hit landed on?
 */
export function is_anchor(options, entry) {
  let $ = options.anchor;
  if ($ instanceof Some) {
    let id = $[0];
    return id === entry.id;
  } else {
    return false;
  }
}

/**
 * The reader URL for one page of one conversation. The plain LOGS tab calls
 * `logs_path`, which is this with "no conversation, no window": the default
 * conversation is the reader's own (the main one).
 */
export function logs_path_for(filters, conversation, before, limit, around) {
  return (logs_path(filters, before, limit) + (() => {
    if (conversation instanceof Some) {
      let id = conversation[0];
      return "&conversation=" + $int.to_string(id);
    } else {
      return "";
    }
  })()) + (() => {
    if (around instanceof Some) {
      let id = around[0];
      return "&around=" + $int.to_string(id);
    } else {
      return "";
    }
  })();
}

/**
 * The search URL. No `kind=`: a search is over everything the ledger holds in
 * every space, and the chips belong to the stream, not to the jump list.
 */
export function search_path(query, limit) {
  return (("/api/search?limit=" + $int.to_string(limit)) + "&q=") + url_encode(
    $string.trim(query),
  );
}
