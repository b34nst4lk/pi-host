import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $option from "../gleam_stdlib/gleam/option.mjs";
import * as $string from "../gleam_stdlib/gleam/string.mjs";
import * as $lustre from "../lustre/lustre.mjs";
import * as $effect from "../lustre/lustre/effect.mjs";
import {
  Ok,
  Empty as $Empty,
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  divideInt,
} from "./gleam.mjs";
import * as $decode from "./wall/decode.mjs";
import * as $fake from "./wall/fake.mjs";
import * as $ffi from "./wall/ffi.mjs";
import * as $model from "./wall/model.mjs";
import * as $view from "./wall/view.mjs";

/**
 * Ten seconds: one poll per tick, both endpoints.
 */
export const poll_interval_ms = 10_000;

function fail(current, problem) {
  return new $model.Model(
    current.mode,
    current.vitals,
    current.spend,
    current.agents,
    current.queue,
    current.samples,
    current.polls + 1,
    new $option.Some(problem),
    current.tab,
    current.filters,
    current.logs,
    current.browser,
  );
}

function with_hits(current, hits, problem) {
  let _block;
  let _record = current.browser.search;
  _block = new $model.Search(_record.query, _record.asked, hits, problem, false);
  let search = _block;
  return new $model.Model(
    current.mode,
    current.vitals,
    current.spend,
    current.agents,
    current.queue,
    current.samples,
    current.polls,
    current.error,
    current.tab,
    current.filters,
    current.logs,
    (() => {
      let _record$1 = current.browser;
      return new $model.Browser(
        _record$1.conversations,
        _record$1.conversations_error,
        _record$1.selected,
        _record$1.stream,
        _record$1.anchor,
        search,
      );
    })(),
  );
}

function run_search(query, mode) {
  return $effect.from(
    (dispatch) => {
      if (mode instanceof $model.LiveMode) {
        $ffi.fetch_text(
          $model.search_path(query, $model.search_limit),
          (body) => { return dispatch(new $model.SearchArrived(body)); },
          (problem) => { return dispatch(new $model.Failed(problem)); },
        );
      } else {
        dispatch(new $model.SearchArrived($fake.search_json(query)));
      }
      return undefined;
    },
  );
}

/**
 * Enter (or the button): search once for what is in the box. An empty box is a
 * mistake, not a query, so it says so rather than searching for everything.
 * 
 * @ignore
 */
function submit_search(current) {
  let asked = $string.trim(current.browser.search.query);
  if (asked === "") {
    let _block;
    let _record = current.browser.search;
    _block = new $model.Search(
      _record.query,
      _record.asked,
      _record.hits,
      new $option.Some("type something to search for"),
      false,
    );
    let search = _block;
    return [
      new $model.Model(
        current.mode,
        current.vitals,
        current.spend,
        current.agents,
        current.queue,
        current.samples,
        current.polls,
        current.error,
        current.tab,
        current.filters,
        current.logs,
        (() => {
          let _record$1 = current.browser;
          return new $model.Browser(
            _record$1.conversations,
            _record$1.conversations_error,
            _record$1.selected,
            _record$1.stream,
            _record$1.anchor,
            search,
          );
        })(),
      ),
      $effect.none(),
    ];
  } else {
    let _block;
    let _record = current.browser.search;
    _block = new $model.Search(
      _record.query,
      asked,
      _record.hits,
      $option.Option$None$const,
      true,
    );
    let search = _block;
    let next = new $model.Model(
      current.mode,
      current.vitals,
      current.spend,
      current.agents,
      current.queue,
      current.samples,
      current.polls,
      current.error,
      current.tab,
      current.filters,
      current.logs,
      (() => {
        let _record$1 = current.browser;
        return new $model.Browser(
          _record$1.conversations,
          _record$1.conversations_error,
          _record$1.selected,
          _record$1.stream,
          _record$1.anchor,
          search,
        );
      })(),
    );
    return [next, run_search(asked, current.mode)];
  }
}

/**
 * The selected space's stream: the tail, or the window around a landed hit.
 * 
 * @ignore
 */
