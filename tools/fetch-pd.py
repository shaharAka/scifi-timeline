#!/usr/bin/env python3
"""
Fetch the real-world counterpart images declared in tools/pd-sources.json.

These are genuine photographs of real objects, places and events - the honest
visual companion to a chart whose whole claim is provenance. Every file comes
from Wikimedia Commons and its licence is verified HERE, at fetch time; anything
that is not public domain, CC0, or a CC attribution licence is refused rather
than guessed at. Attribution is recorded and surfaced in the UI, which is what
the attribution licences require.

    python3 tools/fetch-pd.py --check    verify the manifest without fetching
    python3 tools/fetch-pd.py            fetch anything missing
    python3 tools/fetch-pd.py --force    refetch everything

Output: assets/pd/<world>.jpg  +  assets/PD-CREDITS.json
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "tools", "pd-sources.json")
OUT_DIR = os.path.join(ROOT, "assets", "pd")
CREDITS = os.path.join(ROOT, "assets", "PD-CREDITS.json")
UA = "scifi-timeline/1.0 (comparative chronology atlas; local research)"
API = "https://commons.wikimedia.org/w/api.php"


def api(params):
    params = dict(params)
    params["format"] = "json"
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def strip_tags(s):
    """Commons returns HTML-ish credit fields; flatten them to plain text."""
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or ""))).strip()


def lookup(filename, width=1400):
    d = api({
        "action": "query",
        "titles": "File:" + filename,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": str(width),
    })
    for page in (d.get("query", {}).get("pages", {}) or {}).values():
        info = (page.get("imageinfo") or [{}])[0]
        if not info or not info.get("thumburl"):
            return None
        em = info.get("extmetadata", {}) or {}

        def field(key):
            return strip_tags((em.get(key, {}) or {}).get("value", ""))

        return {
            "commonsTitle": page.get("title"),
            "thumb": info.get("thumburl"),
            "deskUrl": info.get("descriptionurl"),
            "license": field("LicenseShortName"),
            "licenseUrl": field("LicenseUrl"),
            "author": field("Artist")[:120],
            "credit": field("Credit")[:160],
        }
    return None


def licence_ok(name, allowed):
    low = (name or "").strip().lower()
    if not low:
        return False
    return any(a in low for a in allowed)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--check", action="store_true", help="report coverage only")
    args = ap.parse_args()

    if not os.path.exists(MANIFEST):
        print("tools/pd-sources.json is missing")
        return 1
    manifest = json.loads(open(MANIFEST, encoding="utf-8").read())
    sources = manifest.get("sources", {})
    allowed = [a.lower() for a in manifest.get("allowLicenses", ["public domain"])]
    if not sources:
        print("manifest declares no sources")
        return 1

    credits = {}
    if os.path.exists(CREDITS):
        try:
            credits = json.loads(open(CREDITS, encoding="utf-8").read())
        except json.JSONDecodeError:
            credits = {}

    if args.check:
        have = [w for w in sources if os.path.exists(os.path.join(OUT_DIR, w + ".jpg"))]
        print("PD counterparts: %d/%d fetched" % (len(have), len(sources)))
        for w in sorted(set(sources) - set(have)):
            print("   missing: " + w)
        return 0 if len(have) == len(sources) else 1

    os.makedirs(OUT_DIR, exist_ok=True)
    got = refused = failed = 0
    for world, spec in sorted(sources.items()):
        dest = os.path.join(OUT_DIR, world + ".jpg")
        if os.path.exists(dest) and not args.force and world in credits:
            continue
        try:
            info = lookup(spec["file"])
        except Exception as exc:  # noqa: BLE001
            print("  %-22s lookup failed: %s" % (world, str(exc)[:60]))
            failed += 1
            time.sleep(2.0)
            continue
        if not info:
            print("  %-22s not found on Commons: %s" % (world, spec["file"]))
            failed += 1
            time.sleep(2.0)
            continue
        if not licence_ok(info["license"], allowed):
            print("  %-22s REFUSED - licence %r is not in %s"
                  % (world, info["license"], allowed))
            refused += 1
            time.sleep(2.0)
            continue
        try:
            req = urllib.request.Request(info["thumb"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                blob = r.read()
        except Exception as exc:  # noqa: BLE001
            print("  %-22s download failed: %s" % (world, str(exc)[:60]))
            failed += 1
            time.sleep(2.0)
            continue
        with open(dest, "wb") as fh:
            fh.write(blob)
        credits[world] = {
            "kind": "public-domain" if "public domain" in info["license"].lower() else "open-license",
            "file": "assets/pd/" + world + ".jpg",
            "caption": spec.get("caption", ""),
            "why": spec.get("why", ""),
            "license": info["license"],
            "licenseUrl": info["licenseUrl"],
            "author": info["author"],
            "credit": info["credit"],
            "sourceTitle": info["commonsTitle"],
            "sourcePage": info["deskUrl"],
            "bytes": len(blob),
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        got += 1
        print("  %-22s %-18s %s" % (world, info["license"], info["commonsTitle"]))
        time.sleep(2.0)

    with open(CREDITS, "w", encoding="utf-8") as fh:
        json.dump(credits, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print("\n  fetched %d, refused %d, failed %d" % (got, refused, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
