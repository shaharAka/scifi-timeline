#!/usr/bin/env python3
"""
Match moments by SITUATION and read them forward by OUTCOME.

    python3 tools/facet-match.py                    neighbours of every real beat, with each neighbour's next beats
    python3 tools/facet-match.py --id real-covid-2020 --k 6
    python3 tools/facet-match.py --all              neighbours of every event, fiction included (long)
    python3 tools/facet-match.py --surprises        cross-bin joins: strong matches that a single bin would have kept apart

Similarity is over mechanism, actor, position, domain, scope, the direction
vector and the preconditions. Outcomes are held out: they are what the match
is for. Reported as 0..1; under ~0.5 means nothing close.
"""
import argparse, glob, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCOPE = ["local","national","civilisational","planetary","beyond"]
W = dict(mechanism=3, actor=2, position=2.5, domain=2, scope=1, direction=2.5, preconditions=2)

def load():
    moments = []      # (world, event) in world order
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "parts", "*.json"))):
        d = json.load(open(path, encoding="utf-8"))
        for l in d["lineages"]:
            evs = [e for e in l["events"] if e.get("facets")]
            for i, e in enumerate(evs):
                moments.append(dict(world=l["id"], title=l["title"], e=e, idx=i, seq=evs))
    rp = os.path.join(ROOT, "data", "real-history.json")
    if os.path.exists(rp):
        r = json.load(open(rp, encoding="utf-8"))
        evs = [e for e in r["events"] if e.get("facets")]
        for i, e in enumerate(evs):
            moments.append(dict(world="real", title="Real history", e=e, idx=i, seq=evs))
    return moments

def jac(a, b):
    a, b = set(a), set(b)
    return len(a & b) / len(a | b) if (a | b) else 0
def cosine(a, b):
    na = math.sqrt(sum(x*x for x in a)); nb = math.sqrt(sum(x*x for x in b))
    return (sum(x*y for x, y in zip(a, b)) / (na*nb)) if na and nb else 0
def vec(fx):
    d = fx["direction"]; return (d["power"], d["openness"], d["capability"], d["population"])

def sim(a, b):
    s = 0
    s += W["mechanism"] * (a["mechanism"] == b["mechanism"])
    s += W["actor"] * (a["actor"] == b["actor"])
    s += W["position"] * (a["position"] == b["position"])
    s += W["domain"] * (a["domain"] == b["domain"])
    s += W["scope"] * (1 - abs(SCOPE.index(a["scope"]) - SCOPE.index(b["scope"])) / 4)
    s += W["direction"] * (cosine(vec(a), vec(b)) + 1) / 2
    s += W["preconditions"] * jac(a["preconditions"], b["preconditions"])
    return s / sum(W.values())

def label(m):
    e = m["e"]; return "%-22s %6s  %s" % (m["world"], e["year"], e["title"][:52])

def neighbours(m, moments, k):
    out = sorted(((sim(m["e"]["facets"], o["e"]["facets"]), o) for o in moments
                  if o is not m and o["world"] != m["world"]), key=lambda t: -t[0])
    return out[:k]

def show(m, moments, k, forward):
    e = m["e"]
    print("\n" + "=" * 100)
    print("%s [%s]" % (label(m), e.get("bin")))
    print("   %s" % e["facets"]["change"])
    for s, o in neighbours(m, moments, k):
        print("   %.2f  %s [%s]" % (s, label(o), o["e"].get("bin")))
        if forward:
            nxt = o["seq"][o["idx"] + 1 : o["idx"] + 1 + forward]
            for n in nxt:
                print("            → %6s  %-40s [%s]" % (n["year"], n["title"][:40], n.get("bin")))
            if not nxt:
                print("            → (the charted history ends here)")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id"); ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--forward", type=int, default=3, help="how many following beats to read from each neighbour")
    ap.add_argument("--all", action="store_true"); ap.add_argument("--surprises", action="store_true")
    ap.add_argument("--min", type=float, default=0.72, help="similarity floor for --surprises")
    a = ap.parse_args()
    moments = load()
    if a.surprises:
        seen = set()
        for m in moments:
            for s, o in neighbours(m, moments, a.k):
                key = tuple(sorted([m["e"]["id"], o["e"]["id"]]))
                if s >= a.min and m["e"].get("bin") != o["e"].get("bin") and key not in seen:
                    seen.add(key)
                    print("%.2f  %s [%s]\n      %s [%s]" % (s, label(m), m["e"].get("bin"), label(o), o["e"].get("bin")))
        return
    if a.id:
        ms = [m for m in moments if m["e"]["id"] == a.id]
        if not ms: sys.exit("no moment with id %r" % a.id)
        show(ms[0], moments, a.k, a.forward); return
    for m in moments:
        if a.all or m["world"] == "real":
            show(m, moments, a.k, a.forward)

if __name__ == "__main__":
    main()
