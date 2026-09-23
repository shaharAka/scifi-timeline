# Timeline dataset contract

Single source of truth for both the research passes and `timeline.html`.
Every file in `data/parts/*.json` MUST validate against this.

## The one rule that matters

**Every `year` is a REAL-WORLD calendar year.** Not an in-universe year, not a
stardate, not "5 BBY", not "10,191 AG". The whole visualization is built on a
shared real-time axis showing where each fictional history stops matching ours.

In-universe chronology is preserved through two fields instead:
- `anchor.inUniverse` — what the fiction calls that year (free text, e.g. "5 BBY",
  "10,191 AG", "stardate 2364.1"). May be `null` when the fiction uses plain years.
- Event ordering within a lineage is always ascending by `year`.

## Divergence semantics

`divergence.year` is the first real-world year in which the fiction's timeline is
no longer identical to actual history. It is the branch point.

`divergence.delta` is the one-line contrast that makes the branch legible:
real history on one side, the fiction's history on the other. This is the most
valuable field in the dataset — write it as the actual fork, not a summary.

## Tier taxonomy

`tier` classifies WHEN on the real axis the event sits, measured **from the
present day** — not from the divergence. This is the axis the chart draws and
the thing a reader wants to know: is this beat in our past, our near future, or
genuinely deep time?

| tier | rule, measured from the present day | meaning |
|------|--------------------------------------|---------|
| `T4` | `year < 1900` | historical background, well before living memory |
| `T3` | `1900 <= year < 2000` | the 20th century: the usual home of divergences and secret histories |
| `T2` | `2000 <= year < 2300` | our century and the next three: near future, where most branches visibly start |
| `T1` | `year >= 2300` | deep time: far beyond anyone alive, where space opera lives |

The cutoff years are deliberately round numbers a reader can reason about, not
tuned per lineage. Apply them mechanically:

```python
def tier_of(year):
    if year < 1900: return "T4"
    if year < 2000: return "T3"
    if year < 2300: return "T2"
    return "T1"
```

Do **not** compute tier from `year - divergence.year`. An earlier draft of this
document implied that and it was wrong: it made a story that forks in 1996 and
ends in 2035 look like it never reached deep time, when on the real axis it
plainly sits in our near future. Tier answers "where on our calendar", never
"how far into the story".

An empty tier is a legitimate, expected result and must not be padded with
invented events. Simply say in `groupingNote` which tiers the fiction is silent
about and why. A secret-history story that ends in the present day will have no
`T1` events and that is a true statement about it.

## Branch phase

Because `tier` is absolute, `phase` carries the story-relative structure. Use it
to say where an event sits in the narrative arc of its own branch:

| phase | meaning |
|-------|---------|
| `prehistory` | before the divergence, in real history |
| `fork` | the divergence window itself |
| `aftermath` | the branch's own near future, within ~50 years of the fork |
| `deep` | the branch's far future, more than ~50 years past the fork |

Roughly: `phase = prehistory` when `year < divergence.year`; `fork` for the
divergence year and the two years after it; `aftermath` from `divergence + 3`
through `divergence + 50`; `deep` beyond that. Phase is what makes "this story
forks in 1947 and then jumps to 2200" legible when tier alone would file both
ends under different decades.

**Escape hatch.** A few lineages span so much of their own history that a single
divergence year cannot classify their phases correctly. Star Wars is the clear
case: its divergence is the founding of the Galactic Republic around 23,000 BCE,
and the saga then runs twenty-five thousand years to the First Order - so
mechanically deriving phase would file almost the entire saga under "deep" and
lose the distinction between the Old Republic, the Empire and the First Order.
For such lineages, set `phaseIsAuthored: true` and assign `phase` by narrative
judgement instead. The validator then checks that each phase is a legal value but
does not derive it. Use this sparingly and say why in `groupingNote`.

Aim for roughly 3 events per tier, but let the fiction decide. The only real
requirement is that a lineage's events are spread honestly across the time it
actually covers.

## Epoch direction

`epoch` records which way a lineage's main body sits relative to the present
day, because the real-year axis can send a space opera in either direction and
that is worth stating rather than hiding:

| epoch | meaning |
|-------|---------|
| `deep-past` | the fiction is set long before us and says so (Star Wars: "a long time ago") |
| `far-future` | the fiction projects forward from a world like ours (Star Trek, Dune, Foundation) |
| `present` | the fiction runs alongside real history, in the present day (the secret-history archetype) |

