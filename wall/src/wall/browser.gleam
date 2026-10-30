//// The BROWSER tab: the conversation picker, one space's stream, and the search
//// hits that land in it.
////
//// Like `logs`, this module owns the contract types of its tab (`CONTRACT.md`
//// v1) and nothing else: pure functions of their arguments, no clock, no DOM.

import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/order
import gleam/string
import wall/logs

// --- the browser tab ---
/// A `pi.compaction` entry is a boundary in the stream, not a row: the wall draws
/// it as a divider with the summary one click away. Everything above and below it
/// stays one stream — nothing is collapsed, nothing is hidden.
pub fn is_divider(kind: String) -> Bool {
  kind == "pi.compaction"
}

/// `— summarized history begins —` for the first divider, `continues` after that.
pub fn divider_label(seen: Int) -> String {
  case seen {
    0 -> "— summarized history begins —"
    _ -> "— summarized history continues —"
  }
}

/// One space in the picker: the ledger's own view of a conversation.
pub type Conversation {
  Conversation(
    id: Int,
    /// `main` when nothing owns it, `child` otherwise; drift decodes as `unknown`.
    kind: String,
    title: String,
    /// The agent-state enum, unchanged: a space and its agent share a vocabulary.
    state: String,
    entries: Int,
    first_at: Option(String),
    last_at: Option(String),
  )
}

/// The picker's order: main pinned first, children in id order. The reader sorts
/// too; this is the defence the tests can see, and it fixes the order of a
/// response that arrived unsorted.
pub fn order_conversations(items: List(Conversation)) -> List(Conversation) {
  list.sort(items, fn(a, b) {
    case int.compare(kind_rank(a.kind), kind_rank(b.kind)) {
      order.Eq -> int.compare(a.id, b.id)
      otherwise -> otherwise
    }
  })
}

fn kind_rank(kind: String) -> Int {
  case kind {
    "main" -> 0
    _ -> 1
  }
}

/// `63 entries` — the count on a space card.
pub fn conversation_line(item: Conversation) -> String {
  int.to_string(item.entries)
  <> case item.entries {
    1 -> " entry"
    _ -> " entries"
  }
}

/// `10-28 09:12 → 10-29 14:31` — when the space starts and where it ended.
pub fn conversation_span(item: Conversation) -> String {
  logs.short_stamp(item.first_at) <> " → " <> logs.short_stamp(item.last_at)
}

/// One `/api/search` hit: the space it lives in, the entry to land on, one line.
pub type SearchHit {
  SearchHit(
    conversation: Option(Int),
    conversation_title: String,
    entry: Int,
    kind: String,
    at: Option(String),
    text: String,
  )
}

pub type Search {
  Search(
    query: String,
    /// The query whose hits are on screen: it differs from `query` while typing,
    /// and the hits list must not pretend to answer a half-typed word.
    asked: String,
    hits: List(SearchHit),
    error: Option(String),
    loading: Bool,
  )
}

pub fn empty_search() -> Search {
  Search(query: "", asked: "", hits: [], error: None, loading: False)
}

/// `3 hits for wall` / `no hits for wall` / `search every conversation`.
pub fn search_line(search: Search) -> String {
  case search.loading {
    True -> "searching…"
    False ->
      case search.asked {
        "" -> "search every conversation"
        asked ->
          case list.length(search.hits) {
            0 -> "no hits for " <> asked
            1 -> "1 hit for " <> asked
            count -> int.to_string(count) <> " hits for " <> asked
          }
      }
  }
}

pub type Browser {
  Browser(
    conversations: List(Conversation),
    /// Set when `/api/conversations` could not be read: an empty rail that says why.
    conversations_error: Option(String),
    selected: Option(Int),
    /// The selected space's stream. Same `Logs` the LOGS tab renders, loaded with
    /// `?conversation=`, so the rows, expanders and spills are one code path.
    stream: Option(logs.Logs),
    /// The entry a hit landed on: the pane is a window around it, the row is
    /// marked, and the tail is off until it is asked for.
    anchor: Option(Int),
    search: Search,
  )
}

pub fn empty_browser() -> Browser {
  Browser(
    conversations: [],
    conversations_error: None,
    selected: None,
    stream: None,
    anchor: None,
    search: empty_search(),
  )
}

/// The space on screen, looked up so the view can title the pane without a map.
pub fn selected_conversation(browser: Browser) -> Option(Conversation) {
  case browser.selected {
    None -> None
    Some(id) ->
      case list.find(browser.conversations, fn(item) { item.id == id }) {
        Ok(item) -> Some(item)
        Error(_) -> None
      }
  }
}

/// Show a space from its newest entry: the tail, no window, no highlight.
pub fn select_conversation(browser: Browser, id: Int) -> Browser {
  Browser(..browser, selected: Some(id), stream: Some(logs.empty_logs()), anchor: None)
}

/// Jump to a search hit: select its conversation *and* mark the entry, so the
/// pane opens as a window around the hit rather than at the top of the space.
pub fn jump_to_hit(browser: Browser, conversation: Option(Int), entry: Int) -> Browser {
  case conversation {
    None -> browser
    Some(id) ->
      Browser(..select_conversation(browser, id), anchor: Some(entry))
  }
}

/// Back to the live tail of the selected space.
pub fn tail_conversation(browser: Browser) -> Browser {
  Browser(..browser, anchor: None)
}

/// A space card's class: the selected one is visibly the selected one.
pub fn space_class(selected: Option(Int), id: Int) -> String {
  case selected {
    Some(chosen) if chosen == id -> "space-card selected"
    _ -> "space-card"
  }
}

/// What a row's `<details>` needs to know that is not in the record: whether
/// compaction draws a divider, and which row (if any) is the landed hit.
pub type RowOptions {
  RowOptions(dividers: Bool, anchor: Option(Int))
}

/// The LOGS tab: plain rows, no dividers, nothing marked.
pub fn log_options() -> RowOptions {
  RowOptions(dividers: False, anchor: None)
}

/// The BROWSER pane: compaction dividers, and the landed hit marked.
pub fn browser_options(anchor: Option(Int)) -> RowOptions {
  RowOptions(dividers: True, anchor: anchor)
}

/// Is this row the one a search hit landed on?
pub fn is_anchor(options: RowOptions, entry: logs.LogEntry) -> Bool {
  case options.anchor {
    Some(id) -> id == entry.id
    None -> False
  }
}

/// The reader URL for one page of one conversation. The plain LOGS tab calls
/// `logs_path`, which is this with "no conversation, no window": the default
/// conversation is the reader's own (the main one).
pub fn logs_path_for(
  filters: logs.LogFilters,
  conversation: Option(Int),
  before: Option(Int),
  limit: Int,
  around: Option(Int),
) -> String {
  logs.logs_path(filters, before, limit)
  <> case conversation {
    Some(id) -> "&conversation=" <> int.to_string(id)
    None -> ""
  }
  <> case around {
    Some(id) -> "&around=" <> int.to_string(id)
    None -> ""
  }
}

/// The search URL. No `kind=`: a search is over everything the ledger holds in
/// every space, and the chips belong to the stream, not to the jump list.
pub fn search_path(query: String, limit: Int) -> String {
  "/api/search?limit=" <> int.to_string(limit) <> "&q=" <> logs.url_encode(string.trim(query))
}

// --- the projects view -----------------------------------------------------
