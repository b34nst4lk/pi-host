//// The PROJECTS view (the agent cards, filtered by kind) and the pretty-printer
//// behind an expanded record.

import gleam/list
import gleam/string
import gleam/option.{None, Some}
import gleeunit/should
import lustre/element
import wall/decode
import wall/model
import wall/pretty
import wall/view
import wall/logs
import wall_fixtures

// --- the projects view ----------------------------------------------------
//
// A project is a room bound to its own conversation. The wall shows them as a
// filtered view of the agent cards, so these assertions pin the three things the
// pane could get wrong: the short room form, the fallbacks when a card is thin,
// and that the pane draws one row per project — and that the dashboard's AGENTS
// card does NOT list them, because a project is not a subagent.

fn sample_projects() -> model.Agents {
  model.Agents(
    ..model.empty_agents(),
    named: [
      model.AgentCard(
        kind: "project",
        name: "the-wall",
        state: "working",
        branch: "",
        worktree: "",
        last_reply: None,
        room: Some("!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU"),
        cwd: Some("/work/projects/the-wall"),
        summary: Some("the wall: a read-only window on the ledger"),
        entries: Some(1832),
      ),
      model.AgentCard(
        kind: "project",
        name: "docs",
        state: "retired",
        branch: "",
        worktree: "",
        last_reply: None,
        room: None,
        cwd: None,
        summary: Some(""),
        entries: None,
      ),
      model.AgentCard(
        kind: "subagent",
        name: "reader",
        state: "alive",
        branch: "worktree-reader",
        worktree: "/w/reader",
        last_reply: Some(2393),
        room: None,
        cwd: None,
        summary: None,
        entries: None,
      ),
    ],
  )
}

fn projects_model() -> model.Model {
  model.Model(
    ..model.initial(model.LiveMode),
    tab: logs.ProjectsTab,
    agents: Some(sample_projects()),
  )
}

pub fn room_short_keeps_short_ids_and_clips_long_ones_test() {
  model.room_short("!docs:jacks.im") |> should.equal("!docs:jacks.im")
  model.room_short("!ig3PmgqC-rUdJMNvo6sfPHRtUlIMaeU8XqidpXpufmU")
  |> should.equal("!ig3PmgqC-r…XpufmU")
  // exactly 20 characters is still readable, so it comes back whole
  model.room_short("!abcdefghij:jacks.im")
  |> should.equal("!abcdefghij:jacks.im")
}

pub fn project_line_names_the_room_and_the_history_test() {
  let projects = sample_projects()
  let assert [the_wall, docs] = model.project_cards(projects)
  model.project_line(the_wall)
  |> should.equal("the-wall — room !ig3PmgqC-r…XpufmU — 1,832 entries")
  // no room, no count: the line says so instead of printing a zero
  model.project_line(docs) |> should.equal("docs — room no room — — entries")
}

pub fn project_fallbacks_never_invent_a_directory_or_a_summary_test() {
  let assert [the_wall, docs] = model.project_cards(sample_projects())
  model.project_dir(the_wall) |> should.equal("/work/projects/the-wall")
  model.project_summary(the_wall)
  |> should.equal("the wall: a read-only window on the ledger")
  model.project_dir(docs) |> should.equal("no directory")
  // "" is not a summary: an AGENTS.md with no first line says so
  model.project_summary(docs) |> should.equal("no AGENTS.md summary yet")
}

pub fn project_count_line_teaches_the_command_when_empty_test() {
  model.project_count_line([])
  |> should.equal("no projects yet — bind one with /project new <name> in a room")
  model.project_count_line(model.project_cards(sample_projects()))
  |> should.equal("2 projects")
}

pub fn a_project_card_decodes_its_own_fields_test() {
  let json =
    "{\"v\":1,\"ok\":true,\"agents\":{\"named\":[{\"kind\":\"project\",\"name\":\"the-wall\",\"state\":\"working\",\"branch\":\"\",\"worktree\":null,\"last_reply\":null,\"room\":\"!r:jacks.im\",\"cwd\":\"/w/p\",\"summary\":\"s\",\"entries\":7}]}}"
  let assert Ok(state) = decode.state(json)
  let assert Ok(card) = list.first(state.agents.named)
  card.kind |> should.equal("project")
  card.room |> should.equal(Some("!r:jacks.im"))
  card.cwd |> should.equal(Some("/w/p"))
  card.summary |> should.equal(Some("s"))
  card.entries |> should.equal(Some(7))
  // an explicit null worktree is a default, not a decode failure
  card.worktree |> should.equal("")
  card.last_reply |> should.equal(None)
}