This is not a correction of the timeline. Star Wars genuinely converts to
roughly 23,000 BCE on the real calendar, because its own opening crawl places it
in the distant past; a viewer seeing it plotted at the far left of the axis
should be able to confirm that this is deliberate rather than a sign error.
`epoch` is how they confirm it.

## Importance

- `3` — the spine of the story. Hide this and the timeline stops making sense.
  Expect 3-5 of these per lineage.
- `2` — major beat, worth showing when zoomed in.
- `1` — detail or texture; shown only at high zoom.

Assign importance from the fiction's own emphasis, not from how famous the year is.

## Confidence

- `high` — stated unambiguously on screen / on the page.
- `medium` — inferred from on-screen dates, a tie-in reference, or arithmetic
  from a stated anchor.
- `low` — genuinely contested across adaptations, editions, or canon levels.

If a real-world year is contested, pick the best-supported reading, set
`confidence` to `medium` or `low`, and say what the conflict is in `note`.

## Kinds

`kind` is free text but prefer this vocabulary so the viewer's color legend works:
`event`, `war`, `founding`, `discovery`, `disaster`, `first-contact`, `politics`,
`technology`, `death`, `publication`.

## Schema

```json
{
  "group": {
    "id": "hidden-history",
    "name": "Hidden History",
    "tagline": "The world is already stranger than we know; the truth is simply classified.",
    "question": "Where are the aliens / wizards / vampires hiding in the present day?",
    "divergenceMechanism": "A secret breach of the consensus world, kept off the record.",
    "color": "#8b5cf6"
  },
  "lineages": [
    {
      "id": "x-files",
      "title": "The X-Files",
      "medium": "tv",
      "creator": "Chris Carter",
      "originYear": 1993,
      "group": "hidden-history",
      "epoch": "present",
      "franchiseStatus": "ongoing",
      "divergence": {
        "year": 1947,
        "label": "Roswell recovery program",
        "delta": "Real: Roswell is a weather balloon and a cover story. Fiction: an alien craft and its pilot are recovered and a shadow program runs for fifty years.",
        "inUniverse": null,
        "confidence": "high",
        "note": "Only in the sense of a government concealment of extraterrestrial contact; the alternate history proper begins here."
      },
      "ending": {
        "valence": "unknown",
        "why": "The conspiracy is exposed and reburied again and again; the files are open, the truth is still out there.",
        "asOf": 2016
      },
      "events": [
        {
          "id": "xf-roswell",
          "year": 1947,
          "date": "1947",
          "title": "The Roswell recovery",
          "description": "One sentence stating what happens and why it matters.",
          "tier": "T3",
          "phase": "fork",
          "importance": 3,
          "kind": "discovery",
          "inUniverse": null,
          "confidence": "high",
          "note": ""
        }
      ],
      "groupingNote": "Why this lineage belongs to this archetype."
    }
  ]
}
```


## Sources: where a claim comes from

Any level may carry `sources`: an array of `{ "title", "url" }`. The point is
that a reader can check a date rather than trust it, which is the same standard
the news items are held to - those already require a source and are validated
for it.

```json
"sources": [
  { "title": "Wikipedia: Blade Runner 2049", "url": "https://en.wikipedia.org/wiki/Blade_Runner_2049" }
]
```

Put them where the claim is:

- on the **lineage**, for who made it and when it is set;
- on the **divergence**, for the one fact the fork depends on;
- on an **event**, where a specific date or number is the sort of thing a reader
  will want to check.

Rules the build enforces:

- `title` and `url` are both required, and `url` must start with `http`.
- An entry that is not an object, or that is missing either field, is an error
  rather than a silent drop - a source that does not render is worse than none,
  because it looks like a claim that was checked.
- `sources` is optional everywhere. A world with none is incomplete, not wrong.

## Endings: where the arc converges

Every arc ends somewhere, and the Moments page draws that: each world's path
through the kinds of moment runs into one of three sinks, and our own path
runs into `unknown` because we are still inside it. That is what makes the
graph predictive rather than descriptive - a kind of moment can be read as
"of the worlds that passed through this, so many ended well, so many badly,
so many are still open".

```json
"ending": { "valence": "optimistic", "why": "One sentence.", "asOf": 3189 }
```

