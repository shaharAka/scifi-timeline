# Brief — order, not dates

For the agent picking this up. Read HANDOFF.md and DESIGN.md first; this
document is the next piece of work, in the order it should be done.

## 0. What the owner said, and what it means

> "I think the dates are causing an issue. I want to align on how things are
> ORDERED, not WHEN they happen - convergence happens when different events
> occur."

The calendar has been the axis since the first build. It is honest and it is
the evidence, but it makes the picture about *when*: a 100,000-year warp,
forks crammed into a hundred pixels, Star Wars at the far left because of an
opening crawl. The owner wants the picture to be about *sequence*: what
happens first, what happens next, and where different worlds pass through the
same kind of moment. "Converges on today" stays the thesis; today becomes the
one shared point in every world's sequence, not a year.

Two views come out of that, built in this order. The calendar view is kept
as a third: **the years are the evidence, the order is the story.**

| Phase | View | Data change | Size |
|---|---|---|---|
| 1 | **Order** — each world as a sequence of beats, aligned on today | none | one or two days |
| 2 | **Moments** — shared stages as columns; branches converge where they share a stage | `stage` on every event | data pass + one or two days |
| 3 | Order the worlds themselves by how alike their sequences are | none | optional |

Do not remove the Years view or the warp maths (`20-scale.js`). Phase 1 adds an
axis mode beside it.

---

## 1. Phase 1 — the Order view

### 1.1 The picture

Same tree: one trunk, branches leaving it, two halves (ahead of us / behind
and beside us), tinted bundles, today as the plane of light. Only the
x-position rule changes:

- **Today** is a fixed column, `nx = LANE_R + 0.58 * (W - LANE_R - PAD_R)`.
  Everything left of it has happened, everything right of it has not. The
  trunk is solid to `nx` and dotted after, as now.
- **Forks** keep their *order*, not their dates. Rank the visible worlds by
  divergence year. Worlds that fork before today share the **fork zone**
  `[LANE_R + 0.10*(nx-LANE_R), LANE_R + 0.48*(nx-LANE_R)]`, spaced evenly by
  rank (earliest leftmost). Worlds that fork after today (Star Trek, Fallout,
  The Matrix, Warhammer, Dune, Foundation) take the first slot right of today
  in *their* rank order, so their branch leaves the trunk in the dashed region.
  Every world is on canvas; there are no "forks in 16000 →" edge markers in
  this view.
- **Beats** (events with `year >= divergence.year`) spread evenly along the
  branch. Beats before today: `x_i = forkX + (nx - forkX) * (i / kBefore)` for
  `i = 0..kBefore-1` where beat 0 is the fork itself, so the last pre-today
  beat sits just short of today. Beats after today:
  `x_j = nx + (right - nx) * ((j + 1) / (kAfter + 1))`, so the last one is not
  on the edge. A world with no beats after today ends with the hollow cap; a
  world with beats after today crosses today with the white node, dashed
  beyond.
- **Prehistory** (events before the fork) stay on the trunk, spread evenly in
  `[LANE_R + 8, forkX - 12]` in their own order. The Expanse's 2-billion-year
  ring builders are one dot at the left, exactly as important as they are.
- **No year axis.** Under the trunk, instead of ticks: `← beats before today`
  left of `nx` and `beats after today →` right of it, in the axis-label style.
  The fork zone gets a faint band and a caption `worlds leave our history, in
  the order they do`. Keep the "REAL HISTORY ← the past" and "the future →"
  trunk labels.

Vertical alignment now means "the same number of beats from today", not the
same year. Say so in the About panel and in DESIGN.md.

### 1.2 Code

- `10-state.js`: `var axisMode = "order"` (the default; `"years"` is the other).
  Read the default from `ATLAS.defaultAxis` if present.
