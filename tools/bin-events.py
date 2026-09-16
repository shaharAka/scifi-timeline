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
    return "\n".join("  %-22s %s%s" % (b["id"], b["definition"],
                                        ("  e.g. " + b["exampleHeadline"]) if b.get("exampleHeadline") else "")
                     for b in bins)


PROMPT = """THE PROJECT

This is an atlas of fictional chronologies pinned to the real calendar. Each
world shares our history up to a fork, then runs its own course. The atlas is
read from the present: a reader brings a real event from today's news and asks
"in which of these worlds did this kind of thing happen, and what happened
next?" The atlas answers by matching the news to moments in the fiction and
reading each world forward from that moment - many futures for one present -
so the reader can compare what followed, in what order, what differed and what
repeated. More worlds will keep being added; the vocabulary you build now must
still fit them.

YOUR TASK

Build that matching vocabulary. A BIN is a kind of moment, and it is good to the
extent that it serves the use above:

- A real event could be an instance of it. Imagine the headline. "A reactor
  returns more energy than it took", "a state bans a group", "a signal of
  non-human origin is confirmed", "a leader is killed and no successor is
  ready" are bins; "the Vulcans land" is not.
- Several worlds pass through it, so that matching yields futures to compare.
- What follows it in a world is worth knowing. If the events after this moment
  say nothing about what might follow in ours, the moment is too small or too
  vague to be a bin.

Pick the granularity at which a real event and a fictional event would be
described by the same sentence by someone who knew neither story. Name and
define bins in world-neutral terms: no setting words (interstellar, esoteric,
galactic, cybernetic), because the same bin has to fit tomorrow's news and a
world nobody has added yet. Use everything you know about these works, not only
the text given.

BINS THAT ALREADY EXIST:
{existing}

EVENTS TO BIN:
{events}

For each event, first say in one clause what kind of moment it is, as a
headline would. Then put it in the existing bin that fits, or create a new one
if none does. Use `null` for an event that is not a moment in a story at all,
such as a publication date or a note about how a date was derived. Real-world
events a fiction leans on before its fork (a crash, a discovery, a test) ARE
moments and should be binned; they are where a world's future touches ours.

Bin ids are lowercase and hyphenated and name the kind of moment, not the
incident. A new bin needs a short label, a one-sentence definition another
world's event could satisfy, and one example of a real headline that would
belong to it.

Reply with JSON only, no prose and no code fence:

{"assignments":[{"event_id":"...","moment":"what kind of moment this is, as a headline","bin":"existing-or-new-id","new_bin":{"label":"...","definition":"...","example_headline":"..."} or null,"why":"one short sentence"}]}"""


def call_gemini(events, bins, model, key, thinking="medium"):
    from google import genai
    from google.genai import types

    ev_lines = []
    for e in events:
        ev_lines.append('  id=%s | world=%s | %s | %s | %s\n      %s'
                        % (e["event_id"], e["world"], e["year"], e["kind"] or "event",
                           e["title"], (e["description"] or "").strip()))
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
    ap.add_argument("--batch", type=int, default=500, help="events per model call; the default sends all of them at once")
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
                    entry = {"id": bid, "label": nb["label"],
                             "definition": nb.get("definition", nb["label"]),
                             "createdFrom": eid}
                    if nb.get("example_headline"):
                        entry["exampleHeadline"] = nb["example_headline"]
                    bins.append(entry)
                    known.add(bid)
                else:
                    print("    unknown bin %r for %s and no definition; leaving null"
                          % (bid, eid))
                    bid = None
            assignments[eid] = {"bin": bid, "why": a.get("why", ""),
                                "moment": (a.get("moment") or "").strip()}
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
                if a["why"]:
                    ev["binWhy"] = a["why"]
                if a.get("moment"):
                    ev["binMoment"] = a["moment"]
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
