/*
 * Renders the fixture payload through the real timeline.html into the DOM shim,
 * so the viewer can be proven correct before the researched dataset lands.
 *
 *   python3 test-fixture.py && node test-viewer.js
 *
 * Builds a temporary copy of timeline.html with the fixture embedded, then runs
 * the same assertion suite as test-render.js against it.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const FIXTURE = path.join(ROOT, "data", ".test-fixture.json");

if (!fs.existsSync(FIXTURE)) {
  console.log("FAILED: " + path.relative(ROOT, FIXTURE) + " not found - run: python3 test-fixture.py");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

/* data/.test-fixture.json holds one group + one lineage; the viewer needs the
   aggregate shape, so wrap it the way build-data.py would. */
const aggregated = payload.lineages
  ? payload
  : { groups: [payload.group], lineages: payload.lineages };

let html = fs.readFileSync(path.join(ROOT, "timeline.html"), "utf8");
const MARK = '<script id="embedded-data" type="application/json">';
const start = html.indexOf(MARK);
if (start === -1) {
  console.log("FAILED: timeline.html has no embedded-data block");
  process.exit(1);
}
const bodyStart = start + MARK.length;
const end = html.indexOf("</script>", bodyStart);
const tmp = path.join(os.tmpdir(), "timeline-viewer-fixture-" + process.pid + ".html");
fs.writeFileSync(tmp, html.slice(0, bodyStart) + "\n" + JSON.stringify(aggregated) + "\n" + html.slice(end));

console.log("rendering fixture through timeline.html -> " + path.basename(tmp));
console.log("");

let out;
let code = 0;
try {
  out = execFileSync(process.execPath, [path.join(ROOT, "test-render.js"), tmp], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  out = (e.stdout || "") + (e.stderr || "");
  code = e.status === undefined ? 1 : e.status;
}

process.stdout.write(out);
try { fs.unlinkSync(tmp); } catch (e) {}
process.exit(code);
