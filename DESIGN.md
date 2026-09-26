# Design language and visual architecture

This is the guide for anyone - person or agent - who changes how the atlas
looks or adds to it. Read it before touching `src/`. It says what the picture
is supposed to mean, which shapes carry that meaning, how the code is laid out
so the meaning survives edits, and how to add a world, an archetype or a whole
new atlas without redesigning anything.

The one-line brief: **a researched, honest, explorable atlas of fictional
chronologies, pinned to the real calendar, that converges on today.** The
visual has one job: make "converges on today" true at a glance.

---

## 1. The thesis, as a picture

Every fiction here rode along real history until one dated moment, then left.
So the picture is a **tree**, not a table:

- **One trunk.** Real history is drawn once, as a single luminous line through
  the middle of the chart. It is the axis: the year ticks sit on it. It is solid
  up to today and becomes a faint dotted line beyond, because real history has
  not happened there yet.
- **Branches.** Each world leaves the trunk at its divergence year with a
  smooth curve and settles into its own lane, above or below. Its events are
  nodes on that branch. Where a branch runs off the right edge, a chevron says
  it continues; where it ends, a small hollow cap says the story stops here.
- **Two halves that mean something.** Above the trunk: *ahead of us*, the
  worlds whose stories run past today (near-future branches, collapses, space
  opera). Below: *behind and beside us*, pasts that went otherwise and secrets
  under the present (alternate pasts, hidden histories). Each archetype picks
  its half with `group.side` in its part file, and the halves are named along
  the left edge in rotated type, with the copy in `data/atlas.json -> sides`.
- **Bundles.** Worlds that break with history the same way (the archetypes)
  occupy adjacent lanes in their half, under a faint band tinted in the
  archetype's colour, with a colour bar in the left gutter and a small heading.
  Colour belongs to the archetype and to nothing else.
- **Solid is behind us, dashed is ahead.** Every branch is solid up to today
  and dashed beyond it, and the trunk itself turns dotted past today. Whatever
  is dashed has not happened in any history. The trunk's own labels say which
  way is which: "← the past" at its start, "the future →" past today.
- **Today** is a vertical plane of white light through everything. A white node
  marks every branch that passes through it: those are the futures we are still
  waiting on. An amber dashed ring marks an event real history has already
  contradicted.
- **The past a world leans on.** Events dated before a world's fork are real
  history it depends on. They sit on the trunk, nudged toward that world's
  side, dimmer than branch events.
- **Ghosts.** A world whose fork lies beyond the right edge is not silently
  absent: an italic marker at the edge says "Dune forks in 16000 ->".

The previous chart drew one lane per world with real history repeated inside
each lane. It read as twenty-four project schedules. Do not go back to that:
if a change makes the trunk less singular or the forks less visible, it is
moving the wrong way.

### Two axes, and why there are two

The same tree, drawn twice, because the calendar and the sequence answer
different questions and neither answer is complete on its own.

**Order is the default.** Position is sequence, not date. Forks keep their
*order* and spread across a **fork zone**; each world's beats spread evenly
along its own branch; today is a fixed column at 58% of the width. Nothing is
off-canvas, because there is no window to be outside of.

**Years is the evidence.** The symmetric-log calendar, unchanged. Honest and
complete, but the whole dataset occupies a fraction of one percent of its
x-range: forks squeeze into a few hundred pixels while +/-48,000 years sits
empty. Every legibility fix for three rounds - label gating, ghost markers,
zoom anchoring, fit-everything - was compensation for that.

> The years are the evidence, the order is the story.

Placement rules, all in `55-order.js` behind one `AX` accessor. The renderer
never calls `pxFor`; it asks `AX.fork`, `AX.x`, `AX.end`, and does not know
which axis answered.

| | Order | Years |
|---|---|---|
| fork x | rank within the fork zone, earliest leftmost | `pxFor(divergence.year)` |
| forks after today | first slots right of today, in rank order | same as any other year |
| beat x | evenly spaced along the branch, by side of today | `pxFor(event.year)` |
| prehistory | spread on the trunk in its own order | `pxFor(event.year)` |
| off-canvas | never | genuinely possible |
| today | a fixed column | wherever the year falls |
| label density | follows lane pitch | follows the time span |

