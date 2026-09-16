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
    this.style = {};
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
  "eras", "conv", "cards", "drawer", "panes", "dchart", "converge",
];
const store = Object.create(null);
ids.forEach((id) => { store[id] = new El(id === "chart" ? "svg" : "div"); });
store["embedder"] = new El("script");
store["embedded-data"].textContent = "{}";
store["sort"].value = "group";
store["find"].value = "";
store["zoom"].value = "330";
store["allev"].textContent = "Show all event labels";

/* Era presets are read out of the real markup further down, so the harness can
   never drift out of sync with the page's actual buttons. */
const eraButtons = [];

const document = {
  head: new El("head"),
  body: new El("body"),
  getElementById(id) { return store[id] || null; },
  createElement(tag) { return new El(tag); },
  createElementNS(ns, tag) { return new El(tag, ns); },
  addEventListener() {},
  querySelectorAll(sel) { return sel === ".era" ? eraButtons : []; },
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

check(texts() > expectedLineages * 2, `only ${texts()} text nodes rendered`);

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
  const t = svgNodes().find((n) => n.getAttribute("data-ev") !== null);
  if (!t) throw new Error("no event target to hover");
  chart.onpointermove({ target: t, clientX: 500, clientY: 300 });
});

/* open every lineage's world drawer - the heaviest code path, and the one that
   carries the new dossier content */
attempt("world drawer for every lineage", () => {
  let opened = 0;
  const dossiers = new Set((payload.worlds || []).map((w) => w.id));
  for (const l of payload.lineages) {
    const t = svgNodes().find((n) => n.getAttribute && n.getAttribute("data-lane") === l.id);
    if (!t) throw new Error("no lane target for " + l.id);
    chart.onpointerup({ clientX: 10, clientY: 10, pointerId: 1, target: t });

    const d = store["drawer"];
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
    const tbody = store["drawer"].querySelectorAll("TBODY")[0];
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
      const tab2 = store["drawer"].querySelectorAll("[data-tab]").find((n) => n.getAttribute("data-tab") === "where");
      tab2.onclick();
      const first = l._w.whereToStart[0];
      if (!plainText(store["drawer"].innerHTML).includes(first.title)) {
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
  const rows = store["conv"].querySelectorAll(".convrow");
  check(rows.length === payload.lineages.length,
    `rendered ${rows.length} convergence rows, expected ${payload.lineages.length}`);
  const stats = store["stats"].innerHTML;
  check(/Worlds charted/.test(stats) && /Dated events/.test(stats) && /Dossiers/.test(stats),
    "stat strip did not render its three headline figures");
  check(store["eras"].children.length >= 4,
    `only ${store["eras"].children.length} era presets built`);
  check(store["chips"].children.length >= payload.groups.length,
    "archetype chips did not render");
});

/* the convergence sequence must arm every branch and enter its running state.
   The previous interactions leave the view zoomed out, where short branches are
   legitimately not drawn, so restore a known framing first. */
attempt("convergence animation", () => {
  debug().focusYear(1800, 1400);
  /* query AFTER framing: focusYear re-renders and republishes the svg */
  if (!store["chart"].querySelectorAll(".spine-fic").length) {
    throw new Error("no branches to converge at the default view");
  }

  store["converge"].onclick();
  const armed = store["chart"].querySelectorAll(".spine-fic");
  if (!armed.every((n) => n.getAttribute("stroke-dasharray") === "1600")) {
    throw new Error("convergence did not arm every branch");
  }
  if (!armed.some((n) => n.getAttribute("stroke-dashoffset") !== null)) {
    throw new Error("convergence did not begin (no dash offset applied)");
  }
  if (!store["converge"].classList.contains("on")) {
    throw new Error("convergence button did not enter its running state");
  }
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
