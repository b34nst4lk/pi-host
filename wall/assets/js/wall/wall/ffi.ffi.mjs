// The wall's only JavaScript. Deliberately tiny: no framework, no bundler, no
// npm — `fetch`, `setInterval`, `Date.now`, and the query string.

export function fetch_text(url, on_ok, on_error) {
  globalThis
    .fetch(url, { headers: { accept: "application/json" }, cache: "no-store" })
    .then(async (response) => {
      const body = await response.text();
      if (!response.ok) {
        on_error(`${response.status} ${response.statusText}: ${body.slice(0, 200)}`);
        return;
      }
      on_ok(body);
    })
    .catch((error) => on_error(String((error && error.message) || error)));
}

export function every(milliseconds, on_tick) {
  globalThis.setInterval(on_tick, milliseconds);
}

export function now_ms() {
  return Date.now();
}

export function query_flag(name) {
  // Guarded: this module is imported by node smoke tests too, where there is no
  // `location` — the fake mode is then simply off.
  const params = new URLSearchParams(globalThis.location?.search ?? "");
  if (!params.has(name)) return false;
  const value = params.get(name);
  return value === "" || value === "1" || value === "true";
}
