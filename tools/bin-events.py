#!/usr/bin/env python3
"""
Bin the events: give every event a KIND OF MOMENT, discovered from the events
themselves rather than decreed in advance.

The rule, stated by the owner: for each event, if there is already a bin it
resembles, add it to that bin; if there is not, create a new bin. Bins therefore
start empty and the vocabulary is whatever the events turn out to need.

Two consequences worth knowing before you run it:

  * the FIRST events through create the first bins, so the order matters a
    little. Events are walked in a stable order (by world, then year) so the run
    is reproducible rather than lucky.
  * swapping two passes gives different bins. That is fine - this is a first
    pass meant to be argued with, and `data/bins.json` is the artefact to edit.

    python3 tools/bin-events.py --dry-run          show the plan, change nothing
    python3 tools/bin-events.py --limit 24         bin one world's events only
    python3 tools/bin-events.py                    bin everything, write the data
    python3 tools/bin-events.py --report           how the bins came out
    python3 tools/bin-events.py --reset            bin events only, no vocab

The event text is the evidence, so it goes to Gemini. The result is written back
into `data/parts/*.json` as `bin` on each event, with the reasoning in the
event's `note` where the choice is not obvious.
"""
import argparse
import collections
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / "data" / "parts"
BINS_FILE = ROOT / "data" / "bins.json"
UA_NOTE = "bins are kinds of moment, not topics: 'the war' not 'war'"


def load_env():
    out = {}
    p = ROOT / ".env"
    if not p.exists():
        return out
    for line in p.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def load_bins():
    if BINS_FILE.exists():
        try:
            return json.loads(BINS_FILE.read_text(), object_pairs_hook=collections.OrderedDict)
        except json.JSONDecodeError as exc:
            print("data/bins.json does not parse: %s" % exc)
            sys.exit(2)
    return collections.OrderedDict({"bins": []})


def save_bins(doc):
    doc["_comment"] = ("The bin vocabulary. A bin is a KIND OF MOMENT that recurs "
                       "across worlds; an event points at one by id. Bins are not "
                       "fixed in advance - tools/bin-events.py adds to an existing "
                       "bin when an event is like one already there, and creates a "
                       "new bin only when nothing fits. This file is the outcome of "
                       "that, and the thing to edit when you disagree with it.")
    BINS_FILE.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")


def part_files():
    return sorted(p for p in PARTS.glob("*.json"))


def walk_events():
    """Yield (path, doc, lineage, event) in a stable order."""
    for path in part_files():
        doc = json.loads(path.read_text(), object_pairs_hook=collections.OrderedDict)
        for lin in doc.get("lineages", []):
            for ev in sorted(lin.get("events", []), key=lambda e: e["year"]):
                yield path, doc, lin, ev


def bin_lines(bins):
    if not bins:
        return "  (none yet - you are creating the first ones)"
    return "\n".join("  %-22s %s" % (b["id"], b["definition"]) for b in bins)


PROMPT = """You are binning moments from fictional chronologies.

A BIN is a KIND OF MOMENT that recurs across different stories. The test: if you
put two events side by side and a reader would say "these are the same kind of
thing happening", they share a bin.

BINS THAT ALREADY EXIST:
{existing}

EVENTS TO BIN:
{events}

For each event, add it to an existing bin if one fits. Create a new bin ONLY if
you would have to stretch a definition to make the event fit.

THE FAILURE MODE TO AVOID is a bin with one member. A bin holding a single event
is not a kind of moment - it is that event with a label on it, and it makes the
vocabulary useless for finding convergence. Before creating a bin, look again at
the existing ones: a bin whose definition is one step more general than your
first instinct will usually cover the event you are holding and several others
you have not seen yet.

  too narrow:  "a vigilante movement emerges"   -> admits one event
  right level: "unofficial enforcers appear outside the law"
  too broad:   "something changes"              -> admits everything

Other rules:
- One bin per event. `null` if the event is not a moment in a story at all -
  a publication date, or a note about how a date was derived.
- Judge from the event's OWN text, not from how famous the year is and not from
  what you know about the franchise.
- Aim for a vocabulary of roughly two dozen bins for a few hundred events. If you
  are past that, your bins are too narrow.
- Bin ids: lowercase, hyphenated, and they must read as a kind of moment, not as
  a specific incident. `first-contact`, not `the-vulcans-arrive`.
- Labels: Title Case, four words at most. Definitions: one sentence, and general
  enough that an event from another world could satisfy it.

Reply with JSON only, no prose and no code fence:

{"assignments":[{"event_id":"...","bin":"existing-or-new-id","new_bin":{"label":"...","definition":"..."} or null,"why":"under 12 words"}]}"""


