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

### 2.1 The claim

Fictions converge not on dates but on *kinds of moments*: the thing arrives,
the war, the collapse, the new regime, the reckoning. If every event carries a
stage from one small vocabulary, the stages become columns and branches
visibly pass through the same column when they share a moment. That is what
"convergence happens when different events occur" looks like.

### 2.2 The vocabulary

Add `stage` to the event schema (`data/SCHEMA.md`), required, one of:

| stage | meaning | typical events |
|---|---|---|
| `origins` | deep background the story leans on | ring builders, founding of Hogwarts |
| `fork` | the divergence itself | the shot that misses, the recovery at Roswell |
| `arrival` | the thing arrives or is found | first contact, the signal, the monolith |
| `secret` | knowledge kept from the world | the cover-up, the Ministry, the Watchers |
| `awakening` | a power comes into being | Skynet, the Machines, the Guild |
| `war` | the war, the bomb, the plague | the Great War, Judgment Day, the virus |
| `collapse` | society falls | the oil war, the wasteland, the Vault opens |
| `regime` | a new order rules | the Empire, the Party, the Reich |
| `exodus` | leaving, migrating, colonising | Mars, Terminus, the Endurance |
| `resistance` | rebellion, return, the fight back | Yavin, the Rebellion, Zion |
| `reckoning` | the truth out, judgement, the reveal | the Reformation fails, the Mule |
| `aftermath` | long after; legacy, decline, renewal | the Second Empire, sixty years on |

Rules: one stage per event, chosen from the event's own text, never from how
famous the year is; `kind: publication` events take `stage: null` and are not
drawn in this view; the validator hard-errors on an unknown stage and warns
when a lineage has no `fork`-staged event. Tag all 237 events in
`data/parts/*.json`; this is a research pass, so record the reasoning in each
event's `note` where it is not obvious.

### 2.3 The picture

- Columns in the canonical order above, left to right, each with a header
  (`ARRIVAL · 9 worlds`) and a faint band. Today is **not** a column in this
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
- Forks: every branch leaves the trunk in the `fork` column; within it, rank
  by divergence year as in Phase 1 so the order of leaving is still legible.

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
