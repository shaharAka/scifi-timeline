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

### 2.3 The picture (built 2026-09-17: strands - one chain per world, converging on three endings)

Moments is its own page, not a mode of the tree. It has its own camera and its
own panel (`src/viewer/57-moments-page.js`), and it is drawn in our own SVG
with no library. Two earlier versions - a flow graph of kinds with counted
roads, and before it an arc diagram - were removed: a graph with one node per
kind is first-order Markov, and the stories are not memoryless. What follows a
kind of moment depends on the chain that led there. So the unit here is the
chain.

- **One strand per world.** It leaves our history at its fork (nothing before
  the divergence is on it: that was shared with us) and runs right through its
  kinds of moment to one of three endings. Left to right is position along
  the chain, never a date. Strands that fork ahead of today leave from a short
  dashed stretch of trunk after TODAY and are drawn dashed.
- **Every strand is coloured by how its arc ends**, along its whole length:
  green ends well, red ends badly, grey still open. The three endings are
  boxes at the right edge, with counts. Our own history is the heavy trunk to
  TODAY, then a dotted line into *still open*, because we are inside our
  chain.
- **A pill is where two or more strands reach the same kind of moment at the
  same step of the alignment**; they bundle through it and split after. A kind
  one strand reaches alone is a small mark. The same kind can appear at
  several places on the map: that is the point. At overview zoom, bundles of
  two are drawn as knots with a count; zoom in for the labels.
- **Columns are a multiple alignment of the chains** (`59-chains.js`,
  `chainMSA`): a progressive profile alignment where the same kind scores 1, a
  facet-like kind scores part (`chainKindSim`: mean facet likeness between the
  moments of two kinds), unlike kinds may share a column almost free, opening
  a new column costs, skipping one costs a little. The map is as many columns
  as the longest chain. Vertical order is a storyline layout: home rows by
  ending (well above the trunk, open around it, badly below), then three
  sweeps that pull strands together where they bundle and keep groups apart.
- **Matching is by chain, not by step.** `chainAlign` is a local alignment
  (Smith-Waterman) of two chains; its likeness is the score over the shorter
  length. The opening panel aligns *our last six kinds of moment* against
  every fictional chain and reads what each world did after the matched
  stretch, with its ending. A strand's panel does the same for that chain. A
  beat's panel does it for our chain up to that beat, above the single-moment
  situation match from the facets.
- **Clicks**: a strand lights alone and its panel shows the chain, the moments
  behind it (with who it bundles with at each step), and the chains most like
  it. A pill's panel shows every chain through that kind, whole, this step
  marked, grouped by where on the map they reach it, the clicked bundle first,
  and how the arcs through the kind end. An ending's panel shows the last
  kinds before it, what the chains that end there have in common, and each
  world with its reason. A dot on the trunk runs the chain match and the
  situation match. Empty canvas clears. Clicks are dispatched from the svg's
  pointerup using the pressed element (`data-strand`, `data-pill` =
  `kind@column`, `data-ending`, `data-real`), so they survive pointer capture.
- **Camera**: Fit squeezes the map's width into the canvas beside the panel
  but keeps its full height, so the strands spread; wheel zooms both axes
  alike from there, drag pans, Fit resets.

### 2.4 Code and tests

- `59-chains.js`: `chainKindSim()`, `chainScore(a, b)` (1 .. -1),
  `chainAlign(a, b)` -> `{score, likeness, pairs, a0, a1, b0, b1}`,
  `chainMSA(chains)` -> `{C, cols}`. The five numbers at the top of the file
  (`CH_GAP`, `CH_MISS`, `CH_INS`, `CH_SKIP`, `CH_SAME`/`CH_FAR`) are the
  argument; change them there and nowhere else.
- `57-moments-page.js`: `momentsModel()` builds strands (`seq`, `kinds`,
  `cols`, `kindAt`, `ending`), `bundles`, `kinds` (with `hits` and
  `outcomes`), `endings`, `tally`; `momentsLayout(M, width)` places the trunk,
  the fork zone, the columns and the endings and returns `pills` and `marks`;
  `renderMomentsPage` draws; `renderMomentsPanel` routes to
  `mpBeatHtml` / `mpStrandHtml` / `mpEndingHtml` / `mpKindHtml` / the opening
  panel; `mpQueryHtml(M, kinds)` is the chain match. State is `MP.node`
  (a kind or an ending id), `MP.col`, `MP.world`, `MP.beat`.
- Tests (`test-render.js`): one strand per world with a post-fork chain, one
  column per step and strictly increasing, no pre-fork moment on a strand,
  every strand from its fork to an ending, pills are kind+column with two or
  more strands that all have that kind there, three endings with counts from
  the data, a dot per real beat, identity alignment scores 1 and a chain is
  fully alike itself; a pill click selects kind and step and leads the panel
  with that bundle and dims the other strands, a strand click lights it alone
  and matches it, a second click unlights, an ending click selects it, a beat
  click runs both matches, empty canvas clears, wheel zooms, drag pans, Fit
  resets, a news item selects its kind. The shim renders the same SVG the
  browser does.

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
