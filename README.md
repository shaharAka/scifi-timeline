# Where We Are Now — a converging timeline of science fiction

An animated dashboard that puts fictional histories on the **real-world calendar**,
shows where each one stops agreeing with us, and lets you step inside any of the
twenty-four worlds.

Open **`timeline.html`** directly in a browser. No server, no dependencies — the
page carries its own copy of the data so it works from `file://`.

`timeline.html` is **generated**: `python3 build-data.py` assembles it from the
viewer source in `src/` and the data in `data/`. Edit those, never the output.
The visual language and the code layout are documented in **`DESIGN.md`** —
read it before changing how anything looks.

## The atlas

The chart is the page: one canvas that fills the window, with a two-row top bar
and a one-line legend. Drag to pan, scroll or pinch to zoom around the cursor
(time window and lane pitch move together), horizontal scroll to slide along
time, **Fit** to frame the whole tree. Everything else lives in the explorer
panel on the right - **Worlds** (stats, tag filters, one row per world with the
bar showing where its charted time sits against today), a **world** (opened by
clicking any branch, node or row), and **About**.

- **Stat strip** — how many worlds, how many dated events, what share of them the
  fiction states outright, how many are genuinely contested, and how many have a
  dossier behind them. In the Worlds panel.
- **The convergence chart** — a tree. Real history is one luminous trunk drawn
  once, with the year axis on it; every world is a branch that peels off at its
  divergence year and settles into its own lane, above or below, bundled by
  archetype. Today is a plane of light through everything, with a white node
  wherever a branch passes through it. Branches grow out of the trunk on first
  paint and glide to new rows when you re-sort.
- **Play convergence** — the signature animation. Every branch retracts into
  the trunk, the trunk brightens, and then they all grow out again. It is the
  thesis of the whole chart, performed.
- **Where the charted time sits** — the bar on each world's row in the Worlds
  panel, so you can see at a glance which fictions live in our past and which
  run far past us.
- **Enter a world** — click a branch, a node or a row; the dossier opens in the
  panel and the branch lights up in the chart.

## Going deeper into a world

Every world's panel has three tabs:

| Tab | What it gives you |
|---|---|
| **The world** | What the place is like to live in, the conflict underneath it, who holds power, what the technology does and conspicuously refuses to do, its emotional register, themes and tags, its important places, its factions, and which other worlds it genuinely connects to. |
| **Full chronology** | A mini-timeline plus every charted event with its real year, its in-universe label, its tier and phase, and a confidence rating. |
| **Where to start** | One to three entry points, most accessible first. |

Tags are clickable and filter the entire dashboard. Connections are clickable and
walk you to the related world, so you can follow Star Wars to Dune to Foundation
without going back to the chart.

Drawers carry a `spoilers` badge when a dossier unavoidably gestures at a late
reveal, so you know before you read.

---

## What the chart shows

The chart is a tree on a shared real-time axis:

- the **trunk** is real history, drawn once, solid up to today and dotted beyond;
- a **fork node** on the trunk is a story's *divergence* — the first real-world
  year its history is no longer identical to ours;
- the **coloured branch** leaving it is the fiction's own timeline; a chevron at
  the edge means it continues, a hollow cap means the story ends there;
- small dots **on the trunk** are the real history a world leans on before it
  forks;
- the **white plane** is the present day, and a **white node** marks each branch
  passing through it; an **amber ring** marks an event real history has since
  contradicted;
- a world whose fork lies beyond the right edge is named by an italic marker
  there rather than silently missing.

Franchises are grouped by **how they break with our history**, not by genre.
24 lineages, 237 events:

| Archetype | The break | Members | Divergence |
|---|---|---|---|
| **Hidden History** | A secret runs underneath the present day | The X-Files, Men in Black, Harry Potter, Buffy, His Dark Materials | 1558–1997 |
| **Alternate Past** | An explicit counterfactual in the 20th century | The Man in the High Castle, Watchmen, Fatherland, The Terminator | 1933–1984 |
| **Post-Industrial Collapse** | Civilisation ends in one generation | Planet of the Apes, Mad Max, Fallout, The Matrix, Twelve Monkeys | 1983–2139 |
| **Near-Future Branch** | A discovery inside our own century | 2001, Contact, The Expanse, Interstellar, Children of Men | 1997–2050 |
| **Far-Future Space Opera** | A galactic civilisation millennia downstream | Star Trek, Star Wars, Dune, Foundation, Warhammer 40,000 | 23,023 BCE–35,000 CE |

The grouping is the answer to "can they be grouped": yes, and the real-time axis
makes the groups separate cleanly. Hidden-history branches cluster over the last
century, alternate-past branches sit in the 1930s–80s, collapses and near-future
branches pile into the 1990s–2100s, and space opera scatters across millennia.

## Reading the axis