- `valence` is the state the story leaves the world in **as far as it is
  told**, not the mood of the last charted event. Star Wars ends with the
  First Order striking in the chart but the saga as told ends with the
  tyrant's second fall: `optimistic`.
- `optimistic`: the world is left better, freer or safer than at the fork,
  or the threat that drove the story is ended. `pessimistic`: the world is
  left ruined, captive or doomed and the story does not take that back.
  `unknown`: the author left it open, the franchise is mid-sentence, or the
  story deliberately refuses to say.
- `why` is one sentence, the evidence for the call. `asOf` is the real year
  of the last told moment the call rests on.
- Do not infer valence from `franchiseStatus`. An `ongoing` franchise can
  have an `optimistic` ending as told (Star Trek); a `concluded` one can be
  `unknown` (Dune).

## Bins: the kind of moment

`bin` on an event is a pointer into `data/bins.json`: the **kind of moment** it
is, independent of which world it happens in. It is what makes convergence
visible - two branches pass through the same column when they share a bin, and
that is a different claim from sharing a date.

Bins are **not fixed in advance.** `tools/bin-events.py` walks the events, and
for each one either adds it to an existing bin it resembles or creates a new bin
when nothing fits. The vocabulary in `data/bins.json` is the outcome of that
pass, and is meant to be argued with - edit the labels and definitions freely,
rename ids if you like, and re-run the tool. What matters is that the *events*
are right.

- One bin per event, or `null` for an event with nothing to depict - a
  publication date is not a moment in a story.
- The bin is chosen from the event's own text, never from how famous the year is
  or how it is usually described.
- `build-data.py` hard-errors on an event that names a bin which does not exist
  in `data/bins.json`. A dangling pointer is worse than a missing one.
- A bin that ends up with a single member is a smell, not an error: it usually
  means the definition is too narrow. `tools/bin-events.py --report` lists them.

## World dossiers (optional, one file per research pass under `data/parts/worlds/`)

The timeline says *when* a world sits. A dossier says what it is like to be in
it, so a reader can go deeper than the dated events. Dossiers are attached to
lineages by `id`, which MUST equal a lineage id.

```json
{
  "worlds": [
    {
      "id": "dune",
      "setting": "One paragraph, 50-90 words, present tense, describing the world the story actually inhabits.",
      "conflict": "One paragraph, 40-70 words: the core conflict that drives the fiction.",
      "politics": "Who holds power and how, in one or two sentences.",
      "technology": "What the tech level feels like and what is notably absent or fetishised.",
      "mood": "The emotional register - two or three adjectives plus a sentence.",
      "themes": ["4 to 6 short noun phrases"],
      "tags": ["3 to 6 short lowercase tags, e.g. galactic-empire, desert, AI-ban"],
      "locations": [
        { "name": "Arrakis", "blurb": "Under 20 words on why it matters." }
      ],
      "factions": [
        { "name": "House Atreides", "blurb": "Under 20 words." }
      ],
      "whereToStart": [
        { "title": "Dune", "year": 1965, "medium": "book", "blurb": "Under 25 words on why this is the entry point." }
      ],
      "connections": [
        { "id": "foundation", "note": "Under 20 words on the real relationship - shared lineage, influence, or deliberate contrast." }
      ],
      "spoilerLevel": "none"
    }
  ]
}
```

Rules:

1. `id` must match a lineage id in the dataset. The builder reports any dossier
   without a lineage and any lineage without a dossier.
2. `locations` and `factions`: 3 to 5 entries each.
3. `whereToStart`: 1 to 3 entries, most accessible first.
4. `connections`: 2 to 4 entries, and `id` must be another lineage in this
   dataset. Use real lineage ids. Say what the actual relationship is - a shared
   ancestor, a direct influence, or an instructive contrast - not a vague vibe.
5. `tags` are lowercase and hyphenated, and are used for cross-filtering, so
   reuse common ones across worlds (`ai`, `galactic-empire`, `post-apocalypse`,
   `time-travel`, `first-contact`, `space-station`, `dystopia`, `secret-war`).
6. `spoilerLevel` is `none`, `mild` or `heavy`. Keep `setting`, `conflict`,
   `politics`, `technology` and `mood` readable at `none`; anything that gives
   away a late reveal belongs in a location or faction blurb at most, and those
   should carry `spoilerLevel: "mild"` or `"heavy"` on the dossier.
