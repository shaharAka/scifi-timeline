# Handoff — scifi-timeline

Everything needed to pick this up cold, from any machine. Read this first; it is
the entry point and it tells you what to trust and what will bite you.

- **Repo:** `/Users/shahar/Documents/scifi-timeline` (standalone git repo, branch `main`)
- **Commit at handoff:** `a4ea806` (project) + this document
- **Remote:** none yet. Local only.
- **What it is:** a static, dependency-free dashboard that pins 24 science-fiction
  worlds to the real-world calendar, shows where each one diverges from our
  history, and lets a reader step inside any of them.
- **State:** all three test suites green. 5 archetypes, 24 lineages, 237 events,
  24 world dossiers.

```bash
cd /Users/shahar/Documents/scifi-timeline
open timeline.html          # just works, no server, no build step
python3 build-data.py       # validate + regenerate after editing data
python3 test-fixture.py && node test-viewer.js && node test-render.js timeline.html
```

---

## 1. Repo map

| Path | Role | Edit it? |
|---|---|---|
| `timeline.html` | The entire dashboard: markup, CSS, and viewer JS in one file. Also carries an embedded copy of the dataset so it opens over `file://`. | Yes — this is the app |
| `data/parts/*.json` | The editable dataset, one file per archetype. | Yes — this is the data |
| `data/parts/worlds/*.json` | World dossiers, one file per research pass. | Yes |
| `data/groups.json` | Archetype display order. | Yes |
| `data/SCHEMA.md` | The data contract. Read before adding anything. | When the contract changes |
| `build-data.py` | Validator + aggregator + embedder. Single source of build truth. | Rarely |
| `data/timeline-data.json` | **Generated.** Aggregate of the parts, fetched when served over HTTP. | Never by hand |
| `test-render.js` | Headless render + interaction suite for the real page. | When you add behaviour |
| `test-viewer.js` | Wraps `test-render.js` to run it against fixture data. | Rarely |
| `test-fixture.py` | Proves the build pipeline works **and that bad data is rejected**. | When validation changes |
| `README.md` | User-facing orientation. | When behaviour changes |

`timeline.html` and `data/timeline-data.json` are **generated** and committed on
purpose: a fresh clone opens with zero setup. If you edit `data/parts/`, you must
re-run `python3 build-data.py` or the page will not change.

---

## 2. How the pipeline works

```
data/parts/*.json ──┐
data/parts/worlds/*.json ──┤
data/groups.json ──┘        │
                            ▼
                    build-data.py
                    ├─ validate (44 hard errors, 14 warnings)
                    ├─ aggregate → data/timeline-data.json
                    └─ embed a compact copy into timeline.html
                       between the <script id="embedded-data"> markers
```

The viewer boots from the embedded copy, then tries `fetch("data/timeline-data.json")`
and replaces it if that succeeds. So `file://` works from the embedded copy and a
served copy picks up edits live. **If both are stale, the page silently shows old
data** — that is the single most likely source of "my change did nothing." Always
run `build-data.py` after touching data.

To add data, the flow is: edit part file → `python3 build-data.py` → read the
warnings (they are informative, not noise) → run the suites.

---

## 3. The data contract, and the traps in it

Full spec in `data/SCHEMA.md`. The four things that will actually catch you out:

### Everything is a real-world year

`year` is a real calendar year for every event. Never "5 BBY", never a stardate.
In-universe dating is preserved separately in `inUniverse` (free text, shown in
tooltips and in the chronology table). The validator rejects non-integers.

### `tier` and `phase` are deliberately different axes

This was got wrong once and cost a whole research pass, so it is worth stating
plainly:

- **`tier` is absolute time from today.** `<1900` T4, `<2000` T3, `<2300` T2,
  else T1. It is **not** derived from the divergence.
- **`phase` is story-relative.** `prehistory` before the fork, `fork` for the
  divergence year and the two years after, `aftermath` to `+50`, `deep` beyond.

The validator recomputes both and hard-errors on a mismatch. An earlier version of
this project conflated them, which made "every world reaches deep time"
unsatisfiable for stories that fork near the present. Both fields exist because
each answers a different question, and the tension between them is real
information: His Dark Materials has tier T3 events that sit at `phase: deep`,
because its fork is 1558.

`phaseIsAuthored: true` on a lineage opts out of the phase derivation. Exactly one
lineage uses it — Star Wars — because a single divergence year cannot classify a
story that spans 25,000 years of its own history. Use it sparingly and say why in
`groupingNote`.

### `epoch` records which way a world faces

`deep-past` / `far-future` / `present`. Required. This exists because of Star Wars.

### Divergence is the *first* year the fiction stops matching us

Not the most dramatic one. Each divergence carries a `delta` contrasting real
history with the fiction — that field is the most valuable thing in the dataset,
so keep it sharp.

---

## 4. Viewer architecture (`timeline.html`)

One IIFE, no framework, no build step for the JS. Roughly:

| Area | Functions | Notes |
|---|---|---|
| Boot | `readEmbedded`, `normalize`, `boot` | `boot()` **must stay at the bottom of the IIFE** |
| Time transform | `warp`, `anchorX`, `warpX`, `pxFor`, `yearForPx` | see §5 |
| Selection | `matches`, `visibleLineages`, `layout` | filter/sort → ordered rows |
| Chart | `renderChart`, `renderLane` | four SVG layers: bands, axis, lanes, today |
| Motion | `slide`, `playConvergence` | lane tween; the signature animation |
| Interaction | `attachInteractions`, `hoverCheck`, `showTip` | pan, zoom, hover, click |
| Dashboard | `renderStats`, `renderConvergence`, `renderCards` | stat strip, bar panel, cards |
| Drill-down | `openWorld`, `renderDrawer`, `drawMini` | the three-tab world drawer |

`renderChart()` rebuilds the SVG wholesale on every pan/zoom. That is fine at this
size (237 event targets) and keeps the code simple — do not optimise it without
measuring first.

**`window.__timeline`** is published on every render as a debug and test surface:
`view`, `NOW`, `pxFor`, `yearForPx`, `visibleYears()`, `focusYear(year, span)`,
`lineages`, `openWorld`. Read it **fresh each time** — `render()` republishes it, so
a captured reference goes stale and points at an orphaned tree. This bit the test
harness twice.

### Layer order matters

`gBands → gAxis → gLanes → gNow`. Within a lane, event hit-target circles are
appended **last** so nothing can cover them. The lane's title gutter is a
translucent rect (`rgba(11,18,32,.82)`) specifically so the today line still reads
through it.

---

## 5. The time axis — read before touching numbers

The dataset spans roughly 2 billion BCE to 48,000 CE. A linear axis would erase the
present day, so the scale is a **symmetric log**:

```
warp(off) = sign(off) * min(log1p(|off| / WARP), 1e4)
```

- `WARP = 110`. This value is load-bearing. At `1.7` everything from 1980–2300
  collapses into ~200px and the modern era renders as one illegible clump; at 110
  the axis is near-linear across the last few centuries and only bends for deep
  time. It was chosen by geometric search over the real event distribution.
- `anchorX()` is the present day's x position, fixed at **22%** of the width. It is
  deliberately **not** derived from the viewport: a dynamic anchor silently
  stretched the visible range by three orders of magnitude as soon as the view left
  our own era.
- `yearForPx` and `pxFor` must remain exact inverses. If you change one, change the
  other, and the test suite has a guard that will catch you at six different views.
- `OFF_CAP = 5e9` exists so panning can reach the ~2-billion-year-old Expanse
  events. The `warp` log cap parks anything more extreme at a finite position
  instead of flinging it off the axis.

**Era presets** are built at runtime in `renderEras()`, not in the markup:
Around now `-700..3100`, Divergence era `1890..2090`, Deep future `2300..49000`,
Full reach `-52000..52000` (233/237 events on one screen), Ancient past `-26000..6000`.
They are tuned against the data — if the dataset changes a lot, re-check them.

---

## 6. Testing

Three suites, all headless, no browser or dependencies required.

```bash
python3 test-fixture.py                  # pipeline + rejection of bad data
node test-viewer.js                      # viewer renders fixture data end to end
node test-render.js timeline.html        # viewer renders the REAL dataset
```

`test-render.js` is a **hand-written DOM shim** plus assertions. It runs the page's
actual JS in a `vm` context. It checks: every lane renders, all 237 events are
drawable at some zoom, the transform is invertible and the today line is on canvas
exactly when today is in view, every one of the 24 world drawers renders all three
tabs with its dossier content, the dashboard panels populate, the convergence
animation arms, and pan/zoom/filter/sort/preset interactions do not throw.

Exit code is 0 on pass. It prints soft notes for legitimately off-screen events.

### Shim gotchas (these all caused false results)

The shim is a test double, and it has lied before. If a test result looks
impossible, suspect the shim first:

- `classList` is **derived from the class attribute**, not stored beside it. When
  it was a separate object, `classList.add` was a silent no-op on every element the
  page created and `.spine-fic` selectors matched nothing.
- `querySelectorAll` supports attribute selectors (`[data-tab]`), compound classes
  (`.evdot.minor`), comma lists, and tag names. Attribute names **may contain
  hyphens** — a `\w+` pattern silently matched nothing.
- `innerHTML` assignment runs a small tag parser. It copies **all** attributes,
  which is how `data-*` lookups work.
- Animation frames are tracked in `pendingFrames` and drained before the summary,
  or the Node process never exits.
- The harness swaps in the viewer's own normalised lineage objects after boot,
  because `boot()` attaches `_g` and `_w` to them. Assertions must inspect those,
  not a separately parsed copy.
- When asserting on rendered prose, compare against **tag-stripped** HTML
  (`plainText`), and probe a phrase containing no markup — `plainText` turns tags
  into spaces, so a needle straddling an inline element never matches.

### Visual checks without a browser