The dataset spans roughly 2 billion BCE (The Expanse's ring builders) to 48,000
CE (Foundation's Second Empire) — 237 events across 24 lineages. A linear axis
would erase the present day, so the axis is **warped** (a symmetric-log scale,
`WARP = 110` in `timeline.html`): it stretches the years around now and
compresses the deep past and deep future. It stays continuous and monotonic — no
year is ever reordered — but distances far from now are visually compressed.
**The year labels are always the truth; the spacing is not linear.**

Era presets (defined in `data/atlas.json`) jump to the useful regions: *Around
now*, *Divergence era*, *Deep future*, *Full reach* and *Ancient past*. Their
`from`/`to` are the true left and right edges of the view. Because the axis
compresses hard at the extremes, no single view can show 2 billion BCE and
48,000 CE at linear accuracy at once — that is the trade the warp makes, and
*Full reach* is the widest honest window.

## The conversion problem

Only some of these fictions date themselves in real years. Star Trek does (first
contact is 5 April 2063). Everything else had to be converted:

| Lineage | Its own dating | Conversion used |
|---|---|---|
| Star Trek | real calendar | none needed; 5 Apr 2063 is canon |
| Star Wars | BBY/ABY from the Battle of Yavin | `real = 1977 − BBY`, so the saga sits ~23,000 BCE |
| Dune | A.G. (After Guild) | projection; A.G. 0 ≈ 16,200 CE |
| Foundation | G.E. (Galactic Era) | projection from Asimov's own 1955 chart |
| Warhammer 40,000 | `NNN.M41` millennium notation | Imperial dates are Anno Domini: `005.M31` = 30,005 |

Read projected positions as **projections, not recorded history**. Every event
keeps its original in-universe label so any conversion can be checked.

Star Wars is the striking case: it converts to the deep **past**, not the future,
because its own opening crawl says "a long time ago". That is deliberate and is
why lineages carry an `epoch` field.

---

## Files

| File | Purpose |
|---|---|
| `timeline.html` | **Generated.** The viewer, self-contained, with a copy of the data embedded. |
| `src/page.html` | The page template; `build-data.py` inlines styles, scripts and data into it. |
| `src/styles/*.css` | Design tokens first, then chrome, chart and panel styles. |
| `src/viewer/*.js` | The viewer, one concern per file, assembled in filename order. |
| `data/atlas.json` | Everything the page *says*: title, lede, era presets, section copy, notes. |
| `DESIGN.md` | The design language, chart anatomy and how to extend the atlas. |
| `data/timeline-data.json` | The aggregated dataset the viewer fetches when served over HTTP. |
| `data/parts/*.json` | One file per archetype — **edit these**. |
| `data/parts/worlds/*.json` | World dossiers, one file per research pass. |
| `data/groups.json` | Archetype display order. |
| `data/SCHEMA.md` | The data contract. Read this before adding a lineage. |
| `build-data.py` | Validates the parts and the atlas, rebuilds the aggregate, assembles the page from `src/`, embeds the data. |
| `test-fixture.py` | Proves the build pipeline works and that invalid data is rejected. |
| `test-render.js` | Runs the viewer's render pipeline headlessly against a minimal DOM. |
| `test-viewer.js` | Renders fixture data through `timeline.html`. |
| `README.md` | This file. |

## Adding or editing a lineage

1. Read `data/SCHEMA.md`.
2. Edit the relevant `data/parts/*.json`.
3. Run `python3 build-data.py`.

## Editing the viewer

1. Read `DESIGN.md`.
2. Edit `src/styles/*.css`, `src/viewer/*.js` or `src/page.html`.
3. Run `python3 build-data.py` — it assembles `timeline.html` and embeds the data
   in one step — then the three test suites below.

Page copy (title, lede, era presets, section text, the method notes) is data:
edit `data/atlas.json` and rebuild.

The validator enforces the rules that matter and will refuse to build:

- every `year` is a **real-world integer** — never "5 BBY" or a stardate;
- `tier` must match the calendar rule (`<1900` T4, `<2000` T3, `<2300` T2, else T1),
  measured from the present day, **not** from the divergence;
- `phase` must match the story rule (`prehistory` before the fork, `fork` within
  two years, `aftermath` to +50, `deep` beyond), unless the lineage sets
  `phaseIsAuthored`;
- events ascend by year, one event per `(lineage, year)`, ids globally unique;
- an event id may not borrow another lineage's prefix.

Dossier validation is separate and also strict: every dossier must attach to a
real lineage, every `connections` id must be another lineage in the dataset, and
counts are bounded (3-5 locations, 2-4 connections, 1-3 entry points). A missing
dossier is a warning, not an error — the drawer degrades to chronology only.

It also requires `epoch` (`deep-past` / `far-future` / `present`), the field that
records which way a lineage sits relative to us — Star Wars converts to the deep
past and Star Trek to the future, and the chart should say so explicitly.

It warns — rather than fails — about empty tiers, because a secret-history story
that ends in the present day genuinely has no deep-future events. That is a true
statement about the fiction, not a gap to pad.

## Verification

```
python3 test-fixture.py     # build pipeline + rejection of bad data
node test-viewer.js         # viewer renders a fixture end to end
node test-render.js timeline.html   # viewer renders the real dataset
```

`test-render.js` checks that every lane renders, that all 237 events are drawable
at some zoom level, that the time transform is invertible and the present-day
line sits on canvas exactly when the present is in view, that the detail drawer
renders a row per event for every lineage, and that pan / zoom / filter / sort /
preset interactions do not throw.

## Accuracy

Events carry a confidence rating. **high** means the fiction states it outright.
**medium** means it was inferred from on-screen dates or computed from a stated
anchor. **low** means sources genuinely conflict — usually a book-versus-film or
canon-level disagreement — and the competing claim is written out in the event
note rather than silently resolved. Where real history has now contradicted a
fiction's own dates (2001's lunar base, Children of Men's 2029, The Expanse's
2025 lunar colony), the event is ringed in amber on the chart.
