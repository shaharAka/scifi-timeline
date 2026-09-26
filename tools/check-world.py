#!/usr/bin/env python3
"""Vet a researched world file before it enters the atlas, and merge it on request.

    python3 tools/check-world.py FILE            report
    python3 tools/check-world.py FILE --merge    merge into data/parts/<group>.json
                                                 and data/parts/worlds/<worlds-file>

FILE is {"group", "lineage", "dossier"} as tools/world-brief.py asks for.
Exit 1 if anything would fail the build or break the drawer.
"""
import json, re, sys, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORLDS_FILE = os.path.join(ROOT, "data", "parts", "worlds", "present-day.json")

def main():
    _bins = json.load(open(os.path.join(ROOT, "data", "bins.json")))["bins"]
    bins = {b["id"] for b in _bins}
    subs = {b["id"]: [x["id"] for x in b.get("subs") or []] for b in _bins}
    fac = json.load(open(os.path.join(ROOT, "data", "facets.json")))
    existing = {}
    for f in glob.glob(os.path.join(ROOT, "data", "parts", "*.json")):
        for l in json.load(open(f))["lineages"]:
            existing[l["id"]] = f
            for e in l["events"]: existing[e["id"]] = f
    problems, notes = [], []
    P = problems.append
    tier = lambda y: "T4" if y < 1900 else "T3" if y < 2000 else "T2" if y < 2300 else "T1"
    phase = lambda y, dv: "prehistory" if y < dv else "fork" if y <= dv + 2 else "aftermath" if y <= dv + 50 else "deep"
    path = sys.argv[1]
    doc = json.load(open(path))
    g, l, d = doc.get("group"), doc.get("lineage"), doc.get("dossier")
    # an ASCII arrow is the same clause; build-data.py wants the character
    for e in (l or {}).get("events") or []:
        f = e.get("facets")
        if f and isinstance(f.get("change"), str): f["change"] = f["change"].replace("->", "\u2192")
    groups = {os.path.basename(f)[:-5] for f in glob.glob(os.path.join(ROOT, "data", "parts", "*.json"))}
    if g not in groups: P("group %r is not an archetype file" % g)
    for k in ("id","title","medium","creator","originYear","group","epoch","franchiseStatus","divergence","ending","events","groupingNote"):
        if l.get(k) in (None, "", [], {}): P("lineage missing %s" % k)
    if l["id"] in existing: P("lineage id %s already exists" % l["id"])
    # the build rejects an event id whose leading token names another world
    # (its id, the id without punctuation, or without vowels: "hl" is Halo)
    owners = {}
    for oid in existing:
        flat = re.sub(r"[^a-z0-9]", "", oid.lower())
        for cand in {oid, flat, re.sub(r"[aeiou]", "", flat)}:
            if len(cand) >= 2: owners.setdefault(cand, set()).add(oid)
    for e in l.get("events") or []:
        head = re.split(r"[-_]", str(e.get("id", "")).lower())[0]
        if head in owners and l["id"] not in owners[head]:
            P("event id %s starts with %r, which the build reads as %s; use another prefix" % (e.get("id"), head, sorted(owners[head])))
    if l.get("group") != g: P("lineage.group != group")
    dv = l["divergence"]["year"]
    ev = l["events"]; ys = [e["year"] for e in ev]
    if ys != sorted(ys): P("events not ascending")
    if len(set(ys)) != len(ys): P("duplicate years %s" % sorted({y for y in ys if ys.count(y) > 1}))
    for e in ev:
        tag = e.get("id")
        for k in ("id","year","title","description","tier","phase","importance","kind","confidence"):
            if e.get(k) in (None, ""): P("%s missing %s" % (tag, k))
        if tag in existing: P("event id %s exists" % tag)
        if e["tier"] != tier(e["year"]): P("%s tier %s should be %s" % (tag, e["tier"], tier(e["year"])))
        if not l.get("phaseIsAuthored") and e["phase"] != phase(e["year"], dv): P("%s phase %s should be %s" % (tag, e["phase"], phase(e["year"], dv)))
        b = e.get("bin")
        if e.get("kind") == "publication": continue
        if e["year"] < dv and b in ("machine-awakens", "first-contact", "time-traveller-arrives", "gateway-opens"):
            notes.append("%s: a fictional %s is filed before the fork - is the divergence too late?" % (tag, b))
        if b not in bins: P("%s bin %r unknown" % (tag, b)); continue
        if subs.get(b) and e.get("sub") not in subs[b]:
            P("%s bin %s needs a sub, one of %s (got %r)" % (tag, b, ", ".join(subs[b]), e.get("sub")))
        elif not subs.get(b) and e.get("sub"): P("%s bin %s has no sub-kinds, drop sub %r" % (tag, b, e.get("sub")))
        f = e.get("facets")
        if not f: P("%s has no facets" % tag); continue
        for k in ("mechanism","actor","position","scope","domain"):
            if f.get(k) not in fac[k]: P("%s facet %s=%r not in vocabulary" % (tag, k, f.get(k)))
        for k in ("preconditions","outcomes"):
            for v in f.get(k) or []:
                if v not in fac[k]: P("%s %s value %r not in vocabulary" % (tag, k, v))
        if "\u2192" not in str(f.get("change") or ""): P("%s facets.change must be 'before \u2192 after' with the arrow character, not ->" % tag)
        dr = f.get("direction") or {}
        for k in ("power","openness","capability","population"):
            if dr.get(k) not in (-1, 0, 1): P("%s direction.%s=%r" % (tag, k, dr.get(k)))
    for s in (l.get("sources") or []) + (l["divergence"].get("sources") or []) + sum([e.get("sources") or [] for e in ev], []):
        if not (isinstance(s, dict) and s.get("title") and str(s.get("url","")).startswith("http")): P("bad source %r" % s)
    if l["ending"].get("valence") not in ("optimistic","pessimistic","unknown"): P("bad ending valence")
    if d:
        if d.get("id") != l["id"]: P("dossier id mismatch")
        for key, need in (("locations", ("name","blurb")), ("factions", ("name","blurb")), ("whereToStart", ("title",)), ("connections", ("id",))):
            for i, it in enumerate(d.get(key) or []):
                if not isinstance(it, dict) or any(not it.get(x) for x in need): P("dossier %s[%d] must be an object with %s" % (key, i, ", ".join(need)))
        for c in d.get("connections") or []:
            if isinstance(c, dict) and c.get("id") not in existing: P("connection to %r is not a lineage in the atlas" % c.get("id"))
    chain = [e["bin"] for e in ev if e.get("bin") and e["year"] >= dv]
    print("%s | %s | fork %s | %d events | ending %s" % (l["id"], g, dv, len(ev), l["ending"]["valence"]))
    print("  chain:", " -> ".join(chain))
    for n in notes: print("  note:", n)
    for p in problems: print("  PROBLEM:", p)
    if "--merge" in sys.argv:
        if problems: sys.exit("not merged: fix problems first")
        pf = os.path.join(ROOT, "data", "parts", "%s.json" % g)
        raw = open(pf).read(); part = json.loads(raw)
        part["lineages"].append(l)
        m = re.search(r'\n( +)"', raw); ind = len(m.group(1)) if m else 2
        open(pf, "w").write(json.dumps(part, indent=ind, ensure_ascii=False) + "\n")
        wd = json.load(open(WORLDS_FILE)) if os.path.exists(WORLDS_FILE) else {"worlds": []}
        wd["worlds"] = [w for w in wd["worlds"] if w["id"] != l["id"]] + ([d] if d else [])
        open(WORLDS_FILE, "w").write(json.dumps(wd, indent=2, ensure_ascii=False) + "\n")
        print("  merged into", os.path.basename(pf), "and", os.path.basename(WORLDS_FILE))
    sys.exit(1 if problems else 0)

if __name__ == "__main__":
    main()