- Introduce one accessor object the renderer draws from, so `renderBranch`
  and `renderPrehistory` stop calling `pxFor` directly:

  ```js
  // built once per render, for the visible list
  var AX = {
    now:  nx,
    fork: function(l){...},          // x of the fork
    beat: function(l, e){...},       // x of an on-branch event
    pre:  function(l, e){...},       // x of a pre-fork event, on the trunk
    end:  function(l){...},          // x where the branch stops (or right edge)
  };
  ```
  In Years mode every function is `pxFor(year)`. In Order mode they use the
  rank rules above. Everything else in `renderBranch` (curve, halo/core,
  solid/dashed split at `AX.now`, title, labels, hit targets) stays as is.
- Put the Order placement in a new `55-order.js` (between layout and chart):
  `placeOrder(list, left, right)` returns per-world `{fork, beats:[x...],
  pre:[x...], end}` and the fork-zone bounds for the caption.
- Camera in Order mode: the x-axis always fills the width, so horizontal zoom
  and pan have no meaning. Wheel zooms `Z` only (lane pitch), drag pans
  vertically only, the era presets and the time-span slider are disabled
  (greyed, not hidden, with a title saying "years view only"). `fitAll()` fits
  the tree vertically. In Years mode nothing changes.
- The scrubber (`cursorMove`) in Order mode reads `before today` / `after
  today` / `the fork zone`, no year, no count.
- The Worlds panel rows keep their calendar distribution bar; it is the one
  place the calendar still shows at a glance, and it is honest there.
- Toggle: a two-segment control `Order | Years` in the top bar, next to the
  era presets. Persist nothing; the atlas default wins on load.

### 1.3 Tests

Add to `test-render.js`, in Order mode:

- every event has a `data-ev` target on canvas (there is no off-screen);
- fork x increases with divergence year across visible worlds (rank order
  preserved), pre-today forks all `< nx`, post-today forks all `> nx`;
- for each world, beat x is strictly increasing, pre-today beats `< nx`,
  post-today beats `> nx`;
- exactly one `TODAY` cap, exactly one `.trunk-core`;
- switching to Years and back leaves the lane count intact.
Keep all existing Years-mode assertions; run the suite in both modes.

### 1.4 Acceptance

Open at 1500px in Order mode. Without hovering you can answer: which worlds
have already left us and in what order; which have not yet; how many beats
each world has before and after today; which worlds end before today. Then
switch to Years and the same tree reads as evidence for the same claims.

---

## 2. Phase 2 — the Moments view

### 2.1 The claim, and the use it serves

The atlas is read from today's news. A real event is matched to the kind of
moment it is, the worlds that passed through that kind of moment light up, and
each is read forward from that node: what followed, in what order, how it
ended. Many futures for one present. Fictions converge not on dates but on
kinds of moment, so the vocabulary of kinds is the matching key, and its
granularity is set by the use: fine enough that a real headline lands in one
bin, shared enough that several worlds pass through it, and consequential
enough that what follows is worth reading.

The vocabulary is not fixed in advance and not shaped by heuristics. Two model
runs over the whole set fragmented it (54 bins, a third of them one world),
because a bin's definition was written from the first event that created it;
so the current 32 bins were built by hand from all 237 events with the use
above in mind, and every bin spans at least three worlds. `tools/bin-events.py`
remains the way to bin a NEW world's events into the existing vocabulary
(the model is told the project and the target and left to judge); grow the
vocabulary by editing `data/bins.json`, deliberately.
`data/bins.json` is the result and the thing to argue with; each bin carries a
definition in world-neutral terms and an example real headline that would
belong to it. News items (`data/news.json`) are binned with the same
vocabulary, which is what makes the match possible.

### 2.2 The vocabulary

`bin` on every event points into `data/bins.json` (see `data/SCHEMA.md`,
"Bins"). Publication dates are `null`; real-world events a fiction leans on
before its fork are binned, because they are where a world's future touches
ours. When the vocabulary looks wrong, change the task description in the
tool's prompt or edit `bins.json`, never add rules about bin counts or sizes:
the model is the one making the call, and it needs the target, not guardrails.

### 2.5 Facets: what the matching actually runs on (landed 2026-09-17)