**Prehistory is the clearest win.** On the calendar, a two-billion-year-old
artefact and a 2026 event are 180 pixels apart - a false proximity. In Order
they are each one dot, in their own order, and the artefact is exactly as
important as anything else.

**What follows from the axis.** In Order, horizontal pan, shift-scroll,
double-click-to-year and the era presets do nothing, because x is not a
quantity. Those controls are **disabled, not hidden**: a control that vanishes
reads as a bug, a greyed one explains itself. Wheel still changes lane pitch.

Two invariants the tests hold, and one they deliberately do not:
- every event has a target on canvas, because there is no off-screen;
- no strictly later fork ever sits left of an earlier one;
- **ties are legitimate** - Contact and Buffy both fork in 1997 - so equal years
  may share an x, and the check is for inversions rather than monotonicity.

### One canvas, two ways to read

The chart is the page. It fills the viewport under a two-row top bar and above
a one-line legend, and nothing else scrolls. Everything that used to be a
section below the chart now lives in one of two places:

- **Hover** (see below) for anything you can learn without leaving the picture.
- **The explorer panel**, a glass sheet that slides in from the right, with
  three modes: *Worlds* (compact stats, tag filters, and one row per world with
  its distribution bar), a *world* (the dossier tabs, reached by clicking a
  branch, a node or a row), and *About* (the headline, the lede and the method
  notes). Opening a world lights its branch and dims the rest; Escape or a
  click on empty sky steps back out.

The camera is a map camera. Drag pans in both directions. Scrolling or pinching
zooms around the cursor and moves two things together: the time window
(`view.hs`) and the lane pitch (`Z`), so the tree behaves like one picture
rather than a chart with a separate horizontal scale. Horizontal scroll or
shift+scroll slides along time. **Fit** (or the `0` key) frames the home era
with the whole tree in the viewport, and the page opens there: on the fork
cluster, where the argument is legible. The whole dataset is the *Full reach*
preset, one click away. Opening on everything was tried and squashed twenty
forks into a hundred pixels; do not go back to it. Level of detail follows the lane pitch on
screen: below 24px the event labels go, below 15px the titles go too, and a
hovered or selected branch always keeps its labels.

### Hover is a lamp, not a highlight

Pointing at anything lights one lineage and lets the rest fall back:

- **Hover a branch** (or its card, or its row in the distribution panel): every
  other branch drops to a quarter opacity, the hovered one thickens, its nodes
  swell, its fork node pulses, and the trunk turns that world's colour from the
  left edge up to the fork - a literal reading of how long it rode with us.
- **Hover an event**: a ripple leaves the node and the tooltip opens as a scan
  card in the archetype's colour: the event, its in-universe date, how far it is
  from today ("41 years behind us"), which beat of the branch it is, and a small
  bar placing it on the branch with today marked.
- **Move along the chart**: a dashed scrubber follows the pointer with a year
  readout under the trunk and a running count - "1961 · 5 of 24 worlds have
  forked". Past today it reads "years ahead" instead.

These are implemented as CSS classes (`.branch.hover`, `#chart.has-hover`) and a
`.cursor` group that is moved in place, never re-rendered. Anything new that
responds to hover should follow the same rule: one lineage lit, everything else
dimmed, no colour that isn't already on the page.

### Motion is the same idea three times

Branches are strokes that can be shortened back to the trunk, and every
movement in the chart is that one operation:

| Moment | What happens | Where |
|---|---|---|
| First paint | Branches grow out of the trunk, earliest fork first; labels fade in after | `growIn()` |
| Play convergence | Every branch retracts into the trunk, the trunk brightens, a beat, then they regrow | `playConvergence()` |
| Re-sort or filter | Lanes glide to their new rows; forks stay pinned to the trunk | `animateLayout()` |

All three respect `prefers-reduced-motion` and degrade to an instant state.

---

## 2. Tokens

`src/styles/00-tokens.css` is the whole palette, type scale, radii and motion.
Nothing else in `src/styles/` may hard-code a colour or a duration. The only
colours that are *not* tokens are archetype colours, because they are data:
`data/parts/<archetype>.json -> group.color`.

Rules of the palette:

- **One palette: Blueprint.** `--bg` is a pale cool ground with a faint 24px
  engineering grid, `--surface` is the canvas, ink runs dark, and the trunk is a
  deep indigo. The five-theme picker was built, evaluated, and then removed by
  the owner in favour of this one, so `src/styles/00-tokens.css` is now the whole
  palette and `src/styles/themes/` is gone. Adding a second palette back means
  reintroducing that indirection; do it only for a reason.
- **Ink is five steps** (`--ink-0` .. `--ink-4`). `--now` is the present day and
  is the strongest value on the page in every theme: near-black on light, white
  on dark.
- **The trunk carries meaning.** `--trunk` is the one colour that is not an
  archetype and not ink: real history. It is a deep indigo here, and every
  fiction is an archetype colour leaving it.
- **Meaning colours** are reserved: `--flag` means "real history has contradicted
  this", and `--ok/--warn/--bad` are only for confidence ratings and stat bars.
  Never use them for decoration.
- **Archetype colours come from data and are darkened at paint time.** They are
  tuned for a dark ground and measure 1.7-3.0 contrast on this one, below the
  4.5 WCAG AA floor, which made branch labels genuinely unreadable. `paintC()`
  in `60-chart.js` darkens toward black while preserving hue until the colour
  clears AA on `--bg`, and the markup side reads the matching token
  (`--g-<hex>-light`, defined once in `00-tokens.css`) via `colorVars()`. The
  test suite verifies every shipped token clears 4.5:1 on the page ground.

### What was deliberately removed

Gradient-clipped text, radial-gradient page washes, coloured glow shadows,
coloured stripes down the left edge of cards, and pill radii. They read as
generated filler rather than as design, and the archetype colour already carries
the meaning a stripe was pretending to add. A card shows its archetype with a
2px top rule instead. If you are tempted to reintroduce one, don't.

Type: one sans for prose and titles, one mono for anything that is a year, an
axis label, a code-ish tag or a small caps heading. Uppercase headings always
get `letter-spacing: var(--track)`.

Motion: `--ease-out` everywhere; `--t-fast` for hover, `--t-base` for state
changes, `--t-slow` for reveals. The three chart movements have their own
durations in `65-motion.js` because they are choreography, not transitions.

---

## 3. Chart anatomy and the numbers that shape it

All geometry constants live at the top of `src/viewer/10-state.js`.

```
PAD_Y ─┐
       │  [bundle heading]                        <- in the gap above its band
       │  ── outermost lane (earliest fork) ──── title on the outer side
       │  ── ...                             ──── event labels on the trunk side
       │  BUNDLE_GAP
       │  [next bundle]
TRUNK_BAND
═══════════════ trunk ════════════════════|══ ─ ─ ─ ─ (future)
   ticks + year labels under the trunk    today
TRUNK_BAND
       │  [bundles below, mirrored: outermost at the bottom]
PAD_Y ─┘
```

- **Lane pitch** is `LANE_GAP * Z`. Every vertical constant (`PAD_Y`,
  `TRUNK_BAND`, `BUNDLE_GAP`, `LANE_GAP`) is multiplied by the zoom `Z`, so the
  scene at zoom Z is exactly Z times the scene at zoom 1. That linearity is what
  lets `zoomAt()` keep the point under the cursor fixed. `panY` translates the
  scene group; `clampPan()` centres a scene that fits and never lets a taller
  one leave the viewport.
- **Level of detail** is decided in `layout()` from the on-screen pitch
  (`lod` 2/1/0) and applied in `renderBranch` and via `#chart.lod-N` classes.
- **Fork curve**: a cubic from the trunk to the lane over `CURVE_W * sqrt(Z)`
  pixels, shortened for branches that end sooner. The title sits just past the
  curve.
- **Sides** carry meaning (above = ahead of us, below = behind and beside us),
  so every archetype should declare `"side": "above"` or `"below"` in its part
  file; the build warns when one does not and balances it by lane count. The
  left gutter (`LANE_R` = 44px) is reserved for the rotated half labels and the
  bundle colour bars; branches that enter from the left start at its edge.
- **Order on a side**: the world that forks earliest sits outermost, between
  bundles and within a bundle. A later fork then curves to an inner lane
  without crossing an earlier branch's flat run. Crossings only occur across
  bundles with interleaved fork years (Star Trek dropping through two bundles is
  the one case in this dataset, and it is acceptable).