pub fn a_card_without_a_kind_is_a_subagent_test() {
  // Older readers have no `kind`: those cards are subagents, never projects.
  let json = "{\"v\":1,\"ok\":true,\"agents\":{\"named\":[{\"name\":\"reader\",\"state\":\"alive\"}]}}"
  let assert Ok(state) = decode.state(json)
  let assert Ok(card) = list.first(state.agents.named)
  card.kind |> should.equal("subagent")
  model.project_cards(state.agents) |> list.length |> should.equal(0)
}

pub fn the_projects_tab_draws_a_row_per_project_test() {
  let html = view.view(projects_model()) |> element.to_string
  html |> wall_fixtures.count_of("class=\"project\"") |> should.equal(2)
  html |> string.contains("PROJECTS") |> should.be_true()
  html |> string.contains("2 projects") |> should.be_true()
  html |> string.contains("the-wall") |> should.be_true()
  html |> string.contains("!ig3PmgqC-r…XpufmU") |> should.be_true()
  html |> string.contains("/work/projects/the-wall") |> should.be_true()
  html |> string.contains("1,832 entries") |> should.be_true()
  html |> string.contains("state-working") |> should.be_true()
  html |> string.contains("no directory") |> should.be_true()
  // the subagent in the same list is not a project row
  html |> string.contains("worktree-reader") |> should.be_false()
  // and the dashboard is off the page
  html |> string.contains("VITALS") |> should.be_false()
}

pub fn an_empty_projects_tab_teaches_the_command_test() {
  let empty = model.Model(
    ..model.initial(model.LiveMode),
    tab: logs.ProjectsTab,
    agents: Some(model.empty_agents()),
  )
  let html = view.view(empty) |> element.to_string
  html |> wall_fixtures.count_of("class=\"project\"") |> should.equal(0)
  html |> string.contains("/project new") |> should.be_true()
  html |> string.contains("no projects yet") |> should.be_true()
}

pub fn the_dashboard_agents_card_points_at_the_projects_tab_test() {
  let html = view.view(model.Model(
    ..model.initial(model.LiveMode),
    agents: Some(sample_projects()),
  )) |> element.to_string
  // the subagent is an agent card; the projects are a one-line count, not cards
  html |> string.contains("worktree-reader") |> should.be_true()
  html |> string.contains("2 project(s) — see the PROJECTS tab") |> should.be_true()
}


// --- pretty-printing an expanded record ------------------------------------
//
// The reader stores each record verbatim and compact; the row's expander indents
// it for a human without ever touching the wire shape.

pub fn a_compact_record_gains_lines_test() {
  pretty.json("{\"kind\":\"pi.assistant\",\"id\":3610}")
  |> should.equal("{\n  \"kind\": \"pi.assistant\",\n  \"id\": 3610\n}")
}

pub fn nesting_adds_a_level_each_time_test() {
  pretty.json("{\"a\":{\"b\":[1,2]}}")
  |> should.equal(
    "{\n  \"a\": {\n    \"b\": [\n      1,\n      2\n    ]\n  }\n}",
  )
}

pub fn empty_containers_stay_on_one_line_test() {
  pretty.json("{\"a\":{},\"b\":[],\"c\":[{}]}")
  |> should.equal("{\n  \"a\": {},\n  \"b\": [],\n  \"c\": [\n    {}\n  ]\n}")
}

pub fn string_literals_are_never_reformatted_test() {
  // braces, commas, colons and escaped quotes inside a string are content
  pretty.json("{\"t\":\"a {b}, c: \\\"d\\\"\"}")
  |> should.equal("{\n  \"t\": \"a {b}, c: \\\"d\\\"\"\n}")
  // an escaped backslash does not unescape the quote after it
  pretty.json("{\"t\":\"back\\\\\"}")
  |> should.equal("{\n  \"t\": \"back\\\\\"\n}")
}

pub fn top_level_shapes_are_kept_test() {
  pretty.json("[]") |> should.equal("[]")
  pretty.json("[1,true,null]") |> should.equal("[\n  1,\n  true,\n  null\n]")
  // already indented input is re-indented, not doubled
  pretty.json("{ \"a\" : 1 }") |> should.equal("{\n  \"a\": 1\n}")
}

pub fn a_record_that_is_not_json_is_left_alone_test() {
  pretty.json("not a record at all") |> should.equal("not a record at all")
  pretty.json("") |> should.equal("")
  pretty.json("{\"truncated\":") |> should.equal("{\"truncated\":")
}

pub fn an_enormous_record_is_not_indented_test() {
  let huge = "{\"a\":\"" <> string.repeat("x", pretty.max_pretty_chars) <> "\"}"
  pretty.json(huge) |> should.equal(huge)
}

pub fn the_expander_shows_the_indented_record_test() {
  let html = view.view(wall_fixtures.logs_model()) |> element.to_string
  html
  |> string.contains("{\n  &quot;kind&quot;: &quot;pi.assistant&quot;\n}")
  |> should.be_true()
}