def call_gemini(events, bins, model, key, thinking="medium"):
    from google import genai
    from google.genai import types

    ev_lines = []
    for e in events:
        ev_lines.append('  id=%s | world=%s | %s | %s | %s\n      %s'
                        % (e["event_id"], e["world"], e["year"], e["kind"] or "event",
                           e["title"], (e["description"] or "")[:230]))
    # `replace` rather than `format`: the prompt contains literal JSON braces,
    # which format() would try to read as placeholders.
    prompt = (PROMPT
              .replace("{existing}", bin_lines(bins))
              .replace("{events}", "\n".join(ev_lines)))

    client = genai.Client(api_key=key)
    resp = client.models.generate_content(
        model=model, contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_level=thinking)))
    text = getattr(resp, "text", None) or ""
    if not text and resp.candidates:
        parts = (resp.candidates[0].content.parts if resp.candidates[0].content else []) or []
        text = "".join(getattr(p, "text", "") or "" for p in parts)
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text).strip()
    # Take the first complete JSON value and ignore anything after it. A long
    # batch can come back as several concatenated objects, and a trailing
    # sentence is not a reason to throw away a whole batch of work.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        obj, _end = json.JSONDecoder().raw_decode(text)
        return obj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, help="only the first N events")
    ap.add_argument("--batch", type=int, default=60)
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--reset", action="store_true", help="clear bins and re-bin")
    args = ap.parse_args()

    env = load_env()
    model = env.get("GEMINI_TEXT_MODEL") or "gemini-3.8-flash"
    thinking = env.get("GEMINI_THINKING") or "medium"

    doc = load_bins()
    if args.reset:
        doc = collections.OrderedDict({"bins": []})
    bins = list(doc.get("bins", []))

    if args.report:
        members = collections.Counter()
        worlds_of = collections.defaultdict(set)
        total = 0
        for _p, _d, lin, ev in walk_events():
            total += 1
            members[ev.get("bin")] += 1
            if ev.get("bin"):
                worlds_of[ev["bin"]].add(lin["id"])
        shared = sum(1 for b in bins if len(worlds_of.get(b["id"], ())) > 1)
        print("events: %d   bins: %d   unassigned: %d" % (total, len(bins), members.get(None, 0)))
        print("bins shared by more than one world: %d of %d" % (shared, len(bins)))
        print("  (a bin in a single world is not yet convergence - it is one "
              "story's private vocabulary)")
        print()
        for b in sorted(bins, key=lambda x: -members.get(x["id"], 0)):
            n = members.get(b["id"], 0)
            flag = "  <- single member, definition may be too narrow" if n == 1 else ""
            print("  %-24s %3d events in %2d worlds  %s%s"
                  % (b["id"], n, len(worlds_of.get(b["id"], ())), b["label"], flag))
            if len(worlds_of.get(b["id"], ())) == 1 and n > 1:
                print("      \u2192 all its events sit in one world; not yet a "
                      "moment two worlds share")
        unknown = [k for k in members if k and k not in {b["id"] for b in bins}]
        if unknown:
            print("\n  events naming a bin that does not exist: %s" % unknown)
        return 0

    # gather the events
    todo = []
    for path, _doc, lin, ev in walk_events():
        todo.append({
            "event_id": ev["id"], "world": lin["id"], "world_title": lin["title"],
            "year": ev["year"], "kind": ev.get("kind"), "title": ev["title"],
            "description": ev.get("description", ""),
            "path": str(path),
        })
    if args.limit:
        todo = todo[: args.limit]
    print("events to bin: %d   existing bins: %d   model: %s (thinking %s)"
          % (len(todo), len(bins), model, thinking))

    if args.dry_run:
        print("\nfirst batch would be:")
        for e in todo[: args.batch]:
            print("   %-34s %s" % (e["event_id"], e["title"][:56]))
        return 0

    key = env.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not key:
        print("no GEMINI_API_KEY (see .env.example)")
        return 3

    assignments = {}
    for start in range(0, len(todo), args.batch):
        chunk = todo[start:start + args.batch]
        print("  binning %d-%d of %d ..." % (start + 1, start + len(chunk), len(todo)),
              flush=True)
        try:
            out = call_gemini(chunk, bins, model, key, thinking)
        except Exception as exc:  # noqa: BLE001
            print("    batch failed, skipping: %s" % str(exc)[:160])
            continue
        known = {b["id"] for b in bins}
        for a in out.get("assignments", []):
            eid, bid = a.get("event_id"), a.get("bin")
            nb = a.get("new_bin")
            # the model sometimes sends the STRING "null" for "no bin"
            if isinstance(bid, str) and bid.strip().lower() in ("null", "none", ""):
                bid = None
            if isinstance(bid, str):
                bid = bid.strip()
                if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", bid or ""):
                    print("    rejecting malformed bin id %r for %s" % (bid, eid))
                    bid = None
            if bid and bid not in known:
                if isinstance(nb, dict) and nb.get("label"):
                    bins.append({"id": bid, "label": nb["label"],
                                 "definition": nb.get("definition", nb["label"]),
                                 "createdFrom": eid})
                    known.add(bid)
                else:
                    print("    unknown bin %r for %s and no definition; leaving null"
                          % (bid, eid))
                    bid = None
            assignments[eid] = {"bin": bid, "why": a.get("why", "")}
        print("    bins now: %d" % len(bins))

    if not assignments:
        print("nothing assigned")
        return 1

    # write the assignments back into the part files
    by_path = collections.defaultdict(dict)
    for eid, a in assignments.items():
        by_path[None][eid] = a
    changed = 0
    for path in part_files():
        doc2 = json.loads(path.read_text(), object_pairs_hook=collections.OrderedDict)
        touched = False
        for lin in doc2.get("lineages", []):
            for ev in lin.get("events", []):
                a = assignments.get(ev["id"])
                if not a:
                    continue
                if ev.get("bin") != a["bin"]:
                    ev["bin"] = a["bin"]
                    changed += 1
                if a["why"] and not ev.get("binWhy"):
                    ev["binWhy"] = a["why"]
                touched = True
        if touched:
            path.write_text(json.dumps(doc2, indent=1, ensure_ascii=False) + "\n")

    doc["bins"] = bins
    save_bins(doc)
    print("\n  assigned %d events, %d changed, %d bins"
          % (len(assignments), changed, len(bins)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
