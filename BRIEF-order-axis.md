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

### 2.3 The picture

- Columns are bins, ordered left to right by the mean position of their
  events within their worlds' sequences (an arc the events produce
  themselves), each with a header (`THE TRUTH COMES OUT · 12 worlds`) and a
  faint band. Today is **not** a column in this
  view: it is the vertical plane still, placed by the atlas's `todayStage`
  (default `regime`, the column most worlds are "at" now; make it data).
- Each branch visits its stages **in canonical order**, ties broken by year,
  so no branch runs backwards. The world's own chronology is preserved in the
  tooltip ("beat 4 of 11 in this world's order") and in the Years view.
- A branch's node in a column is one event; several events in one stage
  stack as a short vertical cluster on the branch.
- **Convergence is the column's density.** The header count, and a soft glow
  on the band proportional to how many worlds pass through it. Hovering a
  column header lights every branch through it and dims the rest (reuse
  `setBranchHover` with a set, or add `setBranchHoverMany`).
- Forks: every branch leaves the trunk at its first binned event's column.
- **News → futures**, the reason the view exists: choosing a news item in the
  News panel selects its bin, lights every branch through that column, and
  draws each of those branches from that node forward at full strength, dimming
  what came before. The panel lists the futures side by side: for each world,
  the next three or four beats after the match, with their bins, so the reader
  can see what followed where, and where the futures agree.

### 2.4 Code and tests

- `56-moments.js`: `placeMoments(list, stages, left, right)` returns the same
  shape as `placeOrder`, plus `columns:[{stage, x0, x1, worlds:Set}]`.
- The `AX` accessor gets a third implementation. The toggle becomes
  `Order | Moments | Years`.
- Tests: every non-publication event has a stage and a `data-ev`; a branch's
  node x never decreases along its beats; column counts equal the number of
  distinct worlds with an event in that stage; hovering a column header adds
  `.hover` to exactly those branches.

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