function load_browser(current) {
  return $effect.from(
    (dispatch) => {
      let $ = current.browser.selected;
      if ($ instanceof $option.Some) {
        let id = $[0];
        let $1 = current.mode;
        if ($1 instanceof $model.LiveMode) {
          $ffi.fetch_text(
            $model.logs_path_for(
              current.filters,
              new $option.Some(id),
              $option.Option$None$const,
              $model.log_limit,
              current.browser.anchor,
            ),
            (body) => { return dispatch(new $model.BrowserLogsArrived(body)); },
            (problem) => { return dispatch(new $model.Failed(problem)); },
          );
        } else {
          dispatch(
            new $model.BrowserLogsArrived(
              $fake.browser_logs_json(
                id,
                current.filters,
                divideInt($ffi.now_ms(), poll_interval_ms),
              ),
            ),
          );
        }
        return undefined;
      } else {
        return undefined;
      }
    },
  );
}

/**
 * A spill answer lands in whichever stream asked for it. The browser pane's rows
 * are the same rows, so the map is keyed by entry id and written to both.
 * 
 * @ignore
 */
function with_spill(current, id, text) {
  let _block;
  let _pipe = current.logs;
  _block = $option.unwrap(_pipe, $model.empty_logs());
  let previous = _block;
  let rest = $list.filter(previous.spills, (pair) => { return pair[0] !== id; });
  let logs = new $model.Logs(
    previous.entries,
    previous.next_before,
    previous.tailing,
    previous.appending,
    listPrepend([id, text], rest),
    previous.error,
  );
  let _block$1;
  let $ = current.browser.stream;
  if ($ instanceof $option.Some) {
    let stream = $[0];
    let kept = $list.filter(stream.spills, (pair) => { return pair[0] !== id; });
    let stream$1 = new $model.Logs(
      stream.entries,
      stream.next_before,
      stream.tailing,
      stream.appending,
      listPrepend([id, text], kept),
      stream.error,
    );
    let _record = current.browser;
    _block$1 = new $model.Browser(
      _record.conversations,
      _record.conversations_error,
      _record.selected,
      new $option.Some(stream$1),
      _record.anchor,
      _record.search,
    );
  } else {
    _block$1 = current.browser;
  }
  let browser = _block$1;
  return new $model.Model(
    current.mode,
    current.vitals,
    current.spend,
    current.agents,
    current.queue,
    current.samples,
    current.polls,
    current.error,
    current.tab,
    current.filters,
    new $option.Some(logs),
    browser,
  );
}

function load_spill(id, path, mode) {
  return $effect.from(
    (dispatch) => {
      if (mode instanceof $model.LiveMode) {
        $ffi.fetch_text(
          "/api/spill?path=" + $model.url_encode(path),
          (body) => { return dispatch(new $model.SpillArrived(id, body)); },
          (problem) => { return dispatch(new $model.SpillFailed(id, problem)); },
        );
      } else {
        dispatch(new $model.SpillArrived(id, $fake.spill_json()));
      }
      return undefined;
    },
  );
}

function with_logs(current, logs) {
  return new $model.Model(
    current.mode,
    current.vitals,
    current.spend,
    current.agents,
    current.queue,
    current.samples,
    current.polls,
    current.error,
    current.tab,
    current.filters,
    new $option.Some(logs),
    current.browser,
  );
}

function with_logs_error(current, problem) {
  let _block;
  let _pipe = current.logs;
  _block = $option.unwrap(_pipe, $model.empty_logs());
  let previous = _block;
  return with_logs(
    current,
    new $model.Logs(
      previous.entries,
      previous.next_before,
      previous.tailing,
      false,
      previous.spills,
      new $option.Some(problem),
    ),
  );
}

function dedupe(entries) {
  let $ = $list.fold(
    entries,
    [$List$Empty$const, $List$Empty$const],
    (state, entry) => {
      let $1 = $list.contains(state[1], entry.id);
      if ($1) {
        return state;
      } else {
        return [
          $list.append(state[0], listPrepend(entry, $List$Empty$const)),
          $list.append(state[1], listPrepend(entry.id, $List$Empty$const)),
        ];
      }
    },
  );
  let kept = $[0];
  return kept;
}

/**
 * A page arrived: it replaces the rows when it is the tail of the log, and
 * appends when it was asked for with a cursor. Duplicates are dropped, so an
 * overlapping older page cannot repeat a row.
 * 
 * @ignore
 */
