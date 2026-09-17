#!/usr/bin/env python3
"""
Harness fixture - NOT part of the dataset.

Writes a two-group / four-lineage payload to a temp location and exercises the
real build-data.py validation + aggregation logic against it, so the pipeline is
provably working before the researched data lands.

    python3 test-fixture.py
"""

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, "build-data.py")


def load_build_module():
    spec = importlib.util.spec_from_file_location("build_data", BUILD)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


GROUP_A = {
    "id": "hidden-history",
    "name": "Hidden History",
    "tagline": "The world is already stranger than we know.",
    "question": "Where are they hiding?",
    "divergenceMechanism": "A secret breach kept off the record.",
    "color": "#8b5cf6",
}

GROUP_B = {
    "id": "alternate-past",
    "name": "Alternate Past",
    "tagline": "History took a different turn.",
    "question": "What if it had gone the other way?",
    "divergenceMechanism": "An explicit counterfactual.",
    "color": "#f59e0b",
}


def ev(eid, year, title, tier, imp, kind="event", iu=None, note="", phase="fork"):
    return {
        "id": eid, "year": year, "date": str(year), "title": title,
        "description": "Fixture event: %s." % title,
        "tier": tier, "phase": phase, "importance": imp, "kind": kind,
        "inUniverse": iu, "confidence": "high", "note": note,
    }


def fixture_payload():
    """A valid two-lineage payload in the aggregated shape, for test-viewer.js."""
    return {
        "meta": {"source": "fixture", "lineages": 2, "events": 8, "groups": 2},
        "groups": [GROUP_A, GROUP_B],
        "lineages": [dict(LIN_A, _g=GROUP_A), dict(LIN_B, _g=GROUP_B)],
    }


LIN_A = {
    "id": "fixture-hidden",
    "title": "Fixture Hidden History",
    "medium": "tv",
    "creator": "Fixture Author",
    "originYear": 1993,
    "group": "hidden-history",
    "epoch": "present",
    "franchiseStatus": "ongoing",
    "ending": {"valence": "unknown", "why": "A fixture: the arc is left open on purpose."},
    "divergence": {
        "year": 1947, "label": "The recovery", "delta": "Real: nothing happened. Fiction: everything did.",
        "inUniverse": None, "confidence": "high", "note": "fixture",
    },
    "events": [
        ev("fixture-hidden-a", -1500, "Deep past contact", "T4", 1, phase="prehistory"),
        ev("fixture-hidden-b", 1947, "The recovery", "T3", 3, "discovery"),
        ev("fixture-hidden-c", 1993, "Present day opens", "T3", 2, phase="aftermath"),
        ev("fixture-hidden-d", 2380, "The colony", "T1", 2, phase="deep",
           note="real history has not reached this"),
    ],
    "groupingNote": "Fixture grouping note.",
}

LIN_B = {
    "id": "fixture-alt",
    "title": "Fixture Alternate Past",
    "medium": "book",
    "creator": "Fixture Author",
    "originYear": 1962,
    "group": "alternate-past",
    "epoch": "present",
    "franchiseStatus": "concluded",
    "ending": {"valence": "pessimistic", "why": "A fixture: the arc ends badly."},
    "divergence": {
        "year": 1933, "label": "The assassination succeeds",
        "delta": "Real: it failed. Fiction: it worked.", "inUniverse": None,
        "confidence": "medium", "note": "fixture",
    },
    "events": [
        ev("fixture-alt-a", 1933, "The fork", "T3", 3, "politics"),
        ev("fixture-alt-b", 1947, "The occupation", "T3", 2, "war", phase="aftermath"),
        ev("fixture-alt-c", 1962, "Story present", "T3", 2, phase="aftermath"),
        ev("fixture-alt-d", 2010, "Aftermath", "T2", 1, iu="Year 77", phase="deep"),
    ],
    "groupingNote": "Fixture grouping note.",
}


def main():
    tmp = tempfile.mkdtemp(prefix="timeline-fixture-")
    try:
        parts = os.path.join(tmp, "data", "parts")
        os.makedirs(parts)
        with open(os.path.join(parts, "hidden-history.json"), "w") as fh:
            json.dump({"group": GROUP_A, "lineages": [LIN_A]}, fh, indent=1)
        with open(os.path.join(parts, "alternate-past.json"), "w") as fh:
            json.dump({"group": GROUP_B, "lineages": [LIN_B]}, fh, indent=1)

        mod = load_build_module()
        mod.PARTS = parts
        mod.GROUPS_FILE = os.path.join(tmp, "data", "groups.json")
        mod.OUT = os.path.join(tmp, "data", "timeline-data.json")
        mod.HTML = os.path.join(tmp, "nonexistent.html")
        with open(mod.GROUPS_FILE, "w") as fh:
            json.dump({"order": ["hidden-history", "alternate-past"]}, fh)

        rc = mod.main()
        if rc != 0:
            print("\nfixture: build-data returned %d (expected 0)" % rc)
            return 1

        with open(mod.OUT) as fh:
            payload = json.load(fh)
        assert payload["meta"]["lineages"] == 2, payload["meta"]
        assert payload["meta"]["events"] == 8, payload["meta"]
        assert len(payload["groups"]) == 2
        # lineages must be grouped together, not globally year-sorted
        assert [l["group"] for l in payload["lineages"]] == ["hidden-history", "alternate-past"]
        assert [l["id"] for l in payload["lineages"]] == ["fixture-hidden", "fixture-alt"]

        # ---- now prove the negative cases are actually caught ----
        bad = dict(LIN_B)
        bad["events"] = [ev("fixture-alt-a", 1962, "later", "T3", 2),
                         ev("fixture-alt-b", 1933, "earlier", "T3", 2)]
        with open(os.path.join(parts, "alternate-past.json"), "w") as fh:
            json.dump({"group": GROUP_B, "lineages": [bad]}, fh, indent=1)
        mod.errors = []
        mod.warnings = []
        silent = _capture(mod.main)
        if "not in ascending year order" not in silent:
            print("\nfixture: out-of-order events were NOT rejected")
            print(silent)
            return 1

        # duplicate year
        dupe = dict(LIN_B)
        dupe["events"] = [ev("fixture-alt-a", 1933, "one", "T3", 2),
                          ev("fixture-alt-b", 1933, "two", "T3", 2)]
        with open(os.path.join(parts, "alternate-past.json"), "w") as fh:
            json.dump({"group": GROUP_B, "lineages": [dupe]}, fh, indent=1)
        mod.errors = []
        mod.warnings = []
        silent = _capture(mod.main)
        if "share the year" not in silent:
            print("\nfixture: duplicate years were NOT rejected")
            print(silent)
            return 1

        # bad confidence value
        badconf = json.loads(json.dumps(LIN_B))
        badconf["events"][0]["confidence"] = "pretty sure"
        with open(os.path.join(parts, "alternate-past.json"), "w") as fh:
            json.dump({"group": GROUP_B, "lineages": [badconf]}, fh, indent=1)
        mod.errors = []
        mod.warnings = []
        silent = _capture(mod.main)
        if "confidence" not in silent:
            print("\nfixture: invalid confidence was NOT rejected")
            print(silent)
            return 1

        # keep the aggregated fixture around so test-viewer.js can render it
        keep = os.path.join(ROOT, "data", ".test-fixture.json")
        with open(keep, "w") as fh:
            json.dump(fixture_payload(), fh, indent=1)

        print("\nfixture: PASS - aggregation works and invalid data is rejected")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _capture(fn):
    import io
    import contextlib
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        fn()
    return buf.getvalue()


if __name__ == "__main__":
    sys.exit(main())
