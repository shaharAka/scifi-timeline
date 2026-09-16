# Handoff — scifi-timeline

Everything needed to pick this up cold, from any machine. Read this first; it is
the entry point and it tells you what to trust and what will bite you.

- **Repo:** `/Users/shahar/Documents/scifi-timeline` (standalone git repo, branch `main`)
- **Commit at handoff:** the latest commit on `main` ("Single-canvas convergence
  tree…"), on top of `a4ea806` (the researched dataset) and `74c373f` (the first
  handoff).
- **Remote:** none yet. Local only.
- **What it is:** an atlas of fictional chronologies pinned to the real
  calendar, read from the present. A reader brings a real event from today's
  news and asks "in which of these worlds did this kind of thing happen, and
  what happened next?" The atlas matches the news to the same kind of moment
  in the fiction and reads each world forward from there: many futures for one
  present, compared for what followed, in what order, what differed and what
  repeated. The tree chart, the Order view and the bins all serve that use.
  More worlds will keep being added, so everything is built to take them.
- **State:** all three test suites green. 5 archetypes, 24 lineages, 237 events,
  24 world dossiers. The viewer was rebuilt on 2026-09-16: tree chart, `src/`
  modules assembled by the build, design tokens, atlas config, single-canvas
  camera and explorer panel. Visually verified in Chrome at 1500px; not yet
  reviewed on other widths or by the owner on a real screen.
- **Read next:** `DESIGN.md` — the visual language, the chart's anatomy, the
  `src/` layout and how to extend the atlas. This document is about the
  pipeline and the traps; that one is about the picture.

```bash
cd /Users/shahar/Documents/scifi-timeline
open timeline.html          # just works, no server
python3 build-data.py       # validate data, assemble timeline.html from src/, embed
python3 test-fixture.py && node test-viewer.js && node test-render.js timeline.html
```

---

## 1. Repo map

| Path | Role | Edit it? |
|---|---|---|
| `timeline.html` | **Generated.** The whole dashboard in one file, assembled from `src/` with the dataset embedded so it opens over `file://`. | **Never** — edit `src/` |
| `src/page.html` | The markup template with `<!-- @styles -->`, `<!-- @scripts -->` and the embedded-data markers. | Yes |
| `src/styles/*.css` | `00-tokens.css` (the design tokens), then base, chart, panels. | Yes |
| `src/viewer/*.js` | The viewer, one concern per file, concatenated in filename order into one IIFE. | Yes — this is the app |
| `data/atlas.json` | Page copy and era presets for this atlas. Validated by the build. | Yes |
| `data/bins.json`, `data/facets.json`, `data/real-history.json` | The kinds of moment, the closed facet vocabularies, and our own history as a sequence of moments. All validated by the build. | Yes - deliberately |
| `tools/facet-match.py` | Match any moment to its situational neighbours and read them forward. | When the facets change |
| `vendor/*.js` | Cytoscape.js, dagre and the cytoscape-dagre adapter (MIT), used by the Moments page. Loaded by `<script src>`, never inlined, so the build stays dependency-free. | Only to upgrade; keep the three versions in step |
| `DESIGN.md` | Design language, chart anatomy, extension guide. | When the design changes |
| `BRIEF-order-axis.md` | The next piece of work: the Order and Moments views, phased. | As phases land |
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
purpose: a fresh clone opens with zero setup. If you edit `data/parts/`, `src/`
or `data/atlas.json`, you must re-run `python3 build-data.py` or the page will
not change.

---


### News

`data/news.json` is hand-curated: date, headline, summary, source, and the world
ids it touches. `build-data.py -> load_news()` is strict - a malformed date or an
unknown world id is an ERROR, not a silent drop, because a chronology claiming a
research standard must not ship a wrong date. It reaches the page twice: a list in
the News panel, and a band beside the today line drawn by `87-news.js`.

The band is deliberately anchored to the TODAY line rather than positioned by
each item's date. On a symmetric-log axis spanning 100,000 years, 2022 to 2026 is
a fraction of a pixel, so "positioned by date" would be a lie told at sub-pixel
scale. Each row names its own date instead.

### Visual design and imagery (added after the tree rewrite)

- **One palette: Blueprint.** A pale cool ground with a faint engineering grid,
  indigo ink, deep-blue trunk. Five switchable themes were built and evaluated,
  then removed by the owner in favour of this one, so `src/styles/themes/` no
  longer exists and `src/styles/00-tokens.css` is the whole palette. `DESIGN.md`
  §2 is the contract.
- **Two kinds of image, never blurred together.** `assets/` holds generated
  illustrative plates (one per world, from `tools/gen-art.py`), and `assets/pd/`
  holds real photographs of real objects, fetched from Wikimedia Commons by
  `tools/fetch-pd.py` with the licence verified at fetch time. The drawer labels
  each accordingly and links the author and licence.
- **Never reference the 2K sources directly.** Run `tools/derive-art.py`; the
  page uses `assets/derived/<id>-lg.jpg` (1000px) and `-sm.jpg` (560px).