function with_page(current, page) {
  let _block;
  let _pipe = current.logs;
  _block = $option.unwrap(_pipe, $model.empty_logs());
  let previous = _block;
  let _block$1;
  let $ = previous.appending;
  if ($) {
    _block$1 = $list.append(previous.entries, page.entries);
  } else {
    _block$1 = page.entries;
  }
  let entries = _block$1;
  return with_logs(
    current,
    new $model.Logs(
      dedupe(entries),
      page.next_before,
      !previous.appending,
      false,
      previous.spills,
      $option.Option$None$const,
    ),
  );
}

function load_page(filters, before, mode) {
  return $effect.from(
    (dispatch) => {
      if (mode instanceof $model.LiveMode) {
        let url = $model.logs_path(filters, before, $model.log_limit);
        $ffi.fetch_text(
          url,
          (body) => { return dispatch(new $model.LogsArrived(body)); },
          (problem) => { return dispatch(new $model.Failed(problem)); },
        );
      } else {
        dispatch(
          new $model.LogsArrived(
            $fake.logs_json(filters, divideInt($ffi.now_ms(), poll_interval_ms)),
          ),
        );
      }
      return undefined;
    },
  );
}

function reload(current) {
  return load_page(current.filters, $option.Option$None$const, current.mode);
}

/**
 * A filter change starts the page over: the row set is the answer to a
 * different question, so the old rows are not the ones to keep.
 * 
 * @ignore
 */
function refilter(current, filters) {
  let next = new $model.Model(
    current.mode,
    current.vitals,
    current.spend,
    current.agents,
    current.queue,
    current.samples,
    current.polls,
    current.error,
    current.tab,
    filters,
    new $option.Some($model.empty_logs()),
    current.browser,
  );
  return [next, reload(next)];
}

function load_conversations(mode) {
  return $effect.from(
    (dispatch) => {
      if (mode instanceof $model.LiveMode) {
        $ffi.fetch_text(
          "/api/conversations",
          (body) => { return dispatch(new $model.ConversationsArrived(body)); },
          (problem) => { return dispatch(new $model.Failed(problem)); },
        );
      } else {
        dispatch(new $model.ConversationsArrived($fake.conversations_json()));
      }
      return undefined;
    },
  );
}

function with_spend(current, spend) {
  let sample = new $model.Sample(
    $ffi.now_ms(),
    (() => {
      let $ = current.vitals;
      if ($ instanceof $option.Some) {
        let vitals = $[0];
        return $option.unwrap(vitals.entries, 0);
      } else {
        return 0;
      }
    })(),
    (() => {
      let $ = current.queue;
      if ($ instanceof $option.Some) {
        let queue = $[0];
        return $option.unwrap(queue.running, 0);
      } else {
        return 0;
      }
    })(),
    $option.unwrap(spend.requests, 0),
  );
  return new $model.Model(
    current.mode,
    current.vitals,
    new $option.Some(spend),
    current.agents,
    current.queue,
    $model.push_sample(current.samples, sample),
    current.polls,
    current.error,
    current.tab,
    current.filters,
    current.logs,
    current.browser,
  );
}

/**
 * The queue's error lines are part of `queue` but the decoders keep them
 * separate (they are a list of records, not scalars): keep the previous list
 * when the new payload has none, so a terse response never blanks the card.
 * 
 * @ignore
 */
function queue_with_errors(current, queue) {
  let $ = queue.errors;
  if ($ instanceof $Empty) {
    let $1 = current.queue;
    if ($1 instanceof $option.Some) {
      let previous = $1[0];
      return new $model.Queue(
        queue.inbox_depth,
        queue.running,
        queue.pending,
        queue.unanswered,
        previous.errors,
      );
    } else {
      return queue;
    }
  } else {
    return queue;
  }
}

/**
 * One poll of the browser tab: the rail always, the pane only while it tails.
 * 
 * @ignore
 */
function poll_browser(current, dispatch) {
  $ffi.fetch_text(
    "/api/conversations",
    (body) => { return dispatch(new $model.ConversationsArrived(body)); },
    (problem) => { return dispatch(new $model.Failed(problem)); },
  );
  let $ = current.browser.selected;
  if ($ instanceof $option.Some) {
    let id = $[0];
    $ffi.fetch_text(
      $model.logs_path_for(
        current.filters,
        new $option.Some(id),
        $option.Option$None$const,
        $model.log_limit,
        current.browser.anchor,
      ),
      (body) => { return dispatch(new $model.BrowserLogsArrived(body)); },
      (problem) => { return dispatch(new $model.Failed(problem)); },
    );
  } else {
    undefined;
  }
  return undefined;
}

