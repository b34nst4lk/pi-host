import * as $list from "../gleam_stdlib/gleam/list.mjs";
import * as $option from "../gleam_stdlib/gleam/option.mjs";
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
  );
}

function with_spill(current, id, text) {
  let _block;
  let _pipe = current.logs;
  _block = $option.unwrap(_pipe, $model.empty_logs());
  let previous = _block;
  let rest = $list.filter(previous.spills, (pair) => { return pair[0] !== id; });
  return with_logs(
    current,
    new $model.Logs(
      previous.entries,
      previous.next_before,
      previous.tailing,
      previous.appending,
      listPrepend([id, text], rest),
      previous.error,
    ),
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
  );
  return [next, reload(next)];
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
 * Should the poll refresh the page? Only while it shows the newest rows.
 * 
 * @ignore
 */
function tail_active(current) {
  let $ = current.tab;
  let $1 = current.logs;
  if ($ instanceof $model.Dashboard) {
    return false;
  } else if ($1 instanceof $option.Some) {
    let logs = $1[0];
    return logs.tailing;
  } else {
    return true;
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
    );
    let _block;
    if (tab instanceof $model.Dashboard) {
      _block = $effect.none();
    } else {
      _block = reload(next);
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
  } else {
    let id = msg[0];
    let problem = msg[1];
    return [with_spill(current, id, "error: " + problem), $effect.none()];
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
