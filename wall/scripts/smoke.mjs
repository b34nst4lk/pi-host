// No-browser smoke test: drive the real compiled app through init → update → view
// with the fake fixtures, then flatten lustre's virtual DOM to text. Proves the
// whole chain runs in plain node (no browser, no reader, no network).
const assets = new URL("../assets/js/wall/", import.meta.url);
const load = (path) => import(new URL(path, assets));
const app = await load("wall.mjs");
const model = await load("wall/model.mjs");
const fake = await load("wall/fake.mjs");
const { view } = await load("wall/view.mjs");

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

const html = flatten(view(state));
const text = html.replace(/<[^>]+>/g, " ");
const needles = ["THE WALL", "VITALS", "SPEND", "FLEET", "QUEUE", "reader", "wall-ui", "#s114", "$0.00", "cached"];
const missing = needles.filter((n) => !html.includes(n));
const polylines = (html.match(/<polyline/g) || []).length;
const banner = text.includes("unexpected response shape");
const samples = list(state.samples, (s) => s).length;

console.log("polls:", state.polls, "| samples:", samples, "| polylines:", polylines);
console.log("rendered html:", html.length, "chars");
console.log("missing markers:", missing.length ? missing.join(", ") : "none");
console.log("error banner:", banner);
console.log(!missing.length && polylines >= 2 && !banner && samples === 5 ? "SMOKE PASS" : "SMOKE FAIL");
if (missing.length || polylines < 2 || banner) process.exitCode = 1;