/**
 * Should the poll refresh the BROWSER pane? While it follows the tail of a
 * selected space — not while it is a window around a landed hit.
 * 
 * @ignore
 */
function browser_tail_active(current) {
  let $ = current.tab;
  if ($ instanceof $model.BrowserTab) {
    return (!(current.browser.selected instanceof $option.None)) && (current.browser.anchor instanceof $option.None);
  } else {
    return false;
  }
}

/**
 * Should the poll refresh the LOGS page? Only while it shows the newest rows.
 * 
 * @ignore
 */
function tail_active(current) {
  let $ = current.tab;
  let $1 = current.logs;
  if ($1 instanceof $option.Some) {
    if ($ instanceof $model.LogsTab) {
      let logs = $1[0];
      return logs.tailing;
    } else {
      return false;
    }
  } else if ($ instanceof $model.LogsTab) {
    return true;
  } else {
    return false;
  }
}

/**
 * The fake mode's "network": fixtures for the current poll count, replayed
 * through `dispatch` as if they had arrived from the reader.
 * 
 * @ignore
 */
function fixtures_tick(current, dispatch) {
  let poll$1 = divideInt($ffi.now_ms(), poll_interval_ms);
  dispatch(new $model.StateArrived($fake.state_json(poll$1)));
  dispatch(new $model.SpendArrived($fake.spend_json(poll$1)));
  let $ = tail_active(current);
  if ($) {
    dispatch(new $model.LogsArrived($fake.logs_json(current.filters, poll$1)));
  } else {
    undefined;
  }
  let $1 = browser_tail_active(current);
  if ($1) {
    dispatch(new $model.ConversationsArrived($fake.conversations_json()));
    let $2 = current.browser.selected;
    if ($2 instanceof $option.Some) {
      let id = $2[0];
      dispatch(
        new $model.BrowserLogsArrived(
          $fake.browser_logs_json(id, current.filters, poll$1),
        ),
      );
    } else {
      undefined;
    }
  } else {
    undefined;
  }
  return undefined;
}

/**
 * One tick: the two dashboard endpoints, plus the logs page while the LOGS tab
 * is open and still at the newest row.
 * 
 * @ignore
 */
function poll(current) {
  return $effect.from(
    (dispatch) => {
      let $ = current.mode;
      if ($ instanceof $model.LiveMode) {
        $ffi.fetch_text(
          "/api/state",
          (body) => { return dispatch(new $model.StateArrived(body)); },
          (problem) => { return dispatch(new $model.Failed(problem)); },
        );
        $ffi.fetch_text(
          "/api/spend",
          (body) => { return dispatch(new $model.SpendArrived(body)); },
          (_) => { return undefined; },
        );
        let $1 = tail_active(current);
        if ($1) {
          $ffi.fetch_text(
            $model.logs_path(
              current.filters,
              $option.Option$None$const,
              $model.log_limit,
            ),
            (body) => { return dispatch(new $model.LogsArrived(body)); },
            (problem) => { return dispatch(new $model.Failed(problem)); },
          );
        } else {
          undefined;
        }
        let $2 = browser_tail_active(current);
        if ($2) {
          poll_browser(current, dispatch);
        } else {
          undefined;
        }
      } else {
        fixtures_tick(current, dispatch);
      }
      return undefined;
    },
  );
}

function toggle(mode) {
  if (mode instanceof $model.LiveMode) {
    return $model.Mode$FakeMode$const;
  } else {
    return $model.Mode$LiveMode$const;
  }
}