The 2K source plates are **gitignored** (73 MB, regenerable); `assets/derived/`
and `assets/` `*-CREDITS.json` are committed, so a fresh clone renders fully.

```bash
python3 tools/gen-art.py --list        # what plates exist / are missing
python3 tools/gen-art.py --only dune   # generate one (needs GEMINI_API_KEY in .env)
python3 tools/derive-art.py --check    # derived sizes present?
python3 tools/fetch-pd.py --check      # real counterparts present?
```

## 2. How the pipeline works

```
data/parts/*.json ──┐
data/parts/worlds/*.json ──┤
data/groups.json ──┤
data/atlas.json ──┘         │
                            ▼
                    build-data.py
                    ├─ validate the parts, the dossiers and the atlas
                    ├─ aggregate → data/timeline-data.json (+ atlas)
                    ├─ assemble src/page.html + src/styles/*.css + src/viewer/*.js
                    └─ embed a compact copy of the data into the result
                       → timeline.html
```

If `src/` is absent the build falls back to re-embedding into the existing
`timeline.html`, so older checkouts still work; with `src/` present the output
is rebuilt from scratch every time.

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

## 4. Viewer architecture (`src/viewer/`)

One IIFE assembled from thirteen files in filename order; `00-boot.js` opens it,
`99-go.js` closes it, and `boot()` **must stay in the last file**. The full
module table and the SVG layer order are in `DESIGN.md` section 4. The short
version:

| Area | Files | Notes |
|---|---|---|
| Boot, state, scale, format, select | `00`–`40` | `10-state.js` holds every constant; `20-scale.js` is the axis (see §5) |
| Layout | `50-layout.js` | the tree: sides, bundles, lane rows, trunk y |
| Axes | `55-order.js`, `56-moments.js` | the `AX` accessor: Years, Order, and the column placement the Moments axis exposes to the tree |
| Moments page | `57-moments-page.js`, `58-facets.js` | its own page: the kinds-and-roads model, Cytoscape/dagre rendering with an SVG fallback, its camera and its panel; facet similarity for matching by situation |
| Chart | `60-chart.js` | trunk + axis, `renderBranch`, prehistory nodes, canvas backdrop |
| Motion | `65-motion.js` | `growIn`, `playConvergence`, `animateLayout` |
| Interaction | `70-interact.js` | pan, zoom, hover, click, tooltip |
| Panels, drawer, chrome | `80`–`90` | the explorer panel (Worlds index with stats/tags/rows, the world dossier + mini chart, About), chips, eras, the camera (`zoomAt`/`fitAll`), atlas copy, `init` |

`renderChart()` rebuilds the SVG wholesale on every pan/zoom and on every frame
of the layout glide. Fine at this size — do not optimise without measuring.
The SVG is viewport-sized; the scene is translated by `panY` and every vertical
constant is scaled by `Z` (see DESIGN.md §3). The page itself does not scroll.

**`window.__timeline`** is republished on every render (`view`, `NOW`, `pxFor`,
`yearForPx`, `visibleYears()`, `focusYear()`, `layout`, `lineages`, `openWorld`,
`playConvergence`). Read it **fresh each time**; a captured reference goes stale.

### Layer order matters

Grid → today-plane → `g.scene` (bundle bands → trunk → branches → prehistory
nodes) → today-line → scrubber. Inside a branch group, the `data-lane` hit rect
and the `data-ev` hit circles are appended **last** so nothing can cover them.

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
- `ANCHOR = 0.5`: the **view centre** (`view.c`, not the present day) sits
  mid-width, so an era preset's `from`/`to` are the true edges of the view. The
  first build used 0.22, which made the presets' `from` values fictional (the
  "Around now" preset claimed −700 and actually showed 1060). The anchor is
  deliberately a **constant**: a dynamic anchor derived from the viewport
  silently stretched the visible range by three orders of magnitude.
- `yearForPx` and `pxFor` must remain exact inverses. If you change one, change the
  other, and the test suite has a guard that will catch you at six different views.
- `OFF_CAP = 5e9` exists so panning can reach the ~2-billion-year-old Expanse
  events. The `warp` log cap parks anything more extreme at a finite position
  instead of flinging it off the axis.

**Era presets** live in `data/atlas.json` (with a fallback list in
`90-chrome.js`): Around now `1830..2150`, Divergence era `1900..2100`, Next
millennia `-1000..5000`, Full reach `-46000..50000`, Deep past `-48000..2000`.
The axis is a symmetric log around the **centre** of `from..to`, so detail lives
at the centre and the edges are cheap: a wide preset centred on the fork
cluster (~2000) shows Star Wars at 5% and Foundation at 97% while keeping the
1930s–2130s forks readable in the middle. Centring a wide view on the far
future instead squashes every modern fork into the left edge. Re-check the
presets whenever the dataset's fork cluster moves.

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
10. **Clicks on a branch did nothing in a real browser.** The svg calls
    `setPointerCapture` on pointerdown, after which `pointerup` is retargeted to
    the svg itself, so `ev.target` never named the branch. The headless suite
    passed because it hands the handler a fake target. Fixed by remembering the
    pressed element on pointerdown. If you touch the pointer handlers, test in a
    browser, not only in Node.
