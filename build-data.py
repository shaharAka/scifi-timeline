#!/usr/bin/env python3
"""
Aggregate data/parts/*.json into data/timeline-data.json and embed a copy inside
timeline.html so the page works when opened straight from disk (file:// blocks fetch).

Run from anywhere:  python3 build-data.py
"""

import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(ROOT, "data", "parts")
WORLDS = os.path.join(PARTS, "worlds")
GROUPS_FILE = os.path.join(ROOT, "data", "groups.json")
OUT = os.path.join(ROOT, "data", "timeline-data.json")
HTML = os.path.join(ROOT, "timeline.html")
EMBED_MARK = '<script id="embedded-data" type="application/json">'

MEDIA = {"film", "tv", "book", "game", "comic"}
STATUSES = {"ongoing", "concluded", "dormant", "anthology"}
TIERS = {"T1", "T2", "T3", "T4"}
PHASES = {"prehistory", "fork", "aftermath", "deep"}
EPOCHS = {"deep-past", "far-future", "present"}
CONF = {"high", "medium", "low"}
NOW_YEAR = datetime.now().year


def tier_of(year):
    """Tier is absolute time on the real axis, measured from the present day.

    Deliberately NOT derived from the divergence: a story that forks in 1996 and
    ends in 2035 sits in our near future, not in deep time.
    """
    if year < 1900:
        return "T4"
    if year < 2000:
        return "T3"
    if year < 2300:
        return "T2"
    return "T1"


def phase_of(year, div_year):
    """Story-relative position within the branch, which tier no longer carries.

    `fork` deliberately covers the divergence and a two-year window after it, not
    a whole decade: "the fork" should mean the rupture and its immediate
    consequences, while everything that settles in afterwards is aftermath.
    """
    if year < div_year:
        return "prehistory"
    if year <= div_year + 2:
        return "fork"
    if year <= div_year + 50:
        return "aftermath"
    return "deep"

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load_parts():
    if not os.path.isdir(PARTS):
        err("missing directory: data/parts")
        return []
    names = sorted(f for f in os.listdir(PARTS) if f.endswith(".json"))
    if not names:
        err("no *.json files in data/parts")
    out = []
    for name in names:
        path = os.path.join(PARTS, name)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as exc:
            err("%s: cannot read (%s)" % (name, exc))
            continue
        if not raw.strip():
            warn("%s: empty, skipped" % name)
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            err("%s: invalid JSON at line %d col %d: %s" % (name, exc.lineno, exc.colno, exc.msg))
            continue
        out.append((name, data))
    return out


