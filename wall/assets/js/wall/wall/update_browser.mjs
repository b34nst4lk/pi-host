import * as $option from "../../gleam_stdlib/gleam/option.mjs";
import * as $string from "../../gleam_stdlib/gleam/string.mjs";
import * as $effect from "../../lustre/lustre/effect.mjs";
import { divideInt } from "../gleam.mjs";
import * as $browser from "../wall/browser.mjs";
import * as $fake from "../wall/fake.mjs";
import * as $ffi from "../wall/ffi.mjs";
import * as $logs from "../wall/logs.mjs";
import * as $model from "../wall/model.mjs";

export function with_hits(current, hits, problem) {
  let _block;
  let _record = current.browser.search;
  _block = new $browser.Search(
    _record.query,
    _record.asked,
    hits,
    problem,
    false,
  );
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
      return new $browser.Browser(
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

export function run_search(query, mode) {
  return $effect.from(
    (dispatch) => {
      if (mode instanceof $model.LiveMode) {
        $ffi.fetch_text(
          $browser.search_path(query, $logs.search_limit),
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
 */
export function submit_search(current) {
  let asked = $string.trim(current.browser.search.query);
  if (asked === "") {
    let _block;
    let _record = current.browser.search;
    _block = new $browser.Search(
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
          return new $browser.Browser(
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
    _block = new $browser.Search(
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
        return new $browser.Browser(
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

export function load_conversations(mode) {
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

/**
 * The selected space's stream: the tail, or the window around a landed hit.
 */
export function load_browser(current) {
  return $effect.from(
    (dispatch) => {
      let $ = current.browser.selected;
      if ($ instanceof $option.Some) {
        let id = $[0];
        let $1 = current.mode;
        if ($1 instanceof $model.LiveMode) {
          $ffi.fetch_text(
            $browser.logs_path_for(
              current.filters,
              new $option.Some(id),
              $option.Option$None$const,
              $logs.log_limit,
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
                divideInt($ffi.now_ms(), $model.poll_interval_ms),
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
 * One poll of the browser tab: the rail always, the pane only while it tails.
 */
export function poll_browser(current, dispatch) {
  $ffi.fetch_text(
    "/api/conversations",
    (body) => { return dispatch(new $model.ConversationsArrived(body)); },
    (problem) => { return dispatch(new $model.Failed(problem)); },
  );
  let $ = current.browser.selected;
  if ($ instanceof $option.Some) {
    let id = $[0];
    $ffi.fetch_text(
      $browser.logs_path_for(
        current.filters,
        new $option.Some(id),
        $option.Option$None$const,
        $logs.log_limit,
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