11. **The drawer's mini chart collapsed** for any world with a very early
    prehistory event (The Expanse's 2-billion-year ring builders squashed the
    whole branch into a pixel). It now uses two log segments joined at the fork.
12. **The test shim only knows the element ids listed at the top of
    `test-render.js`.** Add any new `id` the viewer reads with `getElementById`
    to that list, or the page will throw in Node while working in a browser.
    The shim's `innerHTML` getter also returns only what was assigned to that
    element, not its children - assert on the element you wrote to.

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

Nothing is broken. In rough priority order:

1. **Order and Moments - both landed; Moments is the page to keep tuning.**
   Order positions by sequence through the `AX` accessor in `55-order.js`.
   Moments is its own page (`57-moments-page.js`): a directed graph of kinds of
   moment and the roads worlds take between them, ranked left to right by
   dagre on the shared roads and our own path, rendered by Cytoscape.js from
   `vendor/`. The owner's test for it is "what leads to what" - never anchor
   it on a date or on a count-in-a-row. What remains: the dotted real path
   crosses the map where our history visits kinds out of the fictions' order
   (dagre reverses those edges); the two-node "long after / a gateway opens"
   strays sit apart from everything; the bins are 33 hand-built kinds and the
   facets (`data/facets.json`, `58-facets.js`) are what the situation match
   runs on. `BRIEF-order-axis.md` §2.3 has the picture and §2.5 the facets.
2. **Owner review, round two - done, re-check.** The halves of the canvas now
   carry meaning (above = ahead of us, below = behind and beside us) and are
   labelled on the left edge; bundles are tinted and barred in their colour;
   branches are solid up to today and dashed beyond; the trunk says "← the
   past" and "the future →"; the page opens on the fork cluster, not the whole
   dataset. Keep going in that direction: if it is not legible without
   hovering, name it on the canvas.
3. **The amber "contradicted" rule is questionable.** `overtaken()` flags every
   non-publication event dated 1990–today, so the Hidden History bundle carries
   amber rings on nearly every 1990s beat. Whether a secret history counts as
   "contradicted by real history" is a data decision: either narrow the rule
   (e.g. only `epoch: far-future` lineages, or an explicit `historyContradicts`
   per event) or keep it and say so in the legend. Do not change the meaning of
   amber without updating DESIGN.md §2.
4. **Label collisions at high zoom.** One event label row per lane and a
   claim-a-slot rule keep labels apart at fit zoom; when zoomed far in, labels
   from neighbouring lanes can still touch where forks stack at the same year.
   A second row becomes affordable once `LANE_GAP * Z` exceeds ~48px - gate it
   on that, not on a fixed pitch.
5. **No remote.** `git remote -v` is empty. Upstreaming to GitHub is the natural
   next step, and since the page is pure static it deploys to Pages with no server.
6. **The old copy still exists** at `/Users/shahar/Documents/isramarket/timeline`,
   untracked inside the isramarket repo. It is **stale**, not a backup, and
   predates the tree chart entirely. Delete it, or at least `.gitignore` it there.
7. **The dataset is 24 worlds.** The schema, grouping, layout and panel are built
   to take more without code changes (see DESIGN.md §5). Candidates that fit the
   existing archetypes include Alien, Blade Runner, Neuromancer, The Culture,
   Babylon 5, Battlestar Galactica, A Canticle for Leibowitz, Childhood's End.
   Past ~30 worlds the fit zoom drops below the title level of detail; add a
   collapse-by-archetype affordance before that, not a smaller pitch.
8. **No accessibility audit** beyond `prefers-reduced-motion` support. The
   canvas is mouse-and-keyboard (arrows pan, +/- zoom, 0 fit, Esc back) but not
   screen-reader described; the panel's dossier text is the accessible path.
9. **No mobile layout.** The camera works with touch (pointer events), but the
   top bar and the 480px panel are designed for a desktop window.

---

## 10. Continuing this work elsewhere

The repo is self-contained: clone it and the doc you are reading plus `README.md`
and `data/SCHEMA.md` are the whole context. Nothing depends on the machine it was
built on, and there are no external services, secrets, or environment variables.

If you are resuming with an agent, the useful opening instruction is:

> Read HANDOFF.md, then DESIGN.md, BRIEF-order-axis.md, README.md and data/SCHEMA.md. Run
> `python3 build-data.py` and the three test suites to confirm the baseline
> before changing anything. Edit `src/` and `data/`, never `timeline.html`.
> After any visual change, open timeline.html in a real browser and walk the
> checklist in DESIGN.md §6 before calling it done. Pick up the open threads in
> HANDOFF.md §9 in order unless told otherwise.

The three rules most worth restating to any agent: **never edit generated files
by hand** (`timeline.html`, `data/timeline-data.json`); **run `build-data.py`
after any edit** to `src/` or `data/`, because a stale build is invisible and
looks like a code bug; and **look at the chart in a browser** after any visual
change — the headless suite proves completeness, not beauty.