A single bin conflates moments that share no future (Iran 1979 and the
Enabling Act are both "power is seized"). So every event now carries a
**moment signature** - `facets` in the event schema, closed vocabularies in
`data/facets.json`, documented in `data/SCHEMA.md` - and matching runs on the
facets, with the bin kept as the coarse label for column headings:

- match on the SITUATION: mechanism, actor, position (inside / below / outside /
  above), scope, domain, the four-axis direction vector, preconditions;
- hold OUT the outcome: it is what a match is for, read from the neighbours.

`tools/facet-match.py` is the reference implementation: neighbours of any
moment with similarity 0..1 (under ~0.5 means nothing close) and each
neighbour's next beats read forward. `data/real-history.json` is our own arc
in the same schema, 40 beats from 1903 to the news items, published as
`payload.real`; it is the trunk's own chronology and the anchor for every bin.

What this means for the views:

- **News → futures** matches a news item by facets, not by bin. Bin the news
  item AND facet it (the facet fields are small judgements the model makes
  well); its neighbours are the fictional moments with the most similar
  situation; each neighbour's world is read forward from that node.
- **The trunk gets its own beats** from `payload.real`, drawn as one shared
  row; clicking a real beat is the same operation as choosing a news item.
- **The Moments view** keeps bins as columns. Within a column the branches can
  be ordered by facet similarity to the selected moment so the closest futures
  sit together.

Known coarseness to fix next: two moments with the same mechanism, actor,
position, domain and direction can still be different acts (a law banning
vigilantes and a law declaring the Moon landings fake both read as
law / state / inside / national / political, power up, openness down). A
`target` facet - what is acted on: a group, a state, territory, knowledge, a
technology, an enemy - would separate them. Add it to `data/facets.json` and
to every event before adding worlds, not after.

### 2.3 The picture (built 2026-09-17: the Moments page, a flow of kinds anchored on us)

Moments is its own page, not a mode of the tree. Nothing of the tree is drawn
on it and it has its own camera and its own panel (`src/viewer/57-moments-page.js`).
The question it answers is *what leads to what*, so it is a directed graph,
not a line: the arc-diagram and the column versions before it were still a
timeline in disguise and were removed.

- **One circle per kind of moment**, sized by how many worlds pass through it.
  Kinds our own history has passed through (22 of 33) have a heavy border in
  the trunk colour; the kind we are in now has a double border. Kinds only
  fiction has reached are plain.
- **Roads are edges**: a transition a fiction makes between two kinds after it
  has forked, drawn once per pair, weighted by how many worlds take it, dashed
  where it lies ahead of today. Pre-fork moves are not roads (the world was
  still with us). A road only one world takes is a whisper (7% opacity) until
  something is chosen. **Our own path** is the dotted line in our colour.
- **Every arc converges on an ending.** Three sinks stand at the right edge of
  the map: *ends well*, *ends badly*, *still open*. Each world's last kind of
  moment runs into the one its `ending.valence` names (data/SCHEMA.md,
  Endings), and our own path runs into *still open* because we are inside it.
  This is what makes the page predictive rather than descriptive: a kind of
  moment's panel opens with a three-colour bar, "of the worlds through this,
  so many ended well, so many badly, so many are open", every world card
  carries its ending as a badge, and the situation match shows where each
  nearest fiction ended up. Click a sink for the last kinds before it and every
  world that ends there with the one-sentence reason for the call.
- **Layout is left to right by what leads to what**, ranked by dagre on the
  shared roads, our path and the roads into the endings. Ranking on every private road spread the map
  over four thousand pixels; one world's detour is not the shape of the story.
  Kinds no shared road or real step touches sit in a row underneath, at the x
  their story position implies. There is no date and no rank of first visit
  anywhere in the placement.
