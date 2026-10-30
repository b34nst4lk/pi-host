import * as $list from "../../gleam_stdlib/gleam/list.mjs";
import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import * as $effect from "../../lustre/lustre/effect.mjs";
import {
  List$Empty$const as $List$Empty$const,
  prepend as listPrepend,
  divideInt,
} from "../gleam.mjs";
import * as $browser from "../wall/browser.mjs";
import * as $decode from "../wall/decode.mjs";
import * as $fake from "../wall/fake.mjs";
import * as $ffi from "../wall/ffi.mjs";
import * as $logs from "../wall/logs.mjs";
import * as $model from "../wall/model.mjs";

export function load_page(filters, before, mode) {
  return $effect.from(
    (dispatch) => {
      if (mode instanceof $model.LiveMode) {
        let url = $logs.logs_path(filters, before, $logs.log_limit);
        $ffi.fetch_text(
          url,
          (body) => { return dispatch(new $model.LogsArrived(body)); },
          (problem) => { return dispatch(new $model.Failed(problem)); },
        );
      } else {
        dispatch(
          new $model.LogsArrived(
            $fake.logs_json(
              filters,
              divideInt($ffi.now_ms(), $model.poll_interval_ms),
            ),
          ),
        );
      }
      return undefined;
    },
  );
}

export function reload(current) {
  return load_page(current.filters, $option.Option$None$const, current.mode);
}

/**
 * A filter change starts the page over: the row set is the answer to a
 * different question, so the old rows are not the ones to keep.
 */
export function refilter(current, filters) {
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
    new $option.Some($logs.empty_logs()),
    current.browser,
  );
  return [next, reload(next)];
}

export function with_logs(current, logs) {
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

export function with_logs_error(current, problem) {
  let _block;
  let _pipe = current.logs;
  _block = $option.unwrap(_pipe, $logs.empty_logs());
  let previous = _block;
  return with_logs(
    current,
    new $logs.Logs(
      previous.entries,
      previous.next_before,
      previous.tailing,
      false,
      previous.spills,
      new $option.Some(problem),
    ),
  );
}

export function dedupe(entries) {
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
 */
export function with_page(current, page) {
  let _block;
  let _pipe = current.logs;
  _block = $option.unwrap(_pipe, $logs.empty_logs());
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
    new $logs.Logs(
      dedupe(entries),
      page.next_before,
      !previous.appending,
      false,
      previous.spills,
      $option.Option$None$const,
    ),
  );
}

/**
 * A spill answer lands in whichever stream asked for it. The browser pane's rows
 * are the same rows, so the map is keyed by entry id and written to both.
 */
export function with_spill(current, id, text) {
  let _block;
  let _pipe = current.logs;
  _block = $option.unwrap(_pipe, $logs.empty_logs());
  let previous = _block;
  let rest = $list.filter(previous.spills, (pair) => { return pair[0] !== id; });
  let logs = new $logs.Logs(
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
    let stream$1 = new $logs.Logs(
      stream.entries,
      stream.next_before,
      stream.tailing,
      stream.appending,
      listPrepend([id, text], kept),
      stream.error,
    );
    let _record = current.browser;
    _block$1 = new $browser.Browser(
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

/**
 * Should the poll refresh the LOGS page? Only while it shows the newest rows.
 */
export function tail_active(current) {
  let $ = current.tab;
  let $1 = current.logs;
  if ($1 instanceof $option.Some) {
    if ($ instanceof $logs.LogsTab) {
      let logs = $1[0];
      return logs.tailing;
    } else {
      return false;
    }
  } else if ($ instanceof $logs.LogsTab) {
    return true;
  } else {
    return false;
  }
}

/**
 * Should the poll refresh the BROWSER pane? While it follows the tail of a
 * selected space — not while it is a window around a landed hit.
 */
export function browser_tail_active(current) {
  let $ = current.tab;
  if ($ instanceof $logs.BrowserTab) {
    return (!(current.browser.selected instanceof $option.None)) && (current.browser.anchor instanceof $option.None);
  } else {
    return false;
  }
}

export function load_spill(id, path, mode) {
  return $effect.from(
    (dispatch) => {
      if (mode instanceof $model.LiveMode) {
        $ffi.fetch_text(
          "/api/spill?path=" + $logs.url_encode(path),
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
