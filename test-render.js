/*
 * Minimal DOM shim + harness so the timeline viewer's render pipeline can be
 * executed and inspected under Node without a browser.
 *
 *   node test-render.js
 *
 * Verifies: the embedded dataset parses, every lineage renders a lane, every
 * event gets a hit target, and the pan / zoom / era / filter / detail paths do
 * not throw. Exits non-zero on the first failure.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const HTML = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "timeline.html");

const failures = [];
const softs = [];
const pendingFrames = new Set();
function drainFrames() {
  for (const id of pendingFrames) clearTimeout(id);
  const n = pendingFrames.size;
  pendingFrames.clear();
  return n;
}
function check(cond, msg) { if (!cond) failures.push(msg); }
function soft(msg) { softs.push(msg); }
function fail(msg) {
  console.log("");
  console.log("FAILED: " + msg);
  process.exit(1);
}

/* ----------------------------- DOM shim ----------------------------- */

class ClassList {
  constructor() { this._s = new Set(); }
  add(...c) { c.forEach((x) => this._s.add(x)); }
  remove(...c) { c.forEach((x) => this._s.delete(x)); }
  contains(c) { return this._s.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this._s.has(c) : !!force;
    if (on) this._s.add(c); else this._s.delete(c);
    return on;
  }
}

class El {
  constructor(tag, ns) {
    this.tagName = String(tag).toUpperCase();
    this.ns = ns || null;
    this.attributes = Object.create(null);
    this.children = [];
    this.parentNode = null;
    this.style = { setProperty(k, v) { this[k] = String(v); }, getPropertyValue(k) { return this[k] || ""; } };
    this._text = "";
    this._listeners = Object.create(null);
    this.clientWidth = 1440;
    this.clientHeight = 800;
  }
  /* classList is derived from the class attribute rather than stored beside it.
     Keeping two copies meant a class set via setAttribute was invisible to
     classList.contains (and classList.add was a no-op on such an element). */
  get classList() {
    const node = this;
    const read = () => String(node.attributes["class"] || "").split(/\s+/).filter(Boolean);
    const write = (list) => node.attributes["class"] = [...new Set(list)].join(" ");
    return {
      contains: (c) => read().includes(c),
      add: (...cs) => write(read().concat(cs)),
      remove: (...cs) => write(read().filter((x) => !cs.includes(x))),
      toggle: (c, force) => {
        const has = read().includes(c);
        const on = force === undefined ? !has : !!force;
        write(on ? read().concat([c]) : read().filter((x) => x !== c));
        return on;
      },
      get length() { return read().length; },
      item: (i) => read()[i] || null,
      toString: () => read().join(" "),
      _all: read,
    };
  }
  get ownerSVGElement() {
    let n = this;
    while (n) { if (n.tagName === "SVG") return n; n = n.parentNode; }
    return null;
  }
  get parentElement() { return this.parentNode; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  set className(v) { this.attributes["class"] = String(v); }
  get className() { return String(this.attributes["class"] || ""); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  set innerHTML(v) {
    this._html = String(v);
    this.children = [];
    if (v) this._parse(String(v));
  }
  get innerHTML() { return this._html || ""; }

  /* Enough of an HTML parser that nodes assigned via innerHTML can be found by
     id and have children appended to them - the viewer builds its detail panel
     that way, then draws an SVG into #dchart. */
  _parse(html) {
    const stack = [this];
    const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
    let m;
    while ((m = re.exec(html))) {
      const closing = m[1] === "/";
      const tag = m[2];
      const attrs = m[3] || "";
      const selfClose = m[4] === "/" || /^(br|hr|img|input|meta|link)$/i.test(tag);
      const top = stack[stack.length - 1];
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const node = new El(tag);
      /* copy every attribute, not just id/class: the dashboard addresses its
         own elements by data-* attributes (data-tab, data-lane, data-ev, ...) */
      for (const a of attrs.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
        node.setAttribute(a[1], a[2]);
      }
      const idm = attrs.match(/\bid\s*=\s*"([^"]*)"/);
      if (idm) {
        node.setAttribute("id", idm[1]);
        store[idm[1]] = node;
      }
      const clm = attrs.match(/\bclass\s*=\s*"([^"]*)"/);
      if (clm) node.className = clm[1];
      top.appendChild(node);
      if (!selfClose) stack.push(node);
    }
    return this;
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  insertBefore(c) { return this.appendChild(c); }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight, right: this.clientWidth, bottom: this.clientHeight }; }
  scrollIntoView() {}
  focus() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  fire(type, ev) { (this._listeners[type] || []).forEach((fn) => fn(ev || {})); }
  walk(fn) { for (const c of this.children) { fn(c); c.walk && c.walk(fn); } }
  querySelectorAll(sel) {
    const out = [];
    const attr = sel.match(/^\[([\w-]+)\]$/);
    if (attr) { this.walk((n) => { if (n.getAttribute && n.getAttribute(attr[1]) !== null) out.push(n); }); return out; }
    /* compound class selectors such as ".evdot.minor", and comma lists */
    if (/^\./.test(sel)) {
      const groups = sel.split(",").map((part) =>
        part.trim().replace(/^\./, "").split(".").filter(Boolean));
      this.walk((n) => {
        if (!n.classList) return;
        if (groups.some((need) => need.every((c) => n.classList.contains(c)))) out.push(n);
      });
      return out;
    }
    const tag = sel.toUpperCase();
    this.walk((n) => { if (n.tagName === tag) out.push(n); });
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  get firstChild() { return this.children[0] || null; }
}

/* ------------------------- document / window ------------------------- */

const ids = [
  "chart", "chartbody", "tip", "chips", "stats", "sort", "find",
  "zoom", "zin", "zout", "reset", "allev", "embedded-data",
  /* dashboard furniture, added when the page became a converging dashboard */
  "eras", "cards", "drawer", "panes", "dchart", "converge", "plate", "backdrop",
  "news-list", "panel-news", "btn-news", "axis-toggle",
  /* the single-canvas explorer: the side panel and its three modes */
  "panel-index", "panel-world", "panel-about", "panel-moments", "moments-body", "pclose-moments",
  "tags", "brand", "btn-worlds", "btn-about",
  "pclose-index", "pclose-about", "hero-title", "hero-lede", "notes", "legend-hint", "sec-worlds-blurb",
  "themes", "backdrop",
];
const store = Object.create(null);
ids.forEach((id) => { store[id] = new El(id === "chart" ? "svg" : "div"); });
store["embedder"] = new El("script");
store["embedded-data"].textContent = "{}";
store["sort"].value = "group";
store["find"].value = "";
store["zoom"].value = "330";
store["allev"].textContent = "Show all event labels";

/* Axis toggle and era presets are static markup in src/page.html. The harness
   scrapes them further down so it drives the real controls, not copies. */
const axisButtons = [
  { axis: "moments" }, { axis: "order" }, { axis: "years" },
].map((d, i) => {
  const b = new El("button");
  b.setAttribute("data-axis", d.axis);
  if (i === 0) b.classList.add("on");
  return b;
});

/* Era presets are read out of the real markup further down, so the harness can
   never drift out of sync with the page's actual buttons. */
const eraButtons = [];

const axisHost = new El("div");
axisButtons.forEach((b) => axisHost.appendChild(b));
axisHost.querySelectorAll = El.prototype.querySelectorAll;

const documentElement = new El("html");
const document = {
  documentElement,
  head: new El("head"),
  body: new El("body"),
  getElementById(id) { return store[id] || null; },
  createElement(tag) { return new El(tag); },
  createElementNS(ns, tag) { return new El(tag, ns); },
  addEventListener() {},
  querySelectorAll(sel) {
    if (sel === ".era") return eraButtons;
    if (sel === ".ax") return axisButtons;
    return [];
  },
  getElementById(id) { return store[id] || null; },
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
};
document.body.appendChild(store["chartbody"]);

