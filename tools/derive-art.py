#!/usr/bin/env python3
"""
Derive web-sized copies of the art plates.

The generated plates are 2K JPEGs (~2.4 MB each, ~55 MB for 24). The page needs
two much smaller things: a header image for the world drawer, and a soft field
behind the chart for the selected world. Both are derived here and committed, so
a fresh clone has a working page without re-running the generator or sips.

    python3 tools/derive-art.py          derive anything missing
    python3 tools/derive-art.py --force  redo everything
    python3 tools/derive-art.py --check  report only, exit 1 if anything is missing

Source:  assets/<id>.jpg          (generated, committed)
Output:  assets/derived/<id>-lg.jpg   1000px, drawer header
         assets/derived/<id>-sm.jpg    560px, canvas field
"""
import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
DERIVED = os.path.join(ASSETS, "derived")
SIZES = [("lg", 1000, 72), ("sm", 560, 68)]


def find_sips():
    p = shutil.which("sips")
    if not p:
        print("sips not found. It ships with macOS; on Linux use ImageMagick instead.")
        sys.exit(3)
    return p


def sources():
    if not os.path.isdir(ASSETS):
        return []
    return sorted(
        os.path.join(ASSETS, n)
        for n in os.listdir(ASSETS)
        if n.lower().endswith((".jpg", ".jpeg", ".png"))
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    srcs = sources()
    if not srcs:
        print("no source plates in assets/ - run tools/gen-art.py first")
        return 1

    missing = []
    for size, _px, _q in SIZES:
        for s in srcs:
            stem = os.path.splitext(os.path.basename(s))[0]
            out = os.path.join(DERIVED, "%s-%s.jpg" % (stem, size))
            if not os.path.exists(out):
                missing.append((s, size, out))

    if args.check:
        if missing:
            print("%d derived image(s) missing:" % len(missing))
            for _s, size, out in missing[:12]:
                print("   " + os.path.relpath(out, ROOT))
            return 1
        print("OK  %d sources, %d derived files present" % (len(srcs), len(srcs) * len(SIZES)))
        return 0

    sips = find_sips()
    os.makedirs(DERIVED, exist_ok=True)
    made = 0
    for s in srcs:
        stem = os.path.splitext(os.path.basename(s))[0]
        for size, px, quality in SIZES:
            out = os.path.join(DERIVED, "%s-%s.jpg" % (stem, size))
            if os.path.exists(out) and not args.force:
                continue
            cmd = [sips, "-Z", str(px), "-s", "format", "jpeg",
                   "-s", "formatOptions", str(quality), s, "--out", out]
            r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if r.returncode != 0 or not os.path.exists(out):
                print("  failed: %s (%s)" % (os.path.basename(s), size))
                continue
            made += 1
    print("derived %d file(s) into assets/derived/" % made)
    return 0


if __name__ == "__main__":
    sys.exit(main())