- **Labels**: one row of event labels per lane, budgeted by zoom
  (`labelBudget`) and chosen by importance, then by closeness to the view
  centre. A label is dropped rather than overlapped (`claimRoom`). Titles go on
  the outer side, event labels on the trunk side, so neighbours never fight.

### The time axis

The scale is a **symmetric log around the view centre**:

```
warp(off) = sign(off) * min(log1p(|off| / WARP), 1e4)        WARP = 110
x(year)   = anchorX + (rightEdge - anchorX) * warp(year - c) / warp(hs)
```

- `WARP = 110` is load-bearing: near-linear across the last few centuries, only
  bending for deep time. Do not tune it per view.
- `ANCHOR = 0.5`: the view centre sits mid-width, so an era preset's `from`
  and `to` are the true left and right edges. (The first build used 0.22, which
  made the presets' `from` values fictional; the change is deliberate.) The
  anchor must be a **constant** - deriving it from the viewport breaks the
  mapping's invertibility, which `test-render.js` guards.
- `pxFor` and `yearForPx` are exact inverses. Change both or neither.

---

## 4. Code architecture

`timeline.html` is **generated**. Never edit it. `python3 build-data.py`
validates the data, then assembles the page from `src/` and embeds the data:

```
src/page.html            the markup, with three markers:
                         <!-- @styles -->  <script id="embedded-data">  <!-- @scripts -->
src/styles/NN-*.css      inlined in filename order
src/viewer/NN-*.js       inlined in filename order into ONE IIFE
                         (00-boot.js opens it, 99-go.js closes it)
data/atlas.json          the page copy and era presets for this atlas
data/parts/*.json        the dataset (see data/SCHEMA.md)
```

The viewer modules share one scope by design (no bundler, no imports, works
from `file://`). Keep function names unique and keep each file to one concern:

| File | Owns |
|---|---|
| `00-boot.js` | reading the embedded payload, `normalize`, `boot` |
| `10-state.js` | every constant and every piece of mutable state |
| `20-scale.js` | the time axis (`warp`, `pxFor`, `yearForPx`) |
| `30-format.js` | year formatting, escaping, the `mark()` inline-markup renderer |
| `40-select.js` | filtering, sorting, `overtaken()` |
| `50-layout.js` | the tree layout: sides, bundles, lane rows, trunk position |
| `55-order.js`, `56-moments.js` | the `AX` accessor: where a world's x comes from (Years, Order, Moments columns) |
| `57-moments-page.js` | the Moments page: `momentsModel` (strands, bundles, kinds, endings), the storyline layout, the SVG, its camera and its panel |
| `58-facets.js` | facet similarity: `facetNeighbours`, `facetForward`, the weights |
| `59-chains.js` | chain alignment: `chainKindSim`, `chainScore`, `chainAlign` (local), `chainMSA` (progressive multiple alignment, the map's columns) |
| `92-welcome.js` | arriving: the first-visit card, the News button's count, and `#news=` / `#world=` / `#kind=` links |
| `93-picker.js` | Stories, the phone's front door: the list, a story as a vertical chain, routing by hash |
| `60-chart.js` | drawing: backdrop, trunk, axis, bundles, `renderBranch`, prehistory nodes |
| `65-motion.js` | grow-in, convergence, layout glide |
| `70-interact.js` | pan, zoom, hover, click, tooltip |
| `80-panels.js` | the explorer's Worlds mode: compact stats, tag chips, one row per world with its distribution bar; `refresh()` |
| `85-drawer.js` | the explorer's world mode (dossier tabs, mini chart), `openWorld`/`closeWorld` |
| `90-chrome.js` | archetype chips, era buttons, the camera (`zoomAt`, `zoomBy`, `fitAll`), the panel (`setPanel`), atlas copy, `init()` |
| `99-go.js` | boot |

**Layering inside the SVG**, back to front: grid, today-plane, then the
pannable `g.scene` (bundle bands, trunk, branches, prehistory nodes), then the
today-line and the `g.cursor` scrubber in viewport coordinates. The SVG is the
size of the viewport; the scene is translated by `panY`. Inside a branch group
the hit rectangle (`data-lane`) and event hit circles (`data-ev`) are appended
last so nothing covers them. The starfield is a `<canvas>` under the SVG,
painted once per size, never per frame, and skipped where canvas is
unavailable.

**The Moments page is not the tree.** `renderChart()` branches to
`renderMomentsPage` before drawing anything. The page is a storyline: one
strand per world from its fork to one of three endings, coloured by that
ending, bundling through pills where chains reach the same kind of moment at
the same step of a multiple alignment. It is drawn in our own SVG with the
page's own camera (x and y scale separately at Fit so the map's width fits
beside the panel while its height stays full). No library is involved.

**Rendering model**: `renderChart()` rebuilds the SVG wholesale on every
pan, zoom, filter and animation frame. A few hundred nodes; do not optimise
without measuring. It republishes `window.__timeline` each time - read it
fresh, never cache it.

**Hooks the tests depend on** (`test-render.js`): one `rect[data-lane]` per
visible world (also for ghosts), one `circle[data-ev="<lineage>|<index>"]` per
event inside the drawable range, exactly one `.trunk-core`, `.core` paths that
`playConvergence` arms with their own length, exactly one text starting
`TODAY <year>`, `window.__timeline.{pxFor,yearForPx,focusYear,zoomBy,fit,Z,panY,
sceneH,LANE_R,W,H}`, the panel `#drawer[data-mode]` with `#panel-index`
(`#stats`, `#tags`, `#cards` rows carrying a `.track`) and `#panel-world`
(the `.dtitle`, `[data-tab]` tabs, `#dchart`). Keep those names if you restyle.

---

### Arriving from a link, and news on the map

Most readers arrive from a shared link, often on a phone, knowing nothing.
Four rules follow from that, and they are the owner's:

- **Say what it is first.** The first visit opens a card (`92-welcome.js`):
  the atlas in two sentences, the ending tally, the latest news as the way
  in, and the three things needed to read the lines. Once per browser;
  About can reopen it. A link that names something skips it.
- **News is on the map, not only in a list.** Every item in
  `data/news.json` is a diamond on our history at its date, and the newest
  carries a flag above TODAY with its headline. An item younger than
  `MP_FRESH_DAYS` (30) gets a red NEW badge, a pulse on the flag, and a count
  on the News button. Clicking any of them reads the item against the
  chains: its kind of moment, how the arcs through it end, our chain with it
  added matched against every fiction, then every chain through the kind.
- **Selections are links.** Choosing news, a world or a kind writes
  `#news=<date>`, `#world=<id>` or `#kind=<id>`; a post can link straight to
  the reading it describes.
- **The phone is designed first, not adapted** (`93-picker.js`, below
  720px, everything hangs off `body.phone`). A reader arrives from a link,
  has a minute, reads a story or two and maybe shares it, so the phone is a
  small app: a slim header with a share button, a tab bar at the bottom
  (Today, Ranking, Stories, Map, About), and screens that read top to bottom. *Today*
  leads with the news, then the stories closest to our road as a swipeable
  rail, our road lately as a tappable timeline, how the stories end, and more
  news. A story is a hero image, its fork, its chain as a vertical timeline to
  its ending, a share button, and the stories that walked part of the same
  road. A kind of moment, a news item, one of our own moments and an ending
  each open as compact rows of stories with *what came next*, never as chips.
  Every screen is a history entry, so back works and any screen can be
  linked. No modal on arrival; 16px text, 44px targets, safe areas, lazy
  images, and a coloured initials tile where a world has no plate yet. The
  map is a tab, with pinch, floating zoom and a bottom sheet.
- **The desktop is the phone, laid out for width** (`body.shell`, set on
  every real page). The same screens, with the tabs in the header instead of
  a bottom bar, and each screen split into a main column and a sticky side
  column (`.pk-main` / `.pk-aside`, stacked on a phone): Today puts the news
  and a grid of the closest stories on the left and our road in the side
  column; a story is a wide hero, its chain on the left, and on the right its
  ending, share, the real photo and the stories that walked part of the same
  road; Stories is a card grid under one row of tools. The Map tab is the
  full Moments canvas with its tools and reading panel, which is where the
  canvas earns its space. The test harness has no `location`, so it keeps the
  bare canvas and its tests unchanged.
- **Which story are we in?** (`94-ranking.js`, the Ranking tab, `#rank`).
  Our own road is split into threads by what each moment is about (war and
  power, machines and science, space, markets and plagues), because in four
  years we lived a war, the machines and the Moon at once while a story walks
  one road. Each thread's last five kinds are aligned in order against every
  story's chain, anchored at our end (the match must end on a real match, and
  each of our steps after it costs), with a quarter of the fit from how alike
  the situations were by facets. A story's fit is its thread fits averaged,
  each thread weighted by how recently it moved (half after `RK_HALF` years).
  Fits become shares by softmax and are always labelled *a share of the fit,
  not a forecast*. The screen: the top candidate explained (our moments beside
  its moments, thread by thread, then what comes next there and its ending),
  each thread's own top three, every story ranked with its move since our
  last moment, the leader replayed after each of our last ten moments, and
  "if the next headline is…" for next steps the leaders take that have
  happened to us before. Today features the leader and the next six; a story
  shows its rank. The constants at the top of the file are the argument.
