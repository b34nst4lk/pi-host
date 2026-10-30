//// The wall: a read-only dashboard for the pi-host ledger. Elm architecture —
//// `init` / `update` / `view` — polling the reader every 10 s, drawing its own
//// sparklines, no chart library and no frontend framework.
////
//// Two data sources, one code path: `?fake=1` feeds the same decoders from
//// built-in fixtures (`wall/fake.gleam`), so the UI can be developed and tested
//// with no reader running and no network at all.

import gleam/option
import lustre
import lustre/effect
import wall/decode
import wall/fake
import wall/ffi
import wall/model
import wall/view

/// Ten seconds: one poll per tick, both endpoints.
pub const poll_interval_ms = 10_000

pub fn main() {
  let app = lustre.application(init, update, view.view)
  case lustre.start(app, "#app", Nil) {
    Ok(_) -> Nil
    Error(_problem) -> Nil
  }
}

pub fn init(_arguments: Nil) -> #(model.Model, effect.Effect(model.Msg)) {
  let mode = case ffi.query_flag("fake") {
    True -> model.FakeMode
    False -> model.LiveMode
  }
  #(model.initial(mode), poll())
}

pub fn update(current: model.Model, msg: model.Msg) -> #(model.Model, effect.Effect(model.Msg)) {
  case msg {
    model.Tick -> #(current, poll())
    model.ToggleMode ->
      #(
        model.Model(
          ..current,
          mode: toggle(current.mode),
          polls: 0,
          samples: [],
        ),
        poll(),
      )
    model.StateArrived(body) -> {
      case decode.state(body) {
        Ok(state) ->
          #(
            model.Model(
              ..current,
              vitals: option.Some(state.vitals),
              queue: option.Some(queue_with_errors(current, state.queue)),
              fleet: state.fleet,
              polls: current.polls + 1,
              error: option.None,
            ),
            effect.none(),
          )
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.SpendArrived(body) -> {
      case decode.spend(body) {
        Ok(spend) -> #(with_spend(current, spend), effect.none())
        Error(problem) -> #(fail(current, problem), effect.none())
      }
    }
    model.Failed(problem) -> #(fail(current, problem), effect.none())
  }
}

/// The queue's error lines are part of `queue` but the decoders keep them
/// separate (they are a list of records, not scalars): keep the previous list
/// when the new payload has none, so a terse response never blanks the card.
fn queue_with_errors(current: model.Model, queue: model.Queue) -> model.Queue {
  case queue.errors {
    [] ->
      case current.queue {
        option.Some(previous) -> model.Queue(..queue, errors: previous.errors)
        option.None -> queue
      }
    _ -> queue
  }
}

fn with_spend(current: model.Model, spend: model.Spend) -> model.Model {
  let sample = model.Sample(
    at: ffi.now_ms(),
    entries: case current.vitals {
      option.Some(vitals) -> option.unwrap(vitals.entries, 0)
      option.None -> 0
    },
    running: case current.queue {
      option.Some(queue) -> option.unwrap(queue.running, 0)
      option.None -> 0
    },
    requests: option.unwrap(spend.requests, 0),
  )
  model.Model(
    ..current,
    spend: option.Some(spend),
    samples: model.push_sample(current.samples, sample),
  )
}

fn fail(current: model.Model, problem: String) -> model.Model {
  model.Model(..current, error: option.Some(problem), polls: current.polls + 1)
}

fn toggle(mode: model.Mode) -> model.Mode {
  case mode {
    model.LiveMode -> model.FakeMode
    model.FakeMode -> model.LiveMode
  }
}

/// One tick: fetch both endpoints (or hand the fixtures over).
fn poll() -> effect.Effect(model.Msg) {
  effect.from(fn(dispatch) {
    let mode = ffi.query_flag("fake")
    case mode {
      True ->
        // Fixtures go through the same decoders as the reader's responses.
        case fixtures_tick() {
          tick -> tick(dispatch)
        }
      False -> {
        ffi.fetch_text(
          "/api/state",
          fn(body) { dispatch(model.StateArrived(body)) },
          fn(problem) { dispatch(model.Failed(problem)) },
        )
        ffi.fetch_text(
          "/api/spend",
          fn(body) { dispatch(model.SpendArrived(body)) },
          fn(_problem) { Nil },
        )
      }
    }
    Nil
  })
}

/// The fake mode's "network": fixtures for the current poll count, replayed
/// through `dispatch` as if they had arrived from the reader.
fn fixtures_tick() -> fn(fn(model.Msg) -> Nil) -> Nil {
  fn(dispatch) {
    let poll = ffi.now_ms() / poll_interval_ms
    dispatch(model.StateArrived(fake.state_json(poll)))
    dispatch(model.SpendArrived(fake.spend_json(poll)))
    Nil
  }
}