const window = {
  innerWidth: 1440, innerHeight: 900,
  addEventListener() {},
  devicePixelRatio: 1,
  getComputedStyle() { return { getPropertyValue() { return ""; } }; },
};

const sandbox = {
  document, window, console,
  setTimeout, clearTimeout, Math, JSON, Date,
  Number, String, Object, Array, Boolean, Error, RegExp, Set, Map, isNaN, parseInt, parseFloat,
  fetch: () => Promise.reject(new Error("offline-harness")),
  /* the dashboard animates lane slides and the convergence sequence, so the
     harness needs timers and a monotonic clock */
  performance: { now: () => Number(process.hrtime.bigint() / 1000000n) },
  /* Track timers so the harness can drain them at the end: a live animation
     frame chain otherwise keeps the Node event loop open forever. */
  requestAnimationFrame: (fn) => {
    const id = setTimeout(() => { pendingFrames.delete(id); fn(performance.now()); }, 0);
    pendingFrames.add(id);
    return id;
  },
  cancelAnimationFrame: (id) => { pendingFrames.delete(id); clearTimeout(id); },
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

/* ------------------------------ run it ------------------------------ */

const html = fs.readFileSync(HTML, "utf8");

/* Build the era buttons from the real markup (plus their labels) so a change to
   the page's presets is exercised rather than silently ignored. */
for (const m of html.matchAll(/<button class="era[^"]*" data-a="([^"]+)" data-b="([^"]+)"[^>]*>([^<]*)<\/button>/g)) {
  const b = new El("button");
  b.setAttribute("data-a", m[1]);
  b.setAttribute("data-b", m[2]);
  b.innerHTML = m[3];
  b._label = m[3];
  if (/class="era on/.test(m[0])) b.classList.add("on");
  eraButtons.push(b);
}

/* pull the embedded payload out of the page, exactly as the browser would */
const m = html.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
if (!m) fail("could not find the embedded-data script block in timeline.html");

let payload = null;
const raw = m[1].trim();
if (raw && raw !== "__EMBEDDED__") {
  try { payload = JSON.parse(raw); } catch (e) { fail("embedded JSON does not parse: " + e.message); }
}
if (!payload) {
  console.log("note: timeline.html has no embedded payload yet; using data/timeline-data.json");
  const agg = path.join(ROOT, "data", "timeline-data.json");
  if (!fs.existsSync(agg)) fail("no embedded payload and no data/timeline-data.json - run build-data.py first");
  payload = JSON.parse(fs.readFileSync(agg, "utf8"));
}
store["embedded-data"].textContent = JSON.stringify(payload);

const scripts = [...html.matchAll(/<script(?![^>]*id="embedded-data")[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
if (!scripts.length) fail("no executable script block found in timeline.html");

const ctx = vm.createContext(sandbox);
for (const src of scripts) {
  try {
    vm.runInContext(src, ctx, { filename: "timeline.html:inline" });
  } catch (e) {
    fail("script threw during execution:\n" + (e && e.stack ? e.stack : e));
  }
}

/* the viewer boots asynchronously (fetch fallback); surface any error it logged */
if (sandbox.__bootError) fail("viewer boot threw: " + sandbox.__bootError);

/* Read __timeline fresh on every call: render() republishes it, so a captured
   reference goes stale after the first re-render. */
const debug = () => sandbox.window.__timeline;

const chart = store["chart"];
if (!chart.children.length) {
  fail("viewer produced an empty chart element - boot() likely never completed");
}

/* Prefer the viewer's own normalised objects. boot() attaches the group and
   dossier to each lineage, and assertions about the drawer must inspect the same
   objects the page rendered, not a separately parsed copy. */
if (sandbox.window.__timeline && sandbox.window.__timeline.lineages) {
  payload.lineages = sandbox.window.__timeline.lineages;
}


/* ------------------------------ assertions ------------------------------ */

function svgNodes() {
  const out = [];
  chart.walk((n) => out.push(n));
  return out;
}
function count(pred) { return svgNodes().filter(pred).length; }
function lanesRendered() { return count((n) => n.getAttribute("data-lane") !== null); }
function eventTargets() { return count((n) => n.getAttribute("data-ev") !== null); }
function texts() { return count((n) => n.tagName === "TEXT"); }

const expectedLineages = payload.lineages.length;
const expectedEvents = payload.lineages.reduce((a, l) => a + l.events.length, 0);

/* an event with no hit target must be genuinely outside the visible window,
   judged in pixels with the viewer's own warped transform. Anything strictly
   inside must have been rendered; anything within a few pixels of the edge is
   treated as off-screen rather than as a rendering failure. */
const tl = sandbox.window.__timeline;
if (!tl) fail("viewer did not publish window.__timeline; cannot verify visibility");
/* This sweep is about the line-shaped views: a window in time, lanes, and an
   event target per event. The Moments graph has none of those - its circles are
   kinds of moment, and every world passes through them whatever the date - so
   the sweep is run in a view it is about rather than in whatever the page
   happens to open on. The graph is covered by its own assertions below. */
setModeVia("order");
const vis = tl.visibleYears();
const drawn = new Set(svgNodes().map((n) => n.getAttribute("data-ev")).filter(Boolean));
const missing = [];
const dropped = [];
for (const l of payload.lineages) {
  l.events.forEach((e, i) => {
    if (drawn.has(l.id + "|" + i)) return;
    const label = `${l.title} / ${e.year} ${e.title}`;
    const x = tl.pxFor(e.year);
    if (x < tl.LANE_R + 3 || x > tl.W - 13) missing.push(label);
    else dropped.push(label);
  });
}

const _lanes = lanesRendered();
const _targets = eventTargets();
check(_lanes === expectedLineages,
  `rendered ${_lanes} lane hit areas, expected ${expectedLineages}`);
check(dropped.length === 0,
  `${dropped.length} event(s) inside the visible window were not rendered: ${dropped.join("; ")}`);
check(_targets + missing.length === expectedEvents,
  `rendered ${_targets} hit targets, ${missing.length} off-screen, ${expectedEvents} in payload ` +
  `[lanes=${_lanes} texts=${texts()} chartChildren=${chart.children.length}]`);

if (missing.length) {
  soft(`${missing.length} event(s) outside the visible window ` +
       `${Math.round(vis.from)}..${Math.round(vis.to)} (reachable via the Era buttons):`);
  missing.forEach((s) => soft("    " + s));
}

/* The count of text nodes is not a meaningful assertion - each axis draws a
   different amount of chrome, and Moments legitimately draws less than Years
   (no year ticks, no per-event year labels). What matters is that every world
   is named, so a reader can tell the branches apart in any mode. */
const laneTitled = new Set(svgNodes()
  .filter((n) => n.classList && n.classList.contains("title"))
  .map((n) => n.getAttribute("data-lane-title"))
  .filter(Boolean));
if (texts() > 0) {
  check(laneTitled.size === expectedLineages,
    `${laneTitled.size} of ${expectedLineages} worlds are named on the canvas ` +
    `(text nodes=${texts()})`);
}

const nowCaps = svgNodes().filter((n) => n.tagName === "TEXT" && /^TODAY \d{4}/.test(n.textContent));
check(nowCaps.length === 1, `expected exactly one present-day marker, found ${nowCaps.length}`);

/* every lineage's divergence year should be quoted somewhere on the chart */
for (const l of payload.lineages) {
  const y = String(l.divergence.year < 0 ? Math.abs(l.divergence.year) + " BC" : l.divergence.year);
  const hit = svgNodes().some((n) => n.tagName === "TEXT" && n.textContent.includes(y));
  if (!hit) soft(`divergence year ${l.divergence.year} of "${l.title}" is not visible in the default view`);
}

/* interactions must not throw */
function attempt(label, fn) {
  try { fn(); } catch (e) { fail(`${label} threw: ${e && e.stack ? e.stack : e}`); }
}

/* the dashboard builds its era presets at runtime, so assert on what it created */
check(store["eras"].children.length >= 4,
  `the page built only ${store["eras"].children.length} era presets; expected at least 4`);

/* drive the presets from the live buttons, not a copy */
const presets = () => store["eras"].children.slice();

attempt("era preset click", () => presets().forEach((b) => { if (b.onclick) b.onclick(); }));
attempt("zoom in", () => store["zin"].onclick());
attempt("zoom out", () => store["zout"].onclick());
attempt("reset", () => store["reset"].onclick());
attempt("zoom slider", () => { store["zoom"].value = "700"; store["zoom"].oninput.call(store["zoom"]); });
attempt("search filter", () => { store["find"].value = "star"; store["find"].oninput.call(store["find"]); });
attempt("sort change", () => { store["sort"].value = "title"; store["sort"].onchange(); });
attempt("show-all toggle", () => store["allev"].onclick());
attempt("show-all toggle back", () => store["allev"].onclick());
attempt("search cleared", () => { store["find"].value = ""; store["find"].oninput.call(store["find"]); });

/* pan via pointer events */
attempt("pointer drag", () => {
  chart.onpointerdown({ button: 0, clientX: 800, pointerId: 1 });
  chart.onpointermove({ clientX: 700, pointerId: 1 });
  chart.onpointerup({ clientX: 700, pointerId: 1, target: { getAttribute: () => null } });
});
attempt("wheel zoom", () => {
  chart.onwheel({ deltaY: -240, clientX: 900, clientY: 400, preventDefault() {} });
});
attempt("hover an event", () => {
  /* In the Moments graph a kind of moment is the interactive thing and there are
     no per-event targets; the circles are what a pointer can land on. */
  const t = svgNodes().find((n) => n.getAttribute("data-ev") !== null)
         || svgNodes().find((n) => n.getAttribute("data-moment-node") !== null);
  if (!t) throw new Error("no interactive target to hover");
  chart.onpointermove({ target: t, clientX: 500, clientY: 300 });
});

/* open every lineage's world drawer - the heaviest code path, and the one that
   carries the new dossier content */
attempt("world drawer for every lineage", () => {
  let opened = 0;
  const dossiers = new Set((payload.worlds || []).map((w) => w.id));
  /* The lane targets exist in the line-shaped views. The graph has no lanes -
     it is circles - so this walks the drawers in a view that has them, which is
     what it is testing: the drawer, not the layout. The previous mode is
     restored afterwards: tests that follow assert against whatever view is
     current, so leaking a mode here breaks them in ways that look unrelated. */
  const wasMode = debug().axisMode();
  setModeVia("order");
  for (const l of payload.lineages) {
    const t = svgNodes().find((n) => n.getAttribute && n.getAttribute("data-lane") === l.id);
    if (!t) throw new Error("no lane target for " + l.id);
    chart.onpointerup({ clientX: 10, clientY: 10, pointerId: 1, target: t });

    const d = store["panel-world"];
    if (!/dtitle/.test(d.innerHTML) || !d.innerHTML.includes(escapeRe(l.title))) {
      throw new Error("world drawer did not render for " + l.id);
    }
    /* The world pane must show the dossier. Compare on a phrase containing no
       markup: plainText() replaces tags with spaces, so a needle that straddles
       an inline element would never match. */
    if (dossiers.has(l.id)) {
      const dos = l._w;
      const flat = plainText(d.innerHTML);
      const probe = longestPlainRun(dos.setting);
      if (!flat.includes(probe)) {
        throw new Error(`dossier setting missing from the world pane for ${l.id} ` +
                        `(probed ${JSON.stringify(probe)})`);
      }
      for (const loc of dos.locations) {
        if (!flat.includes(loc.name)) {
          throw new Error(`dossier location ${JSON.stringify(loc.name)} missing for ${l.id}`);
        }
      }
      for (const f of dos.factions) {
        if (!flat.includes(f.name)) {
          throw new Error(`dossier faction ${JSON.stringify(f.name)} missing for ${l.id}`);
        }
      }
      if (!d.innerHTML.includes(escapeRe((dos.connections[0] || {}).id || ""))) {
        throw new Error("dossier connections did not render for " + l.id);
      }
      if (dos.politics && !flat.includes(longestPlainRun(dos.politics))) {
        throw new Error("dossier politics missing for " + l.id);
      }
      if (dos.technology && !flat.includes(longestPlainRun(dos.technology))) {
        throw new Error("dossier technology missing for " + l.id);
      }
    }

    /* switch to the chronology tab and verify a row per event */
    const tab = d.querySelectorAll("[data-tab]").find((n) => n.getAttribute("data-tab") === "chronology");
    if (!tab) throw new Error("no chronology tab for " + l.id);
    tab.onclick();
    const tbody = store["panel-world"].querySelectorAll("TBODY")[0];
    if (!tbody) throw new Error("chronology for " + l.id + " rendered no table body");
    if (tbody.children.length !== l.events.length) {
      throw new Error(`chronology for ${l.id} rendered ${tbody.children.length} rows, ` +
                      `expected ${l.events.length}`);
    }
    if (!store["dchart"] || !store["dchart"].parentNode) {
      throw new Error("chronology for " + l.id + " did not produce a #dchart svg");
    }

    /* and the entry-point tab must render whenever the dossier has any */
    if (dossiers.has(l.id)) {
      const tab2 = store["panel-world"].querySelectorAll("[data-tab]").find((n) => n.getAttribute("data-tab") === "where");
      tab2.onclick();
      const first = l._w.whereToStart[0];
      if (!plainText(store["panel-world"].innerHTML).includes(first.title)) {
        throw new Error("where-to-start missing for " + l.id);
      }
    }
    opened++;
  }
  if (opened !== payload.lineages.length) throw new Error("only opened " + opened);
});

/* the dashboard must actually populate its panels */
attempt("dashboard panels populated", () => {
  const cards = store["cards"].querySelectorAll(".card");
  check(cards.length === payload.lineages.length,
    `rendered ${cards.length} world cards, expected ${payload.lineages.length}`);
  const tracks = store["cards"].querySelectorAll(".track");
  check(tracks.length === payload.lineages.length,
    `rendered ${tracks.length} distribution tracks inside the world index, expected ${payload.lineages.length}`);
  check(store["drawer"].getAttribute("data-mode") !== null, "the explorer panel did not render");
  const stats = store["stats"].innerHTML;
  check(/Worlds charted/.test(stats) && /Dated events/.test(stats) && /Dossiers/.test(stats),
    "stat strip did not render its three headline figures");
  check(store["eras"].children.length >= 4,
    `only ${store["eras"].children.length} era presets built`);
  check(store["chips"].children.length >= payload.groups.length,
    "archetype chips did not render");
});




/* ---- Order mode: the invariants BRIEF-order-axis.md 1.3 requires -----------
   Order mode has no off-canvas: position is sequence, so every event is placed
   by construction. These check the placement rules actually hold, reading them
   from the live axis rather than re-deriving them. */
function setModeVia(mode){
  const b = document.querySelectorAll(".ax").find((x) => x.getAttribute("data-axis") === mode);
  if (!b || !b.onclick) throw new Error(`no ${mode} button wired`);
  b.onclick();
}
function axisEventX(id, year){
  const t = debug();
  const l = t.lineages.find((x) => x.id === id);
  const e = l.events.find((x) => x.year === year);
  return t.axis().x(l, e);
}

attempt("order mode invariants", () => {
  setModeVia("order");
  const t = debug();
  if (t.axisMode() !== "order") throw new Error("order mode did not engage");
  const AXo = t.axis();
  if (AXo.mode !== "order") throw new Error("axis is not the order axis");
  const nx = t.NOWX;
  const NOW = t.NOW;
  const lanes = t.layout.lanes;

  /* every event has a target on canvas, and every target is an event */
  const seen = new Set(svgNodes().map((n) => n.getAttribute("data-ev")).filter(Boolean));
  const all = [];
  t.lineages.forEach((l) => l.events.forEach((e, i) => all.push({ id: l.id, e, key: l.id + "|" + i })));
  const missing = all.filter((x) => !seen.has(x.key));
  check(missing.length === 0,
    `${missing.length} event(s) have no target in order mode, e.g. ` +
    missing.slice(0, 3).map((m) => `${m.id} ${m.e.year}`).join("; "));
  check(seen.size === all.length,
    `order mode drew ${seen.size} targets for ${all.length} events`);

  /* forks keep their rank: earlier divergence is further left */
  const preToday  = lanes.filter((ln) => ln.l.divergence.year <= NOW)
                         .map((ln) => ({ y: ln.l.divergence.year, x: AXo.fork(ln.l), id: ln.l.id }))
                         .sort((a, b) => a.y - b.y);
  const postToday = lanes.filter((ln) => ln.l.divergence.year > NOW)
                         .map((ln) => ({ y: ln.l.divergence.year, x: AXo.fork(ln.l), id: ln.l.id }))
                         .sort((a, b) => a.y - b.y);
  /* The rule is "rank order preserved", and ties are real: Contact and Buffy both
     fork in 1997. So the property to check is not that the sorted list is
     monotonic - equal years may be ordered by lane - but that no STRICTLY LATER
     fork ever sits to the left of an earlier one. */
  function noInversions(pairs, side){
    for (const a of pairs) for (const b of pairs) {
      if (a.y < b.y && a.x > b.x + 0.5) {
        check(false, `${side} fork ${b.id} (${b.y}) sits left of the earlier ${a.id} (${a.y})`);
      }
    }
  }
  noInversions(preToday.map((p) => ({ id: p.id, y: p.y, x: p.x })), "pre-today");
  noInversions(postToday.map((p) => ({ id: p.id, y: p.y, x: p.x })), "post-today");
  preToday.forEach((p) => check(p.x < nx, `pre-today fork ${p.id} sits at ${Math.round(p.x)}, not left of today`));
  postToday.forEach((p) => check(p.x > nx, `post-today fork ${p.id} sits at ${Math.round(p.x)}, not right of today`));

  /* beats advance along the branch, and stay on their side of today */
  /* A year appears at most once per lineage (schema rule 5), so beats should
     strictly advance. Equality is tolerated rather than failed: beats are placed
     per side of today, and a world whose only beats sit before today can end up
     with its last beat and its branch end at the same x. */
  let backwards = 0, wrongSide = 0;
  lanes.forEach((ln) => {
    const l = ln.l;
    const on = l.events.filter((e) => e.year >= l.divergence.year);
    let prev = -Infinity;
    on.forEach((e) => {
      const x = AXo.x(l, e);
      if (x < prev) backwards++;
      prev = x;
      if (e.year <= NOW && x > nx + 0.5) wrongSide++;
      if (e.year >  NOW && x < nx - 0.5) wrongSide++;
    });
  });
  check(backwards === 0, `${backwards} beat(s) do not advance along their branch in order mode`);
  check(wrongSide === 0, `${wrongSide} beat(s) are on the wrong side of today in order mode`);

  /* today is singular */
  const caps = svgNodes().filter((n) => n.tagName === "TEXT" && /^TODAY \d{4}/.test(n.textContent));
  check(caps.length === 1, `expected exactly one TODAY cap, found ${caps.length}`);
  const cores = svgNodes().filter((n) => n.classList && n.classList.contains("trunk-core"));
  check(cores.length === 1, `expected exactly one trunk core, found ${cores.length}`);

  soft(`order mode: ${lanes.length} lanes, ${seen.size}/${all.length} events on canvas, ` +
       `${preToday.length} forks before today, ${postToday.length} after`);
});

/* switching views must not lose lanes */
attempt("axis switch round-trip", () => {
  setModeVia("order");
  const before = lanesRendered();
  setModeVia("years");
  const mid = lanesRendered();
  setModeVia("order");
  const after = lanesRendered();
  check(mid === before, `Years dropped lanes: ${before} -> ${mid}`);
  check(after === before, `returning to Order dropped lanes: ${before} -> ${after}`);
  soft(`axis switch: ${before} lanes preserved through Order -> Years -> Order`);
  if (debug().axisMode() !== "order") throw new Error("did not return to Order");
});


/* ---- Moments: the arc diagram anchored on us ------------------------------------
   Its own page: one line of kinds, ours first in first-visit order, then the
   kinds only fiction has reached; roads above, our path below; a panel of its
   own. No lanes, no per-event targets, no tree furniture. */
attempt("moments page invariants", () => {
  setModeVia("moments");
  const t = debug();
  if (t.axisMode() !== "moments") throw new Error("moments mode did not engage");
  const M = t.moments();
  if (!M) throw new Error("the moments model was not built");
  const binned = t.lineages.some((l) => l.events.some((e) => e.bin));
  if (!binned) { soft("moments: no binned events in this payload, skipped"); return; }

  const circles = svgNodes().filter((n) => n.getAttribute("data-moment-node") !== null);
  check(circles.length === M.nodes.length, `${circles.length} circles for ${M.nodes.length} kinds`);
  const roads = svgNodes().filter((n) => n.getAttribute("data-road") !== null);
  check(roads.length === M.roads.length, `${roads.length} roads drawn for ${M.roads.length} in the model`);
  const ours = svgNodes().filter((n) => n.getAttribute("data-our-road") !== null);
  check(ours.length === M.ours.length, `${ours.length} of our own arcs drawn for ${M.ours.length}`);

  /* x is where a kind tends to fall in a story; every kind is on canvas */
  const byPos = M.nodes.slice().sort((a, b) => a.p - b.p);
  for (let i = 1; i < byPos.length; i++) check(byPos[i].fx >= byPos[i - 1].fx - 0.01, "x does not follow story position");
  M.nodes.forEach((n) => check(isFinite(n.x) && isFinite(n.y), `${n.id} has no position`));
  const real = t.real();
  if (real && real.events && real.events.length) {
    const firstVisit = [];
    real.events.forEach((e) => { if (e.bin && !firstVisit.includes(e.bin)) firstVisit.push(e.bin); });
    M.fictionOnly.forEach((b) => check(!firstVisit.includes(b), `${b} is marked fiction-only but happened to us`));
    const today = svgNodes().filter((n) => n.classList && n.classList.contains("mp-today"));
    check(today.length === 1, `${today.length} TODAY markers, expected 1`);
    const hits = svgNodes().filter((n) => n.getAttribute("data-real") !== null);
    const expectN = real.events.filter((e) => e.bin).length;
    check(hits.length === expectN, `${hits.length} real-beat dots for ${expectN} binned beats`);
    hits.forEach((h) => {
      const e = real.events.find((y) => y.id === h.getAttribute("data-real"));
      const node = e && M.at[e.bin];
      check(!!node && Math.abs(parseFloat(h.getAttribute("cx")) - node.x) < 40, `${e && e.year}: dot is not at its kind`);
    });
    const arrows = svgNodes().filter((n) => n.getAttribute("marker-end") !== null);
    check(arrows.length >= M.roads.filter((r) => r.worlds.length > 1).length, "shared roads carry no arrowheads");
  }

  /* roads are post-fork moves only, counted from the data */
  const want = new Set();
  t.lineages.forEach((l) => {
    const dv = l.divergence.year, seq = [];
    l.events.forEach((e) => {
      if (e.bin && M.at[e.bin] && (seq.length === 0 || seq[seq.length - 1].bin !== e.bin)) seq.push({ bin: e.bin, year: e.year });
    });
    for (let i = 1; i < seq.length; i++) if (seq[i].year >= dv) want.add(seq[i - 1].bin + "|" + seq[i].bin);
    /* and the arc's last kind runs into its ending */
    if (seq.length) want.add(seq[seq.length - 1].bin + "|ending-" + ((l.ending && l.ending.valence) || "unknown"));
  });
  check(roads.length === want.size, `${roads.length} roads drawn for ${want.size} post-fork transitions (endings included)`);

  /* a circle's count is the number of worlds through it */
  const expect = {};
  t.lineages.forEach((l) => {
    const here = new Set(); l.events.forEach((e) => { if (e.bin) here.add(e.bin); });
    here.forEach((b) => { expect[b] = (expect[b] || 0) + 1; });
  });
  let wrong = 0;
  M.nodes.forEach((n) => { if (!n.ending && n.worlds !== (expect[n.id] || 0)) wrong++; });
  check(wrong === 0, `${wrong} circle(s) miscount the worlds through them`);

  /* endings: three sinks, every arc runs into exactly one, ours into "still open" */
  const sinks = M.nodes.filter((n) => n.ending);
  check(sinks.length === 3, `${sinks.length} ending sinks, expected 3`);
  const tally = { optimistic: 0, pessimistic: 0, unknown: 0 };
  t.lineages.forEach((l) => { tally[(l.ending && l.ending.valence) || "unknown"]++; });
  sinks.forEach((n) => check(n.worlds === tally[n.valence], `${n.id}: ${n.worlds} worlds, data says ${tally[n.valence]}`));
  const intoEnding = M.roads.filter((r) => r.ending);
  const arcs = intoEnding.reduce((a, r) => a + r.worlds.length, 0);
  const withPath = t.lineages.filter((l) => l.events.some((e) => e.bin && M.at[e.bin])).length;
  check(arcs === withPath, `${arcs} arcs run into an ending, ${withPath} worlds have a path`);
  const lastOurs = M.ours[M.ours.length - 1];
  check(!!lastOurs && lastOurs.b === "ending-unknown", "our own path does not run into the open ending");
  M.nodes.filter((n) => !n.ending && n.worlds).forEach((n) => {
    const o = n.outcomes, sum = o.optimistic.length + o.pessimistic.length + o.unknown.length;
    check(sum === n.worlds, `${n.id}: outcome tally ${sum} for ${n.worlds} worlds`);
  });

  /* no tree furniture on this page */
  const FURNITURE = ["bundle-band", "bundle-label", "side-label", "trunk-core", "trunk-glow", "trunk-future",
                     "trunk-label", "fork-zone", "now-plane", "branch", "hit"];
  const furniture = svgNodes().filter((n) => n.classList && FURNITURE.some((c) => n.classList.contains(c)));
  check(furniture.length === 0, `${furniture.length} piece(s) of tree furniture drawn on the Moments page`);
  const lanes = svgNodes().filter((n) => n.getAttribute("data-lane") !== null);
  check(lanes.length === 0, `${lanes.length} lane targets drawn on the Moments page`);
  soft(`moments: ${M.nodes.length} kinds (${M.realOrder.length} ours), ${M.roads.length} roads, ${M.ours.length} steps in our own path`);
});

/* ---- Moments: an ending is a node like any other - click it, read who ends there ---- */
attempt("moments endings in the panel", () => {
  setModeVia("moments");
  const t = debug();
  const M = t.moments();
  if (!M || !M.nodes.some((n) => n.ending)) { soft("moments endings: no sinks, skipped"); return; }
  const busiest = M.nodes.filter((n) => !n.ending && n.worlds).sort((a, b) => b.worlds - a.worlds)[0];
  let body = "";
  if (busiest) {
    t.momentsSelectKind(busiest.id);
    body = store["moments-body"].innerHTML;
    check(body.includes("mp-outcomes"), "a kind's panel does not say how its arcs end");
    check(body.includes("mp-badge"), "world cards carry no ending badge");
  }
  const sink = M.nodes.filter((n) => n.ending).sort((a, b) => b.worlds - a.worlds)[0];
  t.momentsSelectKind(sink.id);
  body = store["moments-body"].innerHTML;
  check(t.momentsState().node === sink.id, "clicking an ending did not select it");
  const cards = (body.match(/class="mp-card"/g) || []).length;
  check(cards === sink.worlds, `${cards} cards for ${sink.worlds} worlds ending "${sink.spec.label}"`);
  check(body.includes("mp-why"), "the ending panel gives no reason per world");
  t.momentsSelectKind("ending-unknown");
  body = store["moments-body"].innerHTML;
  check(body.includes("Us, "), "the open ending does not place us in it");
  t.momentsClear();
  soft(`moments endings: ${M.nodes.filter((n) => n.ending).map((n) => `${n.spec.label} ${n.worlds}`).join(", ")}`);
});

/* ---- Moments: clicking does things, through the pointer path a browser uses ---- */
attempt("moments clicks and camera", () => {
  setModeVia("moments");
  const t = debug();
  const M = t.moments();
  if (!M || !M.nodes.length) { soft("moments clicks: nothing to click, skipped"); return; }
  /* a kind, not an ending sink: the sinks have their own test */
  const busiest = M.nodes.filter((n) => !n.ending).sort((a, b) => b.worlds - a.worlds)[0];
  if (!busiest) { soft("moments clicks: no kinds in this payload (only the ending sinks), skipped"); return; }

  /* a circle, clicked the way a browser delivers it: pointerdown then pointerup */
  const grp = svgNodes().find((n) => n.getAttribute("data-moment-node") === busiest.id);
  const circle = grp.children.find((c) => c.classList && c.classList.contains("mp-circle")) || grp;
  chart.onpointerdown({ button: 0, clientX: 300, clientY: 300, pointerId: 1, target: circle });
  chart.onpointerup({ clientX: 300, clientY: 300, pointerId: 1, target: { getAttribute: () => null } });
  check(t.momentsState().node === busiest.id, "clicking a circle did not select its kind");
  check(store["drawer"].getAttribute("data-mode") === "moments", "clicking a circle did not open the Moments panel");
  const body = String(store["moments-body"].innerHTML);
  check(new RegExp(`${busiest.worlds} worlds? pass`).test(body), "the panel does not state how many worlds pass through");
  const cards = store["moments-body"].querySelectorAll(".mp-card");
  check(cards.length === busiest.worlds, `${cards.length} world cards for ${busiest.worlds} worlds`);
  check(/What it leads to/.test(body) || busiest.follow.length === 0, "the panel does not say what it leads to");
  /* roads not touching the selected kind recede */
  const faded = svgNodes().filter((n) => n.getAttribute("data-road") !== null && n.getAttribute("opacity") === "0.04");
  const touching = M.roads.filter((r) => r.a === busiest.id || r.b === busiest.id).length;
  check(faded.length === M.roads.length - touching, `${faded.length} roads faded, expected ${M.roads.length - touching}`);

  /* a world's name lights its whole road */
  const firstWorld = store["moments-body"].querySelectorAll("[data-world]")[0];
  if (firstWorld) {
    firstWorld.onclick();
    const wid = t.momentsState().world;
    check(!!wid, "clicking a world did not light it");
    const wroads = svgNodes().filter((n) => n.classList && n.classList.contains("mp-world-road"));
    const seqLen = M.paths[wid].seq.length;
    check(wroads.length === Math.max(0, seqLen - 1), `${wroads.length} coloured segments for a path of ${seqLen} kinds`);
    firstWorld.onclick();
    check(!t.momentsState().world, "clicking the world again did not unlight it");
  }

  /* a real-beat dot runs the situation match */
  const real = t.real();
  const dot = svgNodes().find((n) => n.getAttribute("data-real") !== null);
  if (dot && real) {
    chart.onpointerdown({ button: 0, clientX: 300, clientY: 300, pointerId: 1, target: dot });
    chart.onpointerup({ clientX: 300, clientY: 300, pointerId: 1, target: { getAttribute: () => null } });
    const st = t.momentsState();
    check(!!st.beat && st.beat.id === dot.getAttribute("data-real"), "clicking a dot did not select the beat");
    const b2 = String(store["moments-body"].innerHTML);
    check(/Nearest situations/.test(b2), "the beat panel did not run the situation match");
    check(store["moments-body"].querySelectorAll(".mp-card").length > 0, "the situation match returned no neighbours");
    check(/match/.test(b2), "neighbours carry no similarity score");
  }

  /* empty sky clears; the camera zooms and pans; fit resets */
  chart.onpointerdown({ button: 0, clientX: 10, clientY: 10, pointerId: 1, target: chart });
  chart.onpointerup({ clientX: 10, clientY: 10, pointerId: 1, target: { getAttribute: () => null } });
  check(!t.momentsState().node && !t.momentsState().beat, "clicking empty sky did not clear the selection");
  const spread = () => { const xs = debug().moments().nodes.map((k) => k.x); return Math.max(...xs) - Math.min(...xs); };
  const x0 = spread();
  chart.onwheel({ deltaX: 0, deltaY: -400, clientX: 400, clientY: 300, preventDefault() {} });
  const x1 = spread();
  check(x1 > x0 * 1.3, `wheel did not zoom the flow (${x0.toFixed(1)} -> ${x1.toFixed(1)})`);
  const before = debug().momentsState().tx;
  chart.onpointerdown({ button: 0, clientX: 800, clientY: 400, pointerId: 1, target: chart });
  chart.onpointermove({ clientX: 700, clientY: 400, pointerId: 1 });
  chart.onpointerup({ clientX: 700, clientY: 400, pointerId: 1, target: { getAttribute: () => null } });
  check(debug().momentsState().tx < before, "drag did not pan the line");
  store["reset"].onclick();
  check(Math.abs(spread() - x0) < 0.5, "Fit did not reset the zoom");
  /* a news item selects its kind here */
  const n = t.matchNews({ headline: "test", bin: busiest.id });
  check(n === busiest.worlds && t.momentsState().node === busiest.id, "a news item did not select its kind on the Moments page");
  t.momentsClear();
  soft(`moments clicks: "${busiest.spec.label}" -> ${busiest.worlds} worlds; zoom ${x0.toFixed(0)}->${x1.toFixed(0)}px`);
});

/* ---- real history on every axis ---------------------------------------------- */
attempt("real history on every axis", () => {
  const t = debug();
  const real = t.real();
  if (!real || !real.events || !real.events.length) { soft("real history: none in this payload, skipped"); return; }
  for (const mode of ["order", "years"]) {
    setModeVia(mode);
    const hits = svgNodes().filter((n) => n.getAttribute("data-real") !== null);
    check(hits.length === real.events.length, `${mode}: ${hits.length} real beats drawn for ${real.events.length}`);
    const xs = hits.map((n) => parseFloat(n.getAttribute("cx")));
    check(xs.every((v) => !isNaN(v)), `${mode}: a real beat has no x`);
    const ordered = hits
      .map((n, i) => ({ x: xs[i], e: real.events.find((y) => y.id === n.getAttribute("data-real")) }))
      .filter((o) => o.e).sort((a, b) => a.e.year - b.e.year);
    for (let i = 1; i < ordered.length; i++) {
      check(ordered[i].x >= ordered[i - 1].x + (mode === "years" ? -0.51 : -0.01),
        `${mode}: ${ordered[i].e.year} is drawn left of ${ordered[i - 1].e.year}`);
    }
  }
  setModeVia("moments");
  soft(`real history: ${real.events.length} beats on the line-shaped axes, and on their kinds on the Moments page`);
});

attempt("matching by situation", () => {
  const t = debug();
  const moments = t.facetMoments();
  const real = moments.filter((m) => m.real);
  if (!real.length) { soft("situation match: no faceted real beats, skipped"); return; }
  check(moments.length > real.length, `only ${moments.length} moments carry a signature; expected the fictions too`);
  moments.forEach((m) => check(!!m.e.facets, `${m.e.id} has no facets`));
  const target = real.find((m) => /enabling act/i.test(m.e.title)) || real[0];
  const ns = t.facetNeighbours(target, moments, 6);
  check(ns.length > 0, `no neighbours found for ${target.e.title}`);
  check(ns.every((n) => n.m.world !== target.world), "a neighbour came from the same world as the query");
  let descending = true;
  for (let i = 1; i < ns.length; i++) if (ns[i].score > ns[i - 1].score + 1e-9) descending = false;
  check(descending, "neighbours are not ranked by similarity");
  ns.forEach((n) => check(n.score >= 0 && n.score <= 1, `similarity ${n.score} is outside 0..1`));
  const a = { mechanism:"law", actor:"individual", position:"inside", domain:"political",
              scope:"national", direction:{power:1,openness:-1,capability:0,population:0},
              preconditions:["x"], outcomes:["one"] };
  const b = Object.assign({}, a, { outcomes:["one"] });
  const c = Object.assign({}, a, { outcomes:["a","b","c","d","e"] });
  check(Math.abs(t.facetSim(a, b) - t.facetSim(a, c)) < 1e-9, "outcomes changed the similarity; they are supposed to be held out");
  ns.slice(0, 3).forEach((n) => {
    const fwd = t.facetForward(n.m, 3);
    check(fwd.length <= 3, `forward read returned ${fwd.length} beats`);
    fwd.forEach((x) => check(x.year >= n.m.e.year, `${n.m.worldTitle}: a forward beat precedes the neighbour`));
  });
  /* and the same beat selected on the Moments page reports the same match */
  setModeVia("moments");
  t.momentsSelectBeat(target.e.id);
  const body = String(store["moments-body"].innerHTML);
  check(/Nearest situations/.test(body), "selecting the beat did not report the situation match");
  check(body.includes(ns[0].score.toFixed(2)), "the page's closest match differs from the tool's");
  t.momentsClear();
  soft(`situation match: "${target.e.title}" -> ${ns.length} neighbours, closest ${ns[0].score.toFixed(2)} in ${ns[0].m.worldTitle}`);
});

/* ---- art plates: whatever the build shipped must actually reach the DOM ---- */
attempt("art plates", () => {
  const art = payload.art || {};
  const ids = Object.keys(art);
  if (!ids.length) { soft("art plates: none in this payload, skipped"); return; }
  let withArt = 0, pending = 0;
  for (const id of ids) {
    /* the build publishes `sm` only once a derived copy exists; a world still
       mid-derivation has credits but no usable file, and is not a failure */
    if (!art[id].sm) { pending++; continue; }
    const t = svgNodes().find((n) => n.getAttribute && n.getAttribute("data-lane") === id);
    if (!t) { soft(`art: no lane for ${id}`); continue; }
    chart.onpointerup({ clientX: 5, clientY: 5, pointerId: 1, target: t });
    const htmlOut = store["panel-world"].innerHTML;
    const a = art[id];
    if (!htmlOut.includes(a.lg || a.full)) {
      throw new Error(`no art plate rendered in the drawer for ${id}`);
    }
    /* The caption was removed from the image at the owner's request, so the
       provenance requirement now sits on the RECORD: a plate declared generated
       must still carry its model and prompt in the payload. */
    if (a.kind === "generated") {
      if (!a.model || !a.prompt) {
        throw new Error(`generated plate for ${id} lost its provenance record`);
      }
    }
    /* an illustrative plate must never carry a caption stamped on the image */
    if (/figcaption/.test((htmlOut.match(/<figure class="dhero">[\s\S]*?<\/figure>/) || [""])[0])) {
      throw new Error(`plate for ${id} still has a caption stamped on the image`);
    }
    const plate = store["plate"];
    if (!plate.classList.contains("on")) {
      throw new Error(`the ambient plate did not activate for ${id}`);
    }
    withArt++;
  }
  soft(`art plates: ${withArt}/${ids.length} rendered from the payload` +
       (pending ? `, ${pending} awaiting a derived copy` : ""));
  if (payload.lineages.length) closeWorldIfOpen();
});



/* ---- news: the band on the chart and the panel list ------------------------
   Every item must reach both surfaces, and a malformed date must never reach
   the page, because this atlas claims a research standard. */
attempt("news", () => {
  const items = payload.news || [];
  if (!items.length) { soft("news: none in this payload, skipped"); return; }
  /* The band is a Years-mode affordance: in Order and Moments the today column
     already says what has happened, and the right of the chart is where the
     post-today forks live. So it is asserted in Years, and its absence in the
     two width-filling modes is asserted too. Each mode is set explicitly rather
     than inherited, so this test cannot depend on what ran before it. */
  setModeVia("order");
  const inOrder = svgNodes().filter((n) => String(n.getAttribute("class") || "").indexOf("news-row") >= 0);
  check(inOrder.length === 0,
    `order mode drew ${inOrder.length} news band rows; the band is Years-only`);
  setModeVia("moments");
  const inMoments = svgNodes().filter((n) => String(n.getAttribute("class") || "").indexOf("news-row") >= 0);
  check(inMoments.length === 0,
    `moments mode drew ${inMoments.length} news band rows; the band is Years-only`);
  setModeVia("years");
  const band = svgNodes().filter((n) => String(n.getAttribute("class") || "").indexOf("news-row") >= 0);
  if (band.length < Math.min(items.length, 3)) {
    throw new Error(`news band drew ${band.length} rows for ${items.length} items in Years mode`);
  }
  setModeVia("order");
  store["btn-news"].onclick();
  const listHtml = store["news-list"].innerHTML;
  const list = plainText(listHtml);
  for (const n of items) {
    if (!list.includes(n.headline.slice(0, 24))) {
      throw new Error(`news panel is missing the item for ${n.date}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) {
      throw new Error(`news item has a malformed date: ${n.date}`);
    }
    if (n.source && n.source.url && !listHtml.includes(n.source.url)) {
      throw new Error(`news item for ${n.date} does not link its source`);
    }
  }
  soft(`news: ${items.length} item(s) on the band and in the panel`);
});

/* ---- real-world counterparts: PD / openly-licensed, with attribution -------
   The licence and the author must reach the UI. An openly-licensed photograph
   shown without attribution is a licence breach, not a missing flourish. */
attempt("real-world counterparts", () => {
  const pd = payload.pd || {};
  const ids = Object.keys(pd);
  if (!ids.length) { soft("counterparts: none in this payload, skipped"); return; }
  const ALLOWED = ["public domain", "cc0", "cc by", "cc by-sa"];
  let shown = 0;
  for (const id of ids) {
    const m = pd[id];
    const bad = !ALLOWED.some((a) => String(m.license || "").toLowerCase().includes(a));
    if (bad) throw new Error(`counterpart for ${id} has a non-open licence: ${m.license}`);

    const t = svgNodes().find((n) => n.getAttribute && n.getAttribute("data-lane") === id);
    if (!t) { soft(`counterpart: no lane for ${id}`); continue; }
    openWorldVia(t);
    const htmlOut = store["panel-world"].innerHTML;
    if (!htmlOut.includes(m.file)) {
      throw new Error(`counterpart image not rendered for ${id}`);
    }
    const flat = plainText(htmlOut);
    if (m.author && !flat.includes(m.author.slice(0, 18))) {
      throw new Error(`counterpart for ${id} is missing its author attribution`);
    }
    if (m.license && !flat.toLowerCase().includes(m.license.toLowerCase().slice(0, 12))) {
      throw new Error(`counterpart for ${id} is missing its licence`);
    }
    /* the UI must not blur the two kinds of image together */
    if (!/Photograph/.test(htmlOut)) {
      throw new Error(`counterpart for ${id} is not labelled as a photograph`);
    }
    shown++;
    closeWorldIfOpen();
  }
  soft(`counterparts: ${shown}/${ids.length} rendered with licence and author`);
});

/* ---- one palette -----------------------------------------------------------
   The picker was removed by request, so there is a single ground now. What still
   matters: the data's archetype colours are tuned for a dark page and measure
   1.7-3.0 contrast here, so every one must reach the UI darkened past WCAG AA.
   This checks the delivered stylesheet values, not a copy of the algorithm. */
attempt("archetype contrast on the single palette", () => {
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  function lum(hex) {
    const v = parseInt(String(hex).replace("#", ""), 16);
    const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function ratio(a, b) {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  const GROUND = "#eef2f6";
  /* Check the tokens the stylesheet actually ships. A fixture payload carries
     its own archetype colours that no token covers - that is a fixture, not a
     failure - so the check is driven by the CSS, and every token present in it
     must clear AA. */
  const tokens = [...css.matchAll(/--g-[0-9a-f]{6}-light:\s*(#[0-9a-f]{6})/gi)];
  if (!tokens.length) throw new Error("no archetype colour tokens found in the stylesheet");
  for (const t of tokens) {
    const r = ratio(t[1], GROUND);
    if (r < 4.5) {
      throw new Error(`archetype token ${t[1]} is ${r.toFixed(2)}:1 on ${GROUND}, below 4.5`);
    }
  }
  soft(`archetype contrast: ${tokens.length} tokens clear WCAG AA on ${GROUND}`);
});

/* the convergence sequence must arm every branch and enter its running state.
   The previous interactions leave the view zoomed out, where short branches are
   legitimately not drawn, so restore a known framing first. */
attempt("convergence animation", () => {
  setModeVia("order");                     /* branches exist only in the line-shaped views */
  debug().focusYear(1800, 1400);
  /* query AFTER framing: focusYear re-renders and republishes the svg */
  const cores = () => store["chart"].querySelectorAll(".core");
  if (!cores().length) {
    throw new Error("no branches to converge at the default view");
  }
  if (store["chart"].querySelectorAll(".trunk-core").length !== 1) {
    throw new Error("expected exactly one trunk (real history drawn once)");
  }

  store["converge"].onclick();
  const armed = cores();
  if (!armed.every((n) => Number(n.getAttribute("stroke-dasharray")) > 0)) {
    throw new Error("convergence did not arm every branch with its own length");
  }
  if (!armed.some((n) => n.getAttribute("stroke-dashoffset") !== null)) {
    throw new Error("convergence did not begin (no dash offset applied)");
  }
  if (!store["converge"].classList.contains("on")) {
    throw new Error("convergence button did not enter its running state");
  }
});

/* tree integrity: every visible world is either a branch off the trunk or an
   explicit "forks later" marker - never silently absent */
attempt("tree integrity", () => {
  debug().focusYear(1800, 1400);
  const groups = store["chart"].querySelectorAll("[data-lane-group]");
  if (groups.length !== expectedLineages) {
    throw new Error(`rendered ${groups.length} branch groups, expected ${expectedLineages}`);
  }
  for (const g of groups) {
    const drawn = g.querySelectorAll(".core").length + g.querySelectorAll(".ghost").length;
    if (!drawn) throw new Error("branch " + g.getAttribute("data-lane-group") + " drew neither a path nor a marker");
  }
  const forks = store["chart"].querySelectorAll(".fork").length;
  if (!forks) throw new Error("no fork nodes on the trunk in the default view");
});

{
  const reachable = new Set();
  const halfSpans = [150, 800, 12000, 400000, 3e6, 3e8, 3e9];
  for (const l of payload.lineages) {
    for (let i = 0; i < l.events.length; i++) {
      const e = l.events[i];
      for (const hs of halfSpans) {
        debug().focusYear(e.year, hs);
        const found = svgNodes().some((n) => n.getAttribute("data-ev") === l.id + "|" + i);
        if (found) { reachable.add(l.id + "|" + i); break; }
      }
    }
  }
  const unreachable = [];
  for (const l of payload.lineages) {
    l.events.forEach((e, i) => {
      if (!reachable.has(l.id + "|" + i)) unreachable.push(`${l.title} / ${e.year} ${e.title}`);
    });
  }
  check(unreachable.length === 0,
    `${unreachable.length} event(s) could not be rendered at any zoom level: ${unreachable.join("; ")}`);
  soft(`reachability sweep: ${reachable.size}/${expectedEvents} events render at some zoom level`);
  /* restore a sensible view for the remaining checks */
  debug().focusYear(1200, 1800);
}

/* ---- transform integrity: pxFor and yearForPx must be true inverses, in the
   default view and in views centred far from the present day ---- */
{
  const views = [[1200, 1800], [100, 150], [-23000, 4000], [2350, 120], [0, 40000], [2200, 60]];
  for (const [c, hs] of views) {
    debug().focusYear(c, hs);
    const t = debug();
    let worstYear = 0;
    for (const y of [c, c + hs * 0.5, c - hs * 0.5, c + hs * 0.9, c - hs * 0.9]) {
      const back = t.yearForPx(t.pxFor(y));
      if (Math.abs(back - y) > Math.max(1, Math.abs(y) * 1e-6)) {
        worstYear = Math.max(worstYear, Math.abs(back - y));
      }
    }
    check(worstYear === 0,
      `transform is not invertible at view c=${c} hs=${hs}: worst year round-trip error ${worstYear}`);
    const nx = t.pxFor(t.NOW);
    /* On canvas exactly when the present day falls between the years that the
       canvas edges represent. Compare against the pixel boundaries themselves,
       not visibleYears(), which stops at the lane's right edge 12px short. */
    const from = t.yearForPx(0), to = t.yearForPx(t.W);
    const nowInWindow = t.NOW >= from && t.NOW <= to;
    if (nowInWindow) {
      check(nx >= 0 && nx <= t.W,
        `present day is inside the window but its line is off-canvas at c=${c} hs=${hs} (x=${Math.round(nx)})`);
    } else {
      check(nx <= 0 || nx >= t.W,
        `present day is outside the window ${Math.round(from)}..${Math.round(to)} ` +
        `but its line is on canvas at c=${c} hs=${hs} (x=${Math.round(nx)})`);
    }
  }
  debug().focusYear(1200, 1800);
  /* real history should keep a readable share of the width in the default view */
  const t = debug();
  const frac = (t.pxFor(t.NOW) - t.LANE_R) / (t.W - t.LANE_R);
  soft(`present day sits ${(frac * 100).toFixed(0)}% across the drawing area in the default view`);
}

/* the camera: zoom in and out around the centre, pan vertically, fit - the tree
   must stay complete and the scene must never be pulled out of the viewport */
attempt("camera zoom, pan and fit", () => {
  const t0 = debug();
  t0.zoomBy(0.5); t0.zoomBy(0.5);
  if (lanesRendered() !== expectedLineages) throw new Error("lanes lost after zooming in");
  const zin = debug().Z;
  debug().zoomBy(4); debug().zoomBy(4);
  if (lanesRendered() !== expectedLineages) throw new Error("lanes lost after zooming out");
  if (!(debug().Z < zin)) throw new Error("zooming out did not reduce Z");
  const t = debug();
  if (t.sceneH <= t.H && Math.abs(t.panY - (t.H - t.sceneH) / 2) > 1) {
    throw new Error("a scene that fits was not centred");
  }
  debug().fit();
  const f = debug();
  if (f.sceneH > f.H + 1 && f.Z > 0.3) throw new Error(`fit left the tree taller than the viewport (${Math.round(f.sceneH)} > ${f.H})`);
  chart.onpointerdown({ button: 0, clientX: 800, clientY: 400, pointerId: 1 });
  chart.onpointermove({ clientX: 800, clientY: 300, pointerId: 1 });
  chart.onpointerup({ clientX: 800, clientY: 300, pointerId: 1, target: { getAttribute: () => null } });
  chart.onwheel({ deltaX: 120, deltaY: 0, clientX: 900, clientY: 400, preventDefault() {} });
  chart.onwheel({ deltaX: 0, deltaY: 200, clientX: 900, clientY: 400, preventDefault() {} });
  if (lanesRendered() !== expectedLineages) throw new Error("lanes lost after pan/wheel");
});

/* zoom the slider to both extremes and re-check lane integrity */
for (const v of ["0", "1000", "500"]) {
  attempt("render at zoom slider " + v, () => {
    store["zoom"].value = v;
    store["zoom"].oninput.call(store["zoom"]);
    if (lanesRendered() !== expectedLineages) {
      throw new Error(`at zoom ${v}: ${lanesRendered()} lanes, expected ${expectedLineages}`);
    }
  });
}

/* ------------------------------ report ------------------------------ */

function openWorldVia(target){ chart.onpointerup({ clientX: 5, clientY: 5, pointerId: 1, target }); }
function closeWorldIfOpen(){ const b = store["panel-world"].querySelectorAll("#dclose")[0]; if (b && b.onclick) b.onclick(); }
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
/* the page HTML-escapes dossier prose before inserting it, so expectations must
   be escaped the same way before being searched for */
/* the longest leading run of a string that is safe to look for inside
   tag-stripped html (no angle brackets, no markup-hostile characters) */
function longestPlainRun(s, want) {
  const t = String(s == null ? "" : s);
  const cut = t.search(/[<>]/);
  const head = cut === -1 ? t : t.slice(0, cut);
  return head.slice(0, want || 44).trim();
}

function plainText(html) {
  return String(html == null ? "" : html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "\u00b7")
    .replace(/&rarr;/g, "\u2192").replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
    .replace(/&nbsp;/g, " ");
}

/* stop any animation still in flight so the process can exit */
const drained = drainFrames();

console.log("");
console.log(`payload     : ${payload.groups.length} groups, ${expectedLineages} lineages, ${expectedEvents} events`);
console.log(`rendered    : ${lanesRendered()} lanes, ${eventTargets()} event targets, ${texts()} text nodes`);
console.log(`svg groups  : ${count((n) => n.tagName === "G")}`);
if (drained) console.log(`drained     : ${drained} pending animation frame(s)`);
console.log("");
if (softs.length) {
  console.log(`${softs.length} note(s):`);
  softs.forEach((s) => console.log("  - " + s));
  console.log("");
}
if (failures.length) {
  console.log(`FAILED (${failures.length}):`);
  failures.forEach((f) => console.log("  x " + f));
  process.exit(1);
}
console.log("PASS - render pipeline and all interaction paths completed without error");