- **A shared link has a preview.** The build writes Open Graph and Twitter
  tags from `share` in `data/atlas.json`, and writes the full page to
  `index.html` too, so the site root is the atlas itself: link previews are
  read from the first page fetched, without script.
- **Fewer tools on the Moments page.** Eras, the time slider, the label
  toggle, the sort and the archetype chips act on the tree and are hidden on
  Moments. On a phone (< 720px) the bar is one compact block, the legend is
  gone, the panel is a bottom sheet, and the map opens readable on our
  history and the first steps rather than squeezed to fit.

## 5. Extending it

### Add a world
Edit the relevant `data/parts/<archetype>.json`, following `data/SCHEMA.md`.
Optionally add a dossier under `data/parts/worlds/`. Run
`python3 build-data.py`. For a world researched elsewhere (an agent, a
contributor), `python3 tools/world-brief.py` prints the brief — the rules,
the bins, the facet vocabularies, the ids a dossier may connect to — and
`python3 tools/check-world.py <file>` vets the result (`--merge` adds it). Nothing in `src/` changes: the layout, colour, side
and ordering all derive from the data.

### Add an archetype
Create `data/parts/<id>.json` with a `group` block (`id, name, tagline,
question, divergenceMechanism, color`, optional `side`) and its lineages. Add
the id to `data/groups.json -> order` (this is the reading order and the
side-balancing order). Check the new colour on the chart against the others.
Rebuild.

