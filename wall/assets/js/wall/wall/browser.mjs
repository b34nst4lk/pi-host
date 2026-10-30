import * as $int from "../../gleam_stdlib/gleam/int.mjs";
import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import { Some, Option$None$const } from "../../gleam_stdlib/gleam/option.mjs";
import * as $order from "../../gleam_stdlib/gleam/order.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import { Ok, List$Empty$const as $List$Empty$const, CustomType as $CustomType } from "../gleam.mjs";
import * as $logs from "../wall/logs.mjs";

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
  return ($logs.short_stamp(item.first_at) + " → ") + $logs.short_stamp(
    item.last_at,
  );
}

export function empty_search() {
  return new Search("", "", $List$Empty$const, Option$None$const, false);
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
    new Some($logs.empty_logs()),
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
  return ($logs.logs_path(filters, before, limit) + (() => {
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
  return (("/api/search?limit=" + $int.to_string(limit)) + "&q=") + $logs.url_encode(
    $string.trim(query),
  );
}
