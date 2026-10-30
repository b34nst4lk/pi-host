// No-browser smoke test: drive the real compiled app through init → update → view
// with the fake fixtures, then flatten lustre's virtual DOM to text. Proves the
// whole chain runs in plain node (no browser, no reader, no network).
const assets = new URL("../assets/js/wall/", import.meta.url);
const load = (path) => import(new URL(path, assets));
const app = await load("wall.mjs");
const model = await load("wall/model.mjs");
const fake = await load("wall/fake.mjs");
const { view } = await load("wall/view.mjs");
// Option is the stdlib's: import it from the same tree so `Some` is unwrapped the
// way Gleam unwraps it instead of guessed at.
const option = await import(new URL("../gleam_stdlib/gleam/option.mjs", assets));

const list = (l, f) => {
  const out = [];
  for (let cur = l; cur && cur.head !== undefined; cur = cur.tail) out.push(f(cur.head));
  return out;
};
const attributes = (node) =>
  list(node.attributes, (a) => `${a.name}="${a.value}"`).join(" ");

function flatten(node) {
  if (!node) return "";
  if (node.kind === 2) return node.content;
  if (node.kind !== 1) return "";
  const attrs = attributes(node);
  const kids = list(node.children, flatten).join("");
  const tag = node.tag;
  if (tag === "polyline") return `<polyline ${attrs}/>`;
  return `<${tag}${attrs ? " " + attrs : ""}>${kids}</${tag}>`;
}

let state = app.init(undefined)[0];
for (const poll of [0, 1, 2, 3, 4]) {
  state = app.update(state, new model.StateArrived(fake.state_json(poll)))[0];
  state = app.update(state, new model.SpendArrived(fake.spend_json(poll)))[0];
}

// the dashboard first...
const dashboard = flatten(view(state));
// ...then the LOGS tab, driven through the same update function the browser uses:
// choose the tab, take a page of fixtures, expand one row's full output.
state = app.update(state, new model.TabChosen(new model.LogsTab()))[0];
state = app.update(state, new model.LogsArrived(fake.logs_json(state.filters, 0)))[0];
// Some is a box with one field; None is a constant, so there is nothing to read.
const some = (value) => (option.Option$isSome(value) ? option.Option$Some$0(value) : undefined);
const entries = list(some(state.logs).entries, (entry) => entry);
const spilled = entries.find((entry) => option.Option$isSome(entry.spill));
state = app.update(
  state,
  new model.SpillArrived(spilled.id, fake.spill_json()),
)[0];
const logs = flatten(view(state));
// ...then the BROWSER tab: the rail, two compaction dividers, a search over every
// conversation, and a jump to a hit in a different space than the one on screen.
state = app.update(state, new model.TabChosen(new model.BrowserTab()))[0];
state = app.update(state, new model.ConversationsArrived(fake.conversations_json()))[0];
// Arriving conversations select main and ask for its stream.
const selected = some(state.browser.selected);
state = app.update(
  state,
  new model.BrowserLogsArrived(fake.browser_logs_json(selected, state.filters, 0)),
)[0];
state = app.update(state, new model.SearchChanged("browser"))[0];
state = app.update(state, new model.SearchKeyed("Enter"))[0];
state = app.update(state, new model.SearchArrived(fake.search_json("browser")))[0];
const rail = flatten(view(state));
const hits = list(state.browser.search.hits, (hit) => hit);
// The last hit lives in `wall-ui`, not in the space the pane is showing.
const hit = hits[hits.length - 1];
state = app.update(state, new model.HitChosen(hit.conversation, hit.entry))[0];
const landing = some(state.browser.selected);
state = app.update(
  state,
  new model.BrowserLogsArrived(fake.browser_logs_json(landing, state.filters, 0)),
)[0];
const jumped = flatten(view(state));
// ...and the PROJECTS tab: the same agent cards, filtered by kind — the pane must
// name the project, the room in short form, the directory and the history size.
state = app.update(state, new model.TabChosen(new model.ProjectsTab()))[0];
const projects = flatten(view(state));
const html = dashboard + logs + rail + jumped + projects;
const text = html.replace(/<[^>]+>/g, " ");
const needles = [
  "THE WALL",
  "VITALS",
  "SPEND",
  "AGENTS",
  "QUEUE",
  "reader",
  "wall-ui",
  "#s114",
  "$0.00",
  "cached",
  // round 2: the agent-state cards and the work line
  "pi-spike",
  "work: ",
  " in flight · ",
  " queued",
  "badge state-working",
  "badge state-reporting",
  "badge state-alive",
  "unnamed (prunable)",
  "last answer #2393",
  "retired agents",
  // round 3: the tabs and the logs browser
  ">LOGS<",
  ">DASHBOARD<",
  "log-rows",
  "log-raw",
  // the expanded record is indented for a human, not one long line: a space after
  // the colon only exists because the pretty-printer put it there
  '"kind": "pi.assistant"',
  "answered: the wall is up",
  "pi.tool-result",
  "full output · ",
  "line one",
  "older entries available",
  "search the ledger",
  "kind-assistant",
  // round 4: the browser tab, its dividers and its jump
  ">BROWSER<",
  "rail-cards",
  "space-card selected",
  "— summarized history begins —",
  "— summarized history continues —",
  "log-divider",
  "3 hits for browser",
  "the browser tab is up",
  "child: the browser tab renders",
  "log-row hit",
  // round 5: the projects view — a room bound to its own conversation
  ">PROJECTS<",
  "the-wall",
  "!ig3PmgqC-r…XpufmU",
  "/home/jacksim/hermes-users/jacksim/workspace/projects/the-wall",
  "1,832 entries",
  "no AGENTS.md summary yet",
  "2 project(s) — see the PROJECTS tab",
];
const missing = needles.filter((n) => !html.includes(n));
const polylines = (html.match(/<polyline/g) || []).length;
const banner = text.includes("unexpected response shape");
const samples = list(state.samples, (s) => s).length;

const rows = (logs.match(/log-row/g) || []).length;
const dividers = (rail.match(/log-divider/g) || []).length;
console.log("polls:", state.polls, "| samples:", samples, "| polylines:", polylines, "| log rows:", rows);
console.log("browser:", hits.length, "hits |", dividers, "dividers | landed on", landing);
console.log("rendered html:", html.length, "chars");
console.log("missing markers:", missing.length ? missing.join(", ") : "none");
console.log("error banner:", banner);
const pass = !missing.length && polylines >= 2 && !banner && samples === 5 && rows >= 6 && dividers === 2;
console.log(pass ? "SMOKE PASS" : "SMOKE FAIL");
if (!pass) process.exitCode = 1;