### Make a different atlas
Replace `data/parts/`, `data/groups.json` and `data/atlas.json`. The atlas file
carries the title, headline, lede, trunk label, era presets, section copy and
the method notes - the viewer contains no science-fiction-specific text.
Inline marks in atlas copy: `**bold**`, `*italic*`, `` `code` ``, `==now==`
(the present-day highlight). Era presets are `{label, from, to}` with honest
edges; `defaultEra` indexes into them. Because the axis is a symmetric log
around the centre of `from..to`, put the centre where the detail should be
(for this atlas, the fork cluster around 2000) and let the edges run wide.

### Change the look
Tokens first (`00-tokens.css`). If a change needs a new colour with a new
meaning, add a token and document the meaning here. Chart shapes live in
`60-chart.js` and `20-chart.css`; keep the class names in section 4.

### Verify
```
python3 build-data.py
python3 test-fixture.py && node test-viewer.js && node test-render.js timeline.html
```
Then look at it. The headless suite proves the tree is complete and the
interactions do not throw; it cannot judge whether the picture is beautiful.
Open `timeline.html` at ~1500px wide, hit each era preset, play the
convergence, open a drawer. The checklist that matters:

- Is the trunk the single brightest continuous line, and is it drawn once?
- Can you find every fork without reading a label?
- Does today read as a plane through everything, with its white nodes?
- Do titles and event labels stay off each other at every preset?
- Does every archetype colour survive at 2px on the dark ground?

---

## 6. Visual review checklist

The headless suites prove completeness, not legibility. A change is not done
until it has been opened in a real browser at ~1500px and walked through this
list. `BRIEF-order-axis.md` and `HANDOFF.md` both refer to this section.