7. No invented facts. If something is genuinely contested across editions or
   adaptations, describe the version the timeline's events follow.


## Required fields

- group: `id`, `name`, `tagline`, `question`, `divergenceMechanism`, `color`
- lineage: `id`, `title`, `medium`, `creator`, `originYear`, `group`, `epoch`,
  `franchiseStatus`, `divergence`, `ending`, `events`, `groupingNote`
- ending: `valence`, `why` (`asOf` optional)
- divergence: `year`, `label`, `delta`, `confidence`
- event: `id`, `year`, `title`, `description`, `tier`, `phase`, `importance`,
  `kind`, `confidence`, `bin`

## Hard constraints

1. `id` values are kebab-case and globally unique across the whole dataset.
   Prefix event ids with the lineage id, e.g. `xf-roswell`.
2. Events strictly ascending by `year`. Never reorder for drama.
3. `medium` is one of `film`, `tv`, `book`, `game`, `comic` — the primary medium.
4. `franchiseStatus` is one of `ongoing`, `concluded`, `dormant`, `anthology`.
   `ending.valence` is one of `optimistic`, `pessimistic`, `unknown`.
5. At most one event per exact `(lineage, year)` pair. If two things happen the
   same year, merge them or pick the more significant.
6. No in-universe years anywhere in `year`, `date`, or `title`. If a title needs
   the in-universe name, put it in `inUniverse`.
7. Emit valid JSON. No comments, no trailing commas, no markdown fences.

## Facets: the moment signature

A single `bin` tells you the kind of moment; it does not tell you whether two
moments are alike in the way that predicts what follows. Iran 1979 and the
Enabling Act are both "power is seized" and share no future. So every event
that is a moment carries `facets`, a structured description on closed axes
(`data/facets.json`), and matching is done on the facets, with the bin kept
as the coarse label for headings.

```json
"facets": {
  "change": "democracy → dictatorship by emergency law",
  "mechanism": "law",          "actor": "individual",   "position": "inside",
  "scope": "national",         "domain": "political",
  "direction": {"power": 1, "openness": -1, "capability": 0, "population": 0},
  "preconditions": ["crisis-economic", "street-violence", "weak-institutions"],
  "outcomes": ["one-party-state", "purge", "war-of-expansion"]
}
```

- `change` — one clause, `before → after`, in the event's own terms.
- `mechanism` — how it happened (law, coup, uprising, invention, discovery,
  expedition, founding, recruitment, birth, death, accident, disaster, attack,
  invasion, war, negotiation, disclosure, arrival, consolidation, ...).
- `actor` — who did it; `position` — where they stood relative to the order
  they changed: `inside` (the state or an insider), `below` (the ruled),
  `outside` (a foreign or alien power), `above` (nature, the cosmos).
- `scope` and `domain` — how far it reached and in what sphere.
- `direction` — four signed axes: does power concentrate or disperse, does the
  world open or close, does capability grow or shrink, does population grow or
  die. Zero when the axis does not move.
- `preconditions` — the situation it arose from; `outcomes` — what followed
  at once. Both are tags from the closed lists.

**Matching rule.** To find moments like a given one, compare everything
*except* `outcomes`: the outcome is what we want to read from the neighbours,
not match on. `tools/facet-match.py` does this and reports similarity, not just
rank; anything under about 0.5 means "nothing close".

`facets` is `null` for publication and release dates. The lists in
`data/facets.json` are closed on purpose: extend them deliberately and the
build will reject anything else.

## Real history

`data/real-history.json` is our own history as a sequence of moments in the
same schema: `year`, `title`, `description`, `bin`, `facets`, and optionally
`newsId` when the beat is one of the items in `data/news.json`. It is the
trunk's own chronology, the arc every fiction shares up to its fork and the
tail that today's news extends. Its bins anchor the vocabulary: a bin's
clearest real instance is the best definition of it. The build checks it like
any lineage's events and publishes it as `payload.real`.

## News

`data/news.json` holds hand-curated items: `date` (YYYY-MM-DD), `headline`,
`summary`, `source {title, url}`, `worlds` (lineage ids it touches), and
`bin`, the kind of moment it is. The bin is what the Moments page reads the
item by; an item without one is drawn on the map but cannot be matched, and
the build warns. An unknown bin is a build error. Optional `id` names the
item in `#news=` links; without it the date is used.
