import * as $option from "../gleam_stdlib/gleam/option.mjs";
import * as $lustre from "../lustre/lustre.mjs";
import * as $effect from "../lustre/lustre/effect.mjs";
import { Ok, Empty as $Empty, List$Empty$const as $List$Empty$const, divideInt } from "./gleam.mjs";
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
 * The fake mode's "network": fixtures for the current poll count, replayed
 * through `dispatch` as if they had arrived from the reader.
 * 
 * @ignore
 */
function fixtures_tick() {
  return (dispatch) => {
    let poll$1 = divideInt($ffi.now_ms(), poll_interval_ms);
    dispatch(new $model.StateArrived($fake.state_json(poll$1)));
    dispatch(new $model.SpendArrived($fake.spend_json(poll$1)));
    return undefined;
  };
}

/**
 * One tick: fetch both endpoints (or hand the fixtures over).
 * 
 * @ignore
 */
function poll() {
  return $effect.from(
    (dispatch) => {
      let mode = $ffi.query_flag("fake");
      if (mode) {
        let $ = fixtures_tick();
        let tick = $;
        tick(dispatch);
      } else {
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
    return [current, poll()];
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
  } else {
    return [
      new $model.Model(
        toggle(current.mode),
        current.vitals,
        current.spend,
        current.agents,
        current.queue,
        $List$Empty$const,
        0,
        current.error,
      ),
      poll(),
    ];
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
  return [$model.initial(mode), poll()];
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
