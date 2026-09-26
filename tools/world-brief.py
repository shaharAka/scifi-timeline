#!/usr/bin/env python3
"""Write the research brief for adding a world to the atlas.

    python3 tools/world-brief.py > BRIEF.md

The brief carries everything a researcher needs to produce one valid world
file without reading the codebase: the rules the build enforces, the bins and
facet vocabularies, the ids a dossier may connect to, and a worked example.
Check the result with tools/check-world.py before merging it.
"""
import glob, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    bins = json.load(open(os.path.join(ROOT, "data", "bins.json")))["bins"]
    fac = json.load(open(os.path.join(ROOT, "data", "facets.json")))
    lin = dos = None
    ids = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "parts", "*.json"))):
        for l in json.load(open(f))["lineages"]:
            ids.append(l["id"])
            if l["id"] == "blade-runner": lin = l
    for f in glob.glob(os.path.join(ROOT, "data", "parts", "worlds", "*.json")):
        for w in json.load(open(f))["worlds"]:
            if w["id"] == "blade-runner": dos = w
    out = ["# Brief: research one science-fiction world for the atlas 'Where We Are Now'", """
The atlas pins science-fiction histories to the REAL calendar. Each world ("lineage") leaves our history at one dated divergence and walks a chain of events, each tagged with a KIND OF MOMENT (a bin) and a FACET SIGNATURE, to an ENDING (optimistic / pessimistic / unknown). Readers match today's news against these chains and the atlas ranks which story our own history most resembles, so accuracy of dates, the choice of bin, and honest facets matter more than anything else.

Your deliverable: ONE JSON file at the path you are given, shaped exactly:
{ "group": "<archetype id you are told>", "lineage": { ...full lineage object... }, "dossier": { ...full dossier object... } }

Hard rules (the build rejects violations):
- Every `year` is a real-world calendar year (negative for BCE). Events strictly ascending by year, at most one event per year (merge or pick). No in-universe year in year/date/title; put it in `inUniverse`.
- ids kebab-case, globally unique, event ids prefixed with a short lineage prefix (e.g. "cp-").
- Required lineage fields: id, title, medium (film|tv|book|game|comic), creator, originYear, group, epoch (deep-past|far-future|present), franchiseStatus (ongoing|concluded|dormant|anthology), divergence {year,label,delta,inUniverse,confidence,note,sources}, ending {valence,why,asOf}, events, groupingNote, sources.
- The divergence is the FIRST year the fiction stops matching our history. Anything fictional (a machine uprising, a secret war) is after the fork, never "prehistory".
- Required event fields: id, year, date, title, description (1-3 sentences), tier, phase, importance (1-3; 3-5 events at 3), kind, inUniverse, confidence (high|medium|low), note, binWhy, bin, facets.
- tier: T4 if year<1900, T3 if <2000, T2 if <2300, else T1.
- phase: prehistory if year < divergence.year; fork for divergence year .. +2; aftermath +3..+50; deep beyond.
- Include 1-2 `publication` events (kind "publication", bin null, facets null, binWhy explaining) for the original release(s). Every other event needs a bin from the list below and a full facets object; choose the bin from what the event IS, not how famous it is.
- facets: {change: "before → after" short phrase, mechanism, actor, position, scope, domain (single values from the closed lists), direction {power, openness, capability, population} each -1/0/1, preconditions: 1-3 from list, outcomes: 1-3 from list}. ONLY values from the lists below.
- sources: arrays of {title, url}; url must start with http. On the lineage, the divergence, and events whose date a reader would check. Real URLs you actually visited.
- ending.valence: the state the story leaves the world in AS TOLD, not the mood of the last event; never inferred from franchiseStatus. `why` is one sentence of evidence.
- groupingNote: why it belongs in its archetype, and which tiers are empty and why.
- dossier: id, setting (50-90 words), conflict (40-70), politics, technology, mood, themes (4-6), tags (3-6 lowercase-hyphenated; reuse: ai, dystopia, post-apocalypse, first-contact, pandemic, climate, authoritarian, space, cold-war, nuclear, corporate-power, game), locations (3-5 objects {name, blurb<20w}), factions (3-5 objects {name, blurb}), whereToStart (1-3 {title, year, medium, blurb}), connections (2-4 {id, note}; id MUST be one of the existing ids below), spoilerLevel (none|mild|heavy). locations and factions are OBJECTS, never bare strings.
- 8 to 14 story events. Do NOT invent events or dates. Where the fiction is vague about a year, derive it from stated anchors, set confidence medium/low and explain in `note`. Follow one continuity and say which in groupingNote.
- Plain prose, no marketing.

Do the research on the web. When done, run `python3 /Users/shahar/Documents/scifi-timeline/tools/check-world.py <your file>` and fix every PROBLEM it prints. Report back: the divergence, the ordered chain of bins, the ending, and any date you were unsure of.
""",
        "## Existing lineage ids (for dossier connections)\n" + ", ".join(ids),
        "## Bins (kind of moment): id - definition\n" + "\n".join("- %s - %s" % (b["id"], b["definition"]) for b in bins),
        "## Facet vocabularies (closed)\n" + "\n".join("- %s: %s" % (k, ", ".join(v) if isinstance(v, list) else json.dumps(v)) for k, v in fac.items() if not k.startswith("_")),
        "## Example lineage (Blade Runner, already in the atlas)\n```json\n" + json.dumps(lin, indent=1, ensure_ascii=False) + "\n```",
        "## Example dossier\n```json\n" + json.dumps(dos, indent=1, ensure_ascii=False) + "\n```"]
    print("\n\n".join(out))

if __name__ == "__main__":
    main()