export function update(current, msg) {
  if (msg instanceof $model.Tick) {
    return [current, poll(current)];
  } else if (msg instanceof $model.StateArrived) {
    let body = msg[0];
    let $ = $decode.state(body);
    if ($ instanceof Ok) {
      let state = $[0];
      return [
        new $model.Model(
          current.mode,
          new $option.Some(state.vitals),
          current.spend,
          new $option.Some(state.agents),
          new $option.Some(queue_with_errors(current, state.queue)),
          current.samples,
          current.polls + 1,
          $option.Option$None$const,
          current.tab,
          current.filters,
          current.logs,
          current.browser,
        ),
        $effect.none(),
      ];
    } else {
      let problem = $[0];
      return [fail(current, problem), $effect.none()];
    }
  } else if (msg instanceof $model.SpendArrived) {
    let body = msg[0];
    let $ = $decode.spend(body);
    if ($ instanceof Ok) {
      let spend = $[0];
      return [with_spend(current, spend), $effect.none()];
    } else {
      let problem = $[0];
      return [fail(current, problem), $effect.none()];
    }
  } else if (msg instanceof $model.Failed) {
    let problem = msg[0];
    return [fail(current, problem), $effect.none()];
  } else if (msg instanceof $model.ToggleMode) {
    let next = new $model.Model(
      toggle(current.mode),
      current.vitals,
      current.spend,
      current.agents,
      current.queue,
      $List$Empty$const,
      0,
      current.error,
      current.tab,
      current.filters,
      $option.Option$None$const,
      current.browser,
    );
    return [next, poll(next)];
  } else if (msg instanceof $model.TabChosen) {
    let tab = msg[0];
    let next = new $model.Model(
      current.mode,
      current.vitals,
      current.spend,
      current.agents,
      current.queue,
      current.samples,
      current.polls,
      current.error,
      tab,
      current.filters,
      current.logs,
      current.browser,
    );
    let _block;
    if (tab instanceof $model.Dashboard) {
      _block = $effect.none();
    } else if (tab instanceof $model.LogsTab) {
      _block = reload(next);
    } else {
      _block = $effect.batch(
        listPrepend(
          load_conversations(next.mode),
          listPrepend(load_browser(next), $List$Empty$const),
        ),
      );
    }
    let load = _block;
    return [next, load];
  } else if (msg instanceof $model.DirectionChosen) {
    let direction = msg[0];
    return refilter(
      current,
      (() => {
        let _record = current.filters;
        return new $model.LogFilters(_record.kinds, direction, _record.query);
      })(),
    );
  } else if (msg instanceof $model.KindToggled) {
    let kind = msg[0];
    let _block;
    let $ = $list.contains(current.filters.kinds, kind);
    if ($) {
      _block = $list.filter(
        current.filters.kinds,
        (other) => { return other !== kind; },
      );
    } else {
      _block = $list.append(
        current.filters.kinds,
        listPrepend(kind, $List$Empty$const),
      );
    }
    let kinds = _block;
    return refilter(
      current,
      (() => {
        let _record = current.filters;
        return new $model.LogFilters(kinds, _record.direction, _record.query);
      })(),
    );
  } else if (msg instanceof $model.QueryChanged) {
    let query = msg[0];
    return refilter(
      current,
      (() => {
        let _record = current.filters;
        return new $model.LogFilters(_record.kinds, _record.direction, query);
      })(),
    );
  } else if (msg instanceof $model.OlderRequested) {
    let $ = current.logs;
    if ($ instanceof $option.Some) {
      let logs = $[0];
      if (!(logs.next_before instanceof $option.None)) {
        return [
          with_logs(
            current,
            new $model.Logs(
              logs.entries,
              logs.next_before,
              false,
              true,
              logs.spills,
              logs.error,
            ),
          ),
          load_page(current.filters, logs.next_before, current.mode),
        ];
      } else {
        return [current, $effect.none()];
      }
    } else {
      return [current, $effect.none()];
    }
  } else if (msg instanceof $model.LogsArrived) {
    let body = msg[0];
    let $ = $decode.logs(body);
    if ($ instanceof Ok) {
      let page = $[0];
      if (page.ok) {
        return [with_page(current, page), $effect.none()];
      } else {
        let page$1 = $[0];
        return [
          with_logs_error(
            current,
            $option.unwrap(page$1.error, "the reader could not read the ledger"),
          ),
          $effect.none(),
        ];
      }
    } else {
      let problem = $[0];
      return [fail(current, problem), $effect.none()];
    }
  } else if (msg instanceof $model.SpillRequested) {
    let id = msg[0];
    let path = msg[1];
    return [current, load_spill(id, path, current.mode)];
  } else if (msg instanceof $model.SpillArrived) {
    let id = msg[0];
    let body = msg[1];
    let $ = $decode.spill(body);
    if ($ instanceof Ok) {
      let text = $[0];
      return [with_spill(current, id, text), $effect.none()];
    } else {
      let problem = $[0];
      return [with_spill(current, id, "error: " + problem), $effect.none()];
    }
  } else if (msg instanceof $model.SpillFailed) {
    let id = msg[0];
    let problem = msg[1];
    return [with_spill(current, id, "error: " + problem), $effect.none()];
  } else if (msg instanceof $model.ConversationsArrived) {
    let body = msg[0];
    let $ = $decode.conversations(body);
    if ($ instanceof Ok) {
      let page = $[0];
      if (page.ok) {
        let items = $model.order_conversations(page.items);
        let _block;
        let _record = current.browser;
        _block = new $model.Browser(
          items,
          $option.Option$None$const,
          _record.selected,
          _record.stream,
          _record.anchor,
          _record.search,
        );
        let browser = _block;
        let $1 = browser.selected;
        if ($1 instanceof $option.Some) {
          return [
            new $model.Model(
              current.mode,
              current.vitals,
              current.spend,
              current.agents,
              current.queue,
              current.samples,
              current.polls,
              current.error,
              current.tab,
              current.filters,
              current.logs,
              browser,
            ),
            $effect.none(),
          ];
        } else {
          let $2 = $list.first(items);
          if ($2 instanceof Ok) {
            let first = $2[0];
            let next = new $model.Model(
              current.mode,
              current.vitals,
              current.spend,
              current.agents,
              current.queue,
              current.samples,
              current.polls,
              current.error,
              current.tab,
              current.filters,
              current.logs,
              $model.select_conversation(browser, first.id),
            );
            return [next, load_browser(next)];
          } else {
            return [
              new $model.Model(
                current.mode,
                current.vitals,
                current.spend,
                current.agents,
                current.queue,
                current.samples,
                current.polls,
                current.error,
                current.tab,
                current.filters,
                current.logs,
                browser,
              ),
              $effect.none(),
            ];
          }
        }
      } else {
        let page$1 = $[0];
        let _block$1;
        let _record$1 = current.browser;
        _block$1 = new $model.Browser(
          _record$1.conversations,
          new $option.Some(
            $option.unwrap(
              page$1.error,
              "the reader could not read the conversations",
            ),
          ),
          _record$1.selected,
          _record$1.stream,
          _record$1.anchor,
          _record$1.search,
        );
        let browser$1 = _block$1;
        return [
          new $model.Model(
            current.mode,
            current.vitals,
            current.spend,
            current.agents,
            current.queue,
            current.samples,
            current.polls,
            current.error,
            current.tab,
            current.filters,
            current.logs,
            browser$1,
          ),
          $effect.none(),
        ];
      }
    } else {
      let problem = $[0];
      return [fail(current, problem), $effect.none()];
    }
  } else if (msg instanceof $model.ConversationChosen) {
    let id = msg[0];
    let next = new $model.Model(
      current.mode,
      current.vitals,
      current.spend,
      current.agents,
      current.queue,
      current.samples,
      current.polls,
      current.error,
      current.tab,
      current.filters,
      current.logs,
      $model.select_conversation(current.browser, id),
    );
    return [next, load_browser(next)];
  } else if (msg instanceof $model.BrowserLogsArrived) {
    let body = msg[0];
    let $ = $decode.logs(body);
    if ($ instanceof Ok) {
      let page = $[0];
      if (page.ok) {
        let _block;
        let _pipe = current.browser.stream;
        _block = $option.unwrap(_pipe, $model.empty_logs());
        let previous = _block;
        let stream = new $model.Logs(
          page.entries,
          page.next_before,
          current.browser.anchor instanceof $option.None,
          false,
          previous.spills,
          $option.Option$None$const,
        );
        let _block$1;
        let _record = current.browser;
        _block$1 = new $model.Browser(
          _record.conversations,
          _record.conversations_error,
          _record.selected,
          new $option.Some(stream),
          _record.anchor,
          _record.search,
        );
        let browser = _block$1;
        return [
          new $model.Model(
            current.mode,
            current.vitals,
            current.spend,
            current.agents,
            current.queue,
            current.samples,
            current.polls,
            current.error,
            current.tab,
            current.filters,
            current.logs,
            browser,
          ),
          $effect.none(),
        ];
      } else {
        let page$1 = $[0];
        let _block$2;
        let _pipe$1 = current.browser.stream;
        _block$2 = $option.unwrap(_pipe$1, $model.empty_logs());
        let previous$1 = _block$2;
        let stream$1 = new $model.Logs(
          previous$1.entries,
          previous$1.next_before,
          previous$1.tailing,
          false,
          previous$1.spills,
          new $option.Some(
            $option.unwrap(page$1.error, "the reader could not read the ledger"),
          ),
        );
        let _block$3;
        let _record$1 = current.browser;
        _block$3 = new $model.Browser(
          _record$1.conversations,
          _record$1.conversations_error,
          _record$1.selected,
          new $option.Some(stream$1),
          _record$1.anchor,
          _record$1.search,
        );
        let browser$1 = _block$3;
        return [
          new $model.Model(
            current.mode,
            current.vitals,
            current.spend,
            current.agents,
            current.queue,
            current.samples,
            current.polls,
            current.error,
            current.tab,
            current.filters,
            current.logs,
            browser$1,
          ),
          $effect.none(),
        ];
      }
    } else {
      let problem = $[0];
      return [fail(current, problem), $effect.none()];
    }
  } else if (msg instanceof $model.HitChosen) {
    let conversation = msg[0];
    let entry = msg[1];
    let browser = $model.jump_to_hit(current.browser, conversation, entry);
    let next = new $model.Model(
      current.mode,
      current.vitals,
      current.spend,
      current.agents,
      current.queue,
      current.samples,
      current.polls,
      current.error,
      $model.Tab$BrowserTab$const,
      current.filters,
      current.logs,
      browser,
    );
    return [next, load_browser(next)];
  } else if (msg instanceof $model.BrowserTailRequested) {
    let next = new $model.Model(
      current.mode,
      current.vitals,
      current.spend,
      current.agents,
      current.queue,
      current.samples,
      current.polls,
      current.error,
      current.tab,
      current.filters,
      current.logs,
      $model.tail_conversation(current.browser),
    );
    return [next, load_browser(next)];
  } else if (msg instanceof $model.SearchChanged) {
    let query = msg[0];
    let _block;
    let _record = current.browser.search;
    _block = new $model.Search(
      query,
      _record.asked,
      _record.hits,
      _record.error,
      _record.loading,
    );
    let search = _block;
    return [
      new $model.Model(
        current.mode,
        current.vitals,
        current.spend,
        current.agents,
        current.queue,
        current.samples,
        current.polls,
        current.error,
        current.tab,
        current.filters,
        current.logs,
        (() => {
          let _record$1 = current.browser;
          return new $model.Browser(
            _record$1.conversations,
            _record$1.conversations_error,
            _record$1.selected,
            _record$1.stream,
            _record$1.anchor,
            search,
          );
        })(),
      ),
      $effect.none(),
    ];
  } else if (msg instanceof $model.SearchKeyed) {
    let key = msg[0];
    let $ = $string.lowercase(key);
    if ($ === "enter") {
      return submit_search(current);
    } else {
      return [current, $effect.none()];
    }
  } else if (msg instanceof $model.SearchSubmitted) {
    return submit_search(current);
  } else {
    let body = msg[0];
    let $ = $decode.search(body);
    if ($ instanceof Ok) {
      let page = $[0];
      if (page.ok) {
        return [
          with_hits(current, page.hits, $option.Option$None$const),
          $effect.none(),
        ];
      } else {
        let page$1 = $[0];
        return [
          with_hits(
            current,
            page$1.hits,
            new $option.Some($option.unwrap(page$1.error, "the search failed")),
          ),
          $effect.none(),
        ];
      }
    } else {
      let problem = $[0];
      return [fail(current, problem), $effect.none()];
    }
  }
}

export function init(_) {
  let _block;
  let $ = $ffi.query_flag("fake");
  if ($) {
    _block = $model.Mode$FakeMode$const;
  } else {
    _block = $model.Mode$LiveMode$const;
  }
  let mode = _block;
  let fresh = $model.initial(mode);
  return [fresh, poll(fresh)];
}

export function main() {
  let app = $lustre.application(init, update, $view.view);
  let $ = $lustre.start(app, "#app", undefined);
  if ($ instanceof Ok) {
    return undefined;
  } else {
    return undefined;
  }
}