**Framing**
- [ ] Opens on the intended framing, and the whole tree is reachable from it.
- [ ] Nothing important is off-canvas at the default view (the suite reports
      off-screen events; read them, do not just check it passed).
- [ ] Every era preset lands somewhere legible, including the widest.

**Legibility without hovering**
- [ ] Anything you cannot read without hovering is named on the canvas. This is
      the standing rule; hovering is a bonus, never the only route to a fact.
- [ ] Branch titles and event labels do not collide at any zoom the presets
      reach. Check the fork cluster specifically, where lanes bunch.
- [ ] Text stays above 4.5:1 against whatever it sits on, in every theme and on
      the art plate behind the chart.

**The picture still argues the thesis**
- [ ] One trunk, not one per world. If a change multiplies the trunk, stop.
- [ ] Forks remain the most legible event on any branch.
- [ ] Today is singular and unmistakable.
- [ ] Colour still means archetype and nothing else; amber still means only
      "contradicted by real history".

**Interaction**
- [ ] Zoom in and out from the opening view; the content magnifies rather than
      sliding away, and nothing collapses to a strip.
- [ ] Pan both axes and hit the edges; nothing becomes unreachable.
- [ ] Click a branch, then a node, then step back out. Open Worlds, then a
      world, then About, then News.
- [ ] Keyboard: arrows pan, +/- zoom, 0 fits, Escape backs out.

**Content**
- [ ] Every image is labelled for what it is: a generated plate is not passed
      off as a photograph, and an openly-licensed one keeps its attribution
      and licence link.
- [ ] No placeholder or lorem text reached the page.
- [ ] Empty states (no news, no dossier, no art) read as deliberate.

## 7. Decisions that look like mistakes but are not

- **The chart is the page.** There is no scrolling document; the tree fills
  the viewport and the reading happens in the panel. Do not reintroduce
  sections under the chart - put new material in a panel mode or on hover.
- **Zoom moves time and pitch together.** A separate horizontal zoom felt like
  a spreadsheet. If a user needs the time window alone, the slider and the era
  presets do that; the wheel stays coupled.
- **Star Trek crosses two bundles.** Earliest-fork-outermost is the right
  global rule; one long drop is the cost of keeping the far-future space operas
  together. Do not special-case it.
- **Events before a fork sit on the trunk**, not on the branch, even when the
  fiction invented them (Hogwarts in 994). The schema calls that phase
  *prehistory* and the chart honours the schema; if the data is wrong, fix the
  data.
- **Wheel zooms the canvas.** There is no page to scroll any more, so this is
  no longer a trap; horizontal wheel and shift+wheel slide along time.
- **Generated files are committed** so a fresh clone opens with no build step.

---

## 8. Imagery

Two kinds of picture, deliberately kept distinct in the UI:

| | Source | Provenance shown |
|---|---|---|
| **Illustrative plate** | `assets/<id>.jpg`, generated from `tools/art-direction.json` | "Illustrative plate, generated with <model> - not a still from any adaptation." |
| **Real counterpart** | `assets/pd/<id>.jpg`, fetched from Wikimedia Commons by `tools/fetch-pd.py` | author, licence (linked) and source file |

The derived sizes and both credits files are committed; the 2K sources
are gitignored (73 MB, regenerable from the prompts). All are referenced by
**relative path**, not embedded: a data URI
would add megabytes to `timeline.html`, and a runtime fetch is blocked over
`file://`.

`tools/gen-art.py` prompts describe **technique, era, palette and mood only** -
never a franchise's characters, vessels, logos or named places. That keeps the
output clear of derivative work and is also the only kind of prompt the image
model will accept.

`tools/fetch-pd.py` verifies the licence of every file **at fetch time** against
`allowLicenses` in `tools/pd-sources.json` and refuses anything else rather than
guessing. Attribution is not optional: CC BY requires credit and a licence
reference, so the drawer links both. Only nine worlds have a real counterpart -
a photograph is used only where a genuine one exists and is verifiably open, and
padding coverage with guesses would weaken the pipeline rather than strengthen
the page.

Derived sizes come from `tools/derive-art.py` (1000px drawer header, 560px canvas
field); the 2K sources are ~55 MB and must never be referenced directly.