def load_group_order():
    """Display order for the archetypes, from data/groups.json."""
    if not os.path.exists(GROUPS_FILE):
        warn("data/groups.json missing; archetypes will be ordered alphabetically")
        return []
    try:
        with open(GROUPS_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        err("data/groups.json is unreadable: %s" % exc)
        return []
    order = data.get("order")
    if not isinstance(order, list) or not order:
        err("data/groups.json must contain a non-empty 'order' array")
        return []
    return [str(x) for x in order]


def check_group(name, g):
    if not isinstance(g, dict):
        err("%s: missing top-level 'group' object" % name)
        return None
    for key in ("id", "name", "tagline", "question", "divergenceMechanism", "color"):
        if not g.get(key):
            err("%s: group.%s is required" % (name, key))
    if g.get("color") and not re.match(r"^#[0-9a-fA-F]{6}$", g["color"]):
        err("%s: group.color must be a #rrggbb hex, got %r" % (name, g["color"]))
    return g


def id_looks_prefixed(eid, lid, title):
    """True when an event id reads as belonging to its lineage.

    Deliberately permissive: authors legitimately abbreviate (`xf-` for The
    X-Files, `term-` for The Terminator, `tmithc-` for The Man in the High
    Castle, `fl-` for Fatherland, `wm-` for Watchmen), and a house style is not
    worth a warning. What this does catch is an event id borrowed from *another*
    lineage, which the cross-file prefix check in main() then flags.
    """
    compact = re.sub(r"[^a-z0-9]", "", lid.lower())
    words = [w for w in re.split(r"[\s]+", title or "") if w]
    subwords = [s for w in words for s in re.split(r"[-_/]+", w) if s]
    variants = {
        compact,
        "".join(w[0] for w in words).lower(),
        "".join(s[0] for s in subwords).lower(),
        re.sub(r"[aeiou]", "", compact),
    }
    variants.update(compact[:n] for n in range(2, len(compact) + 1))
    head = re.split(r"[-_]", eid.lower())[0]
    if head in variants:
        return True
    # two-letter initials of a hyphenated or multiword title, either order
    if len(head) == 2 and len(subwords) >= 2:
        return head == "".join(s[0] for s in subwords[:2]).lower()
    return False


def load_worlds(lineage_ids):
    """World dossiers from data/parts/worlds/*.json, keyed by lineage id.

    Dossiers are optional: the viewer degrades to the chronology alone when one
    is missing, so a gap is a warning rather than an error.
    """
    found = {}
    if not os.path.isdir(WORLDS):
        return found
    seen_in = {}
    for fname in sorted(f for f in os.listdir(WORLDS) if f.endswith(".json")):
        path = os.path.join(WORLDS, fname)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            err("%s: unreadable (%s)" % (fname, exc))
            continue
        worlds = data.get("worlds")
        if not isinstance(worlds, list) or not worlds:
            err("%s: 'worlds' must be a non-empty list" % fname)
            continue
        for w in worlds:
            if not isinstance(w, dict):
                err("%s: a dossier is not an object" % fname)
                continue
            wid = w.get("id")
            if not wid:
                err("%s: a dossier has no id" % fname)
                continue
            if wid in seen_in:
                err("%s: dossier %r already defined in %s" % (fname, wid, seen_in[wid]))
                continue
            seen_in[wid] = fname
            tag = "%s/%s" % (fname, wid)
            if wid not in lineage_ids:
                warn("%s: dossier has no matching lineage; it will not be shown" % tag)
            for key in ("setting", "conflict", "politics", "technology", "mood"):
                if not w.get(key):
                    err("%s: missing %r" % (tag, key))
            for key, lo, hi in (("themes", 3, 8), ("tags", 2, 8),
                                ("locations", 3, 6), ("factions", 3, 6),
                                ("whereToStart", 1, 3), ("connections", 2, 4)):
                v = w.get(key)
                if not isinstance(v, list) or not (lo <= len(v) <= hi):
                    err("%s: %s must be a list of %d-%d entries, got %r"
                        % (tag, key, lo, hi, len(v) if isinstance(v, list) else v))
            for c in w.get("connections") or []:
                if not isinstance(c, dict) or not c.get("id"):
                    err("%s: each connection needs an id" % tag)
                elif c["id"] not in lineage_ids:
                    err("%s: connection %r is not a lineage in this dataset" % (tag, c["id"]))
                elif c["id"] == wid:
                    warn("%s: connects to itself" % tag)
            if w.get("spoilerLevel") not in ("none", "mild", "heavy"):
                warn("%s: spoilerLevel %r should be none/mild/heavy"
                     % (tag, w.get("spoilerLevel")))
            found[wid] = w
    return found


def check_lineage(name, lin, group_id, seen_ids):
    lid = lin.get("id")
    if not lid:
        err("%s: a lineage has no id" % name)
        return None
    if lid in seen_ids:
        err("%s: duplicate lineage id %r" % (name, lid))
        return None
    seen_ids.add(lid)
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", lid):
        warn("%s: lineage id %r is not kebab-case" % (name, lid))

    for key in ("title", "medium", "creator", "originYear", "franchiseStatus",
                "epoch", "divergence", "events", "groupingNote"):
        if lin.get(key) in (None, "", [], {}):
            err("%s/%s: missing required field %r" % (name, lid, key))

    if lin.get("group") != group_id:
        err("%s/%s: lineage.group %r does not match its file's group %r"
            % (name, lid, lin.get("group"), group_id))
    if lin.get("medium") not in MEDIA:
        err("%s/%s: medium %r not in %s" % (name, lid, lin.get("medium"), sorted(MEDIA)))
    if lin.get("epoch") not in EPOCHS:
        err("%s/%s: epoch %r not in %s" % (name, lid, lin.get("epoch"), sorted(EPOCHS)))
    if lin.get("franchiseStatus") not in STATUSES:
        warn("%s/%s: franchiseStatus %r not in %s"
             % (name, lid, lin.get("franchiseStatus"), sorted(STATUSES)))

    dv = lin.get("divergence") or {}
    if not isinstance(dv.get("year"), int):
        err("%s/%s: divergence.year must be an integer, got %r" % (name, lid, dv.get("year")))
    if not dv.get("delta"):
        err("%s/%s: divergence.delta is required (the real-vs-fiction fork)" % (name, lid))
    if dv.get("confidence") not in CONF:
        warn("%s/%s: divergence.confidence %r not in %s"
             % (name, lid, dv.get("confidence"), sorted(CONF)))

    evs = lin.get("events")
    if not isinstance(evs, list) or not evs:
        err("%s/%s: events must be a non-empty list" % (name, lid))
        return lin

    div_year = dv.get("year") if isinstance(dv.get("year"), int) else None
    seen_years = {}
    seen_ev = set()
    for i, e in enumerate(evs):
        tag = "%s/%s/event[%d]" % (name, lid, i)
        if not isinstance(e, dict):
            err("%s: not an object" % tag)
            continue
        for key in ("id", "year", "title", "description", "tier", "phase",
                    "importance", "kind", "confidence"):
            if e.get(key) in (None, ""):
                err("%s: missing required field %r" % (tag, key))
        eid = e.get("id")
        if eid:
            if eid in seen_ev:
                err("%s: duplicate event id %r" % (tag, eid))
            seen_ev.add(eid)
        yr = e.get("year")
        if not isinstance(yr, int):
            err("%s: year must be an integer, got %r" % (tag, yr))
            continue
        if yr in seen_years:
            err("%s: two events share the year %d (merge them or drop one)" % (tag, yr))
        seen_years[yr] = True

        want_tier = tier_of(yr)
        if e.get("tier") != want_tier:
            err("%s: year %d implies tier %s but tier is %r "
                "(tier is measured from the present day, not from the divergence)"
                % (tag, yr, want_tier, e.get("tier")))
        if div_year is not None and not lin.get("phaseIsAuthored"):
            want_phase = phase_of(yr, div_year)
            if e.get("phase") != want_phase:
                err("%s: year %d vs divergence %d implies phase %r but phase is %r "
                    "(set phaseIsAuthored on the lineage if that is deliberate)"
                    % (tag, yr, div_year, want_phase, e.get("phase")))
        if e.get("phase") not in PHASES:
            err("%s: phase %r not in %s" % (tag, e.get("phase"), sorted(PHASES)))
        if e.get("importance") not in (1, 2, 3):
            warn("%s: importance %r should be 1, 2 or 3" % (tag, e.get("importance")))
        if e.get("confidence") not in CONF:
            err("%s: confidence %r not in %s" % (tag, e.get("confidence"), sorted(CONF)))

    years = [e["year"] for e in evs if isinstance(e, dict) and isinstance(e.get("year"), int)]
    if years != sorted(years):
        err("%s/%s: events are not in ascending year order" % (name, lid))

    tiers = set(e.get("tier") for e in evs if isinstance(e, dict))
    if "T2" not in tiers and "T1" not in tiers:
        warn("%s/%s: no T2 or T1 event; this branch never leaves the 20th century "
             "or earlier, so it will not reach into our own future. That is a fine "
             "result for some fictions - just make sure groupingNote says so"
             % (name, lid))
    if "T1" not in tiers:
        warn("%s/%s: no T1 (year >= 2300) event; the branch stops short of deep time"
             % (name, lid))
    return lin


def main():
    parts = load_parts()
    order = load_group_order()

    groups = []
    group_ids = set()
    lineages = []
    seen_ids = set()

    for name, data in parts:
        g = check_group(name, data.get("group"))
        if g is None:
            continue
        if g["id"] in group_ids:
            err("%s: duplicate group id %r across part files" % (name, g["id"]))
            continue
        group_ids.add(g["id"])
        groups.append(g)

        lins = data.get("lineages")
        if not isinstance(lins, list) or not lins:
            err("%s: 'lineages' must be a non-empty list" % name)
            continue
        for lin in lins:
            if not isinstance(lin, dict):
                err("%s: a lineage is not an object" % name)
                continue
            checked = check_lineage(name, lin, g["id"], seen_ids)
            if checked:
                lineages.append(checked)

    # archetypes have a deliberate reading order, not an alphabetical one
    rank = {gid: i for i, gid in enumerate(order)}
    unknown = [g["id"] for g in groups if g["id"] not in rank]
    for gid in unknown:
        warn("group %r is not listed in data/groups.json 'order'; it will sort last" % gid)
    groups.sort(key=lambda g: (rank.get(g["id"], len(rank)), g["id"]))

    if errors:
        print("VALIDATION FAILED - %d error(s):\n" % len(errors))
        for e in errors:
            print("  ERROR  " + e)
        if warnings:
            print("\n%d warning(s):" % len(warnings))
            for w in warnings:
                print("  warn   " + w)
        return 1

    gorder = {g["id"]: i for i, g in enumerate(groups)}
    lineages.sort(key=lambda l: (gorder.get(l.get("group"), 99),
                                 l.get("divergence", {}).get("year", 0),
                                 l.get("title", "")))

    # Cross-file check: the leading token of an event id should point at its own
    # lineage, not at a sibling. This catches an event filed under the wrong
    # story, which id uniqueness alone would miss.
    prefix_owners = {}
    for lin in lineages:
        for cand in {lin["id"], re.sub(r"[^a-z0-9]", "", lin["id"].lower()),
                     re.sub(r"[aeiou]", "", re.sub(r"[^a-z0-9]", "", lin["id"].lower()))}:
            if len(cand) >= 2:
                prefix_owners.setdefault(cand, set()).add(lin["id"])
    for lin in lineages:
        for e in lin.get("events", []):
            eid = str(e.get("id", ""))
            head = re.split(r"[-_]", eid.lower())[0]
            owners = prefix_owners.get(head)
            if owners and lin["id"] not in owners:
                err("%s/%s: event id %r uses the prefix of %s"
                    % (lin["id"], eid, sorted(owners)))

    lineage_ids = set(l["id"] for l in lineages)
    worlds = load_worlds(lineage_ids)
    for lid in sorted(lineage_ids):
        if lid not in worlds:
            warn("lineage %r has no world dossier; its World tab will be empty" % lid)

    payload = {
        "meta": {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "data/parts/*.json",
            "lineages": len(lineages),
            "events": sum(len(l.get("events", [])) for l in lineages),
            "groups": len(groups),
            "worlds": len(worlds),
            "note": ("Real-world calendar years throughout. In-universe date systems "
                     "(BBY, AG, GE, stardates, millennium notation) are preserved per event "
                     "in the inUniverse field."),
        },
        "groups": groups,
        "lineages": lineages,
        "worlds": [worlds[l["id"]] for l in lineages if l["id"] in worlds],
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)

    embedded = False
    if os.path.exists(HTML):
        with open(HTML, "r", encoding="utf-8") as fh:
            html = fh.read()
        start = html.find(EMBED_MARK)
        if start == -1:
            err("timeline.html has no %s marker; cannot embed" % EMBED_MARK)
        else:
            body_start = start + len(EMBED_MARK)
            end = html.find("</script>", body_start)
            if end == -1:
                err("timeline.html embedded-data script tag is not closed")
            else:
                compact = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                # guard: the JSON must not be able to terminate the script tag
                if "</script" in compact.lower():
                    err("serialized JSON contains a closing script tag; refusing to embed")
                else:
                    html = html[:body_start] + "\n" + compact + "\n" + html[end:]
                    with open(HTML, "w", encoding="utf-8") as fh:
                        fh.write(html)
                    embedded = True

    print("OK  %d groups, %d lineages, %d events"
          % (len(groups), len(lineages), payload["meta"]["events"]))
    print("    wrote %s (%.1f KB)"
          % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024.0))
    if embedded:
        print("    embedded a copy inside timeline.html (%.1f KB)"
              % (os.path.getsize(HTML) / 1024.0))
    for g in groups:
        n = sum(1 for l in lineages if l["group"] == g["id"])
        ev = sum(len(l["events"]) for l in lineages if l["group"] == g["id"])
        print("      %-26s %2d lineages %4d events" % (g["name"], n, ev))
    if warnings:
        print("\n%d warning(s):" % len(warnings))
        for w in warnings:
            print("  warn   " + w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