- **Nothing is coloured by world until asked.** Tap a circle: roads not
  touching it recede, the neighbourhood stays lit, and the panel shows the kind,
  its definition and example headline, *Happened to us* (each real beat as a
  button), *What leads here* and *What it leads to* (counted, with bars, naming
  the worlds), and every world through it with its moment there and its next
  three beats. Click a world's name to light its whole road in its colour, with
  the shared-with-us part dotted. Click a real beat for the situation match: the
  beat's signature, then the nearest fictional moments by facets with their
  scores and what followed. Tap empty canvas to clear.
- **Camera**: wheel zooms around the cursor, drag pans, the +/- buttons and
  Fit work. The page opens with our path framed at a readable zoom, the right
  edge of the map (where today sits) just inside the view; Fit shows the whole
  map inside the part of the canvas the panel does not cover; choosing a circle
  pans the least distance needed to keep it out from under the panel. Labels
  hide below a readable size rather than shrink to dust.
- **Rendering**: Cytoscape.js with the dagre layout, vendored under `vendor/`
  and loaded by `<script src>` from `src/page.html`, so the page still works
  over `file://` and needs no build. When the vendor scripts are absent (the
  Node test shim) the page falls back to an SVG flow drawn by the same model
  (`momentsLayout`, `mpRoadPath`) with the same clicks, dispatched from the
  svg's pointerup using the pressed element so they survive pointer capture.

### 2.4 Code and tests

- `57-moments-page.js`: `momentsModel()` builds `{nodes, roads, ours, paths,
  at, order, todayIndex, lastReal}` from the bins, the real history and each
  world's post-fork sequence; the three ending sinks (`MP_ENDINGS`) are nodes
  with `ending:true`, every kind carries `outcomes` (the worlds through it by
  valence), a road with `ending:true` runs from each arc's last kind into its
  sink, and the last step of `ours` runs into `ending-unknown`; `renderMomentsCy(M)` keeps one Cytoscape instance
  and rebuilds elements only when `mpSignature(M)` changes; `mpCyLayout`,
  `mpCyFit`, `mpCyHome`, `mpCyReveal` are the camera; `renderMomentsPanel`
  writes into `#moments-body` (`mpKindHtml`, `mpBeatHtml`). Selection state is
  `MP.node / MP.world / MP.beat` and is applied as classes (`selected`, `dim`,
  `touch`, `faded`, `world`, `on-world`).
- `60-chart.js` branches to `renderMomentsPage` before any tree drawing;
  `90-chrome.js` routes `zoomBy` / `fitAll` / boot to the Cytoscape camera
  when `MP.cy` exists.
- Tests (`test-render.js`, fallback path): node count equals kinds in use,
  road count equals distinct post-fork transitions, our path equals consecutive
  real kind transitions, TODAY marker present, a tap on a circle selects it and
  opens the panel with one `.mp-card` per world and a *What it leads to*
  section, non-touching roads fade to `0.04`, a world button lights
  `.mp-world-road`, a beat button shows *Nearest situations*, empty canvas
  clears, `matchNews` selects the kind; three sinks whose counts match the
  data, every arc runs into exactly one, ours into *still open*, a kind's
  outcome tally sums to its worlds, a sink's panel lists one card per world
  with its reason. The shim loads no vendor code, so the
  Cytoscape path is verified in a browser (see HANDOFF §6).

---

## 3. Phase 3 — optional: order the worlds by likeness

Once every event has a stage, each world is a sequence of stages. Worlds with
similar sequences are alike in shape even when their genres differ. A sort
option "Sort: by story shape" orders lanes within each half by similarity
(edit distance between stage sequences, or simpler: shared-stage count), so
converging worlds sit next to each other and the picture argues the grouping
as well as showing it. Keep archetype bundles as the default.

---

## 4. Working rules

- Edit `src/` and `data/`, never `timeline.html`; `python3 build-data.py`
  then the three suites after every change.
- Look at it in a real browser at ~1500px after every visual change and walk
  DESIGN.md §6; the headless suite proves completeness, not legibility.
- Anything that cannot be read without hovering gets named on the canvas.
- Update DESIGN.md (a new section per view, with the placement rules above),
  HANDOFF.md §9, and README when a phase lands. One commit per phase, message
  in the style of the log.