For screenshots, headless Chrome works. It must be backgrounded and polled — it
does not exit on its own, and `timeout` is not available on this macOS setup:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-sandbox --no-first-run --disable-extensions \
  --user-data-dir=/tmp/cp1 --screenshot=/tmp/shot.png --window-size=1500,1000 \
  --virtual-time-budget=7000 "file:///Users/shahar/Documents/scifi-timeline/timeline.html" &
PID=$!; for i in $(seq 1 45); do sleep 1; [ -f /tmp/shot.png ] && break; kill -0 $PID 2>/dev/null || break; done
sleep 1; kill $PID 2>/dev/null
```

To frame a specific state (a world drawer, the animation mid-flight), build a
throwaway copy of the page with a `location.hash` preview hook **inside the IIFE**
(a hook outside it cannot see `openWorld`/`playConvergence`), and suppress
`scrollIntoView` so the target stays in frame. Delete the copy afterwards.

---

## 7. Bugs already found — do not reintroduce

Each of these was real, shipped, and caught by the harness. They are listed because
every one is easy to write again.

1. **`boot()` called before the `var` declarations below it.** Function declarations
   hoist, `var` initialisers do not, so every module-level variable was `undefined`
   at boot. Hence the "must stay last" comment.
2. **A hardcoded `NOWX = 168`.** It assumed the present day always sits ~12% across,
   so any view centred away from our era rendered entirely off-canvas.
3. **A dynamic anchor (`nowFrac`).** The opposite mistake: deriving the anchor from
   the viewport made the axis non-uniform and stretched the visible span ~1000×.
   Fixed anchor, 22%. Do not "improve" this without re-reading §5.
4. **Events dated before a divergence were culled.** The lane only drew back to the
   fork, so His Dark Materials' 100–1200 CE background vanished. Lanes now span
   their full event range.
5. **`OFF_CAP = 12000`** hid the billion-year Expanse events at every zoom.
6. **Opening a second world kept the previous world's tab.** `openWorld` now resets
   `activeTab`.
7. **A malformed nested ternary** in the event-dot radius — a hard syntax error.
8. **A stale `__timeline` reference** after re-render, in tests and in throwaway
   scripts.
9. **`phase`/`tier` conflation** across five research passes (see §3).

---

## 8. Decisions that look like mistakes but are not

Change these only on purpose.

- **Star Wars is plotted ~23,000 BCE.** Its own crawl says "a long time ago", so
  `real = 1977 - BBY` puts the Republic's founding at 23,023 BCE. This was
  investigated as a possible sign error and confirmed correct. `epoch: deep-past`
  records it.
- **Some worlds have no deep-time (T1) events.** 15 of 24. That is a true statement
  about secret-history and alternate-past fiction, not a gap. The validator warns
  rather than fails, deliberately.
- **Confidence is uneven on purpose.** 118 high, 82 medium, 37 low. Low-confidence
  items are kept, with the competing claim written into the event `note` rather
  than silently resolved. Removing them would make the chart tidier and less honest.
- **Amber rings are a computed rule**, not a hand-curated list: a fictional event
  dated in our recent past that real history has since contradicted. Publication
  dates and `historyContradicts: false` are excluded. Alternate histories are not
  flagged — their fork is the premise.
- **Generated files are committed.** A fresh clone opens with no build step. The
  cost is ~680 KB in history.
- **`renderChart()` rebuilds all SVG on every interaction.** Simple and fast enough
  here; do not pre-optimise.

---

## 9. Open threads

Nothing is broken. These are the obvious next moves:

1. **No remote.** `git remote -v` is empty. Upstreaming to GitHub is the natural
   next step, and since the page is pure static it deploys to Pages with no server.
2. **The old copy still exists** at `/Users/shahar/Documents/isramarket/timeline`,
   untracked inside the isramarket repo. It is a verified-identical backup; delete
   it when you are confident, and if you do not, add a `.gitignore` entry there so
   it can never be committed into the app repo by accident.
3. **The dataset is 24 worlds.** The schema and grouping are built to take more.
   The Far-Future group has exactly 5; candidates that fit the existing archetypes
   include Alien, Blade Runner, Neuromancer, The Culture, Babylon 5, Battlestar
   Galactica, A Canticle for Leibowitz, Childhood's End.
4. **No accessibility audit** beyond `prefers-reduced-motion` support. The SVG
   lanes are mouse-and-keyboard (pan/zoom keys) but not screen-reader described.
5. **No mobile layout.** The chart is a fixed-minimum-width SVG with drag-to-pan;
   it is usable down to tablet width, not designed for phones.

---

## 10. Continuing this work elsewhere

The repo is self-contained: clone it and the doc you are reading plus `README.md`
and `data/SCHEMA.md` are the whole context. Nothing depends on the machine it was
built on, and there are no external services, secrets, or environment variables.

If you are resuming with an agent, the useful opening instruction is:

> Read HANDOFF.md, then README.md and data/SCHEMA.md. Run the three test suites to
> confirm the baseline before changing anything.

The two rules most worth restating to any agent: **never edit generated files by
hand** (`data/timeline-data.json`, the embedded block in `timeline.html`), and
**run `build-data.py` after any data edit**, because a stale embed is invisible and
looks like a code bug.
