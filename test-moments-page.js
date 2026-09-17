#!/usr/bin/env node
/*
 * What the reader's browser actually lays out, for what the headless harness
 * cannot reach.
 *
 * test-render.js runs the page in a vm with a stub DOM and no 2D context, so the
 * Moments page falls back to its own SVG drawing there. The Cytoscape + dagre
 * layout is the one people see, and it has already shipped one bug the suite
 * could not catch: the three ending sinks were placed by incoming edge count,
 * ended up on two different x values, and the opening camera - which framed
 * today alone - left two of them outside the viewport entirely.
 *
 * So this drives a real Chrome, reads the geometry out of the live graph, and
 * fails on the properties that matter. Chrome is optional: with no browser found
 * it says so and exits 0, because a missing browser is not a broken page.
 */
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const PAGE = path.join(ROOT, "timeline.html");

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });

if (!CHROME) {
  console.log("SKIP - no Chrome or Chromium found; the browser geometry test did not run");
  process.exit(0);
}
if (!fs.existsSync(PAGE)) {
  console.error("FAIL - timeline.html is missing; run build-data.py first");
  process.exit(1);
}

/* Runs in the page and leaves its answer in the DOM for --dump-dom to return.
   It waits for the graph rather than for a fixed delay: virtual time in headless
   Chrome advances faster than the layout settles, so a sleep reports too early
   and looks like a fallback. */
/* Runs in the page and leaves its answer in the DOM. A single timer, not a poll:
   --dump-dom snapshots at a point that a chained setTimeout can miss, and a
   fixed delay is what has been measured to survive it. */
const PROBE = [
  "setTimeout(function(){",
  "  var T = window.__timeline, out = { ok:false };",
  "  try {",
  "    var cy = T && T.momentsCy && T.momentsCy();",
  "    out.hadCy = !!cy;",
  "    out.canvas = typeof document.createElement('canvas').getContext;",
  "    if (cy) {",
  "      var all = cy.elements().boundingBox(), ext = cy.extent();",
  "      out.ok = true;",
  "      out.zoom = +cy.zoom().toFixed(3);",
  "      out.graph = { x1:Math.round(all.x1), x2:Math.round(all.x2),",
  "                    y1:Math.round(all.y1), y2:Math.round(all.y2),",
  "                    w:Math.round(all.w), h:Math.round(all.h) };",
  "      out.view = { x1:Math.round(ext.x1), x2:Math.round(ext.x2),",
  "                   y1:Math.round(ext.y1), y2:Math.round(ext.y2) };",
  "      out.endings = cy.nodes('.ending').map(function(n){",
  "        var p = n.position(), b = n.boundingBox();",
  "        return { id:n.id(), x:Math.round(p.x), y:Math.round(p.y),",
  "                 inView:(b.x2 >= ext.x1 && b.x1 <= ext.x2 && b.y2 >= ext.y1 && b.y1 <= ext.y2) };",
  "      });",
  "    }",
  "  } catch (e) { out.error = String(e && e.message); }",
  "  var pre = document.createElement('pre');",
  "  pre.id = 'GEOMETRY';",
  "  pre.textContent = JSON.stringify(out);",
  "  document.body.appendChild(pre);",
  "}, 3200);",
].join("\n");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tl-geom-"));
const probePage = path.join(tmp, "probe.html");
fs.writeFileSync(probePage, fs.readFileSync(PAGE, "utf8").replace(
  "if(embedded) boot(embedded);",
  "if(embedded) boot(embedded);\n" + PROBE));

function dumpDom(page, cb){
  const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch (e) {} }, 45000);
  const child = execFile(CHROME, [
    "--headless", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--disable-extensions", "--dump-dom",
    /* --screenshot makes Chrome produce a frame, which is what gives the page a
       2D context. Without it the Moments page takes its SVG fallback and there
       is no Cytoscape geometry to measure at all. */
    "--screenshot=" + path.join(tmp, "frame.png"),
    "--window-size=1500,900",
    "--user-data-dir=" + path.join(tmp, "profile"),
    "file://" + page,
  ], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
    clearTimeout(killer);
    cb(String(stdout || ""));
  });
}

dumpDom(probePage, (dom) => {
  const m = /<pre id="GEOMETRY">([\s\S]*?)<\/pre>/.exec(dom);
  const t = /<title>GEOMETRY:([\s\S]*?)<\/title>/.exec(dom);
  if (!m && t) {
    let tg;
    try { tg = JSON.parse(t[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&')); } catch (e) { tg = null; }
    if (tg) {
      console.log("probe (from title): ok=" + tg.ok + " tries=" + tg.tries
        + " cy=" + (tg.graph ? "yes" : "no") + (tg.error ? " err=" + tg.error : ""));
    }
  }
  if (!m) {
    const bits = [
      "cy=" + (/\bid="cy"/.test(dom) ? "present" : "absent"),
      "cytoscape=" + (/cytoscape/i.test(dom) ? "mentioned" : "absent"),
      "chart=" + (dom.length > 1000 ? "rendered" : "empty"),
    ];
    const pre = /<pre[^>]*>(?:(?!<\/pre>)[\s\S]){0,200}/.exec(dom);
    console.error("FAIL - the probe never reported (" + bits.join(", ") + ")");
    console.error("  injected probe present in dump: " + /var tries = 0/.test(dom));
    console.error("  any pre element: " + (pre ? pre[0].slice(0, 160) : "none"));
    process.exit(1);
  }
  let g;
  try {
    g = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  } catch (e) {
    console.error("FAIL - the probe answer was unreadable: " + e.message);
    process.exit(1);
  }
  if (!g.ok) {
    console.log("SKIP - the page fell back to its SVG drawing in this browser"
      + (g.error ? " (" + g.error + ")" : "") + "; nothing to measure");
    process.exit(0);
  }

  let failed = 0;
  const check = (cond, msg) => { if (!cond) { console.error("  x " + msg); failed++; } };
  console.log("browser geometry: graph " + g.graph.w + "x" + g.graph.h
    + ", view " + (g.view.x2 - g.view.x1) + "x" + (g.view.y2 - g.view.y1)
    + ", zoom " + g.zoom);

  check(g.endings.length === 3, g.endings.length + " ending node(s), expected 3");
  const xs = g.endings.map((e) => e.x);
  check(new Set(xs).size === 1, "endings do not share one x: " + xs.join(", "));

  const ys = g.endings.map((e) => e.y).slice().sort((a, b) => a - b);
  if (ys.length === 3) {
    const a = ys[1] - ys[0], b = ys[2] - ys[1];
    check(Math.abs(a - b) <= 2, "endings are not evenly spread: gaps " + a + " and " + b);
    check(ys[2] - ys[0] > 60, "endings are stacked in " + (ys[2] - ys[0]) + "px");
  }

  g.endings.forEach((e) => {
    check(e.inView, e.id + " is outside the opening viewport (y=" + e.y
      + ", view y " + g.view.y1 + ".." + g.view.y2 + ")");
  });

  check(g.graph.x2 >= Math.max.apply(null, xs),
    "the graph's right edge is left of the endings");

  if (failed) {
    console.error("FAILED (" + failed + ")");
    process.exit(1);
  }
  console.log("  - " + g.endings.map((e) => e.id.replace("ending-", "") + " y=" + e.y).join(", ")
    + " | all in view at zoom " + g.zoom);
  console.log("PASS - the Cytoscape layout places the endings as one column, in view");
});
