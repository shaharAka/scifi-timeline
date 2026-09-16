#!/usr/bin/env python3
"""
Try one plate that carries BOTH a world's art direction and a specific event.

A world plate is atmosphere: what the setting is like. An event plate has to
depict something happening, which is a different job. This builds the combined
prompt from the world's own direction plus the event's description, prints the
exact text sent to the model, and writes the result to assets/test/ so it never
touches the production plates.

    python3 tools/test-event-art.py star-wars 1977
    python3 tools/test-event-art.py dune 26390 --dry-run
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIRECTION = ROOT / "tools" / "art-direction.json"
OUT = ROOT / "assets" / "test"


def load_env():
    path = ROOT / ".env"
    if not path.exists():
        return {}
    out = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("world")
    ap.add_argument("year", type=int, help="the event's real-world year")
    ap.add_argument("--dry-run", action="store_true", help="print the prompt only")
    ap.add_argument("--mode", choices=["combined", "style", "bare"], default="style",
                    help="combined: world scene + event (the first test); "
                         "style: the register only + event (default); "
                         "bare: the event description alone")
    args = ap.parse_args()

    data = json.loads((ROOT / "data" / "timeline-data.json").read_text())
    lineage = next((l for l in data["lineages"] if l["id"] == args.world), None)
    if not lineage:
        print("no world %r" % args.world)
        return 2
    event = next((e for e in lineage["events"] if e["year"] == args.year), None)
    if not event:
        print("no event in %s at %s. Available:" % (args.world, args.year))
        for e in lineage["events"]:
            print("   %8s  %s" % (e["year"], e["title"]))
        return 2

    direction = json.loads(DIRECTION.read_text())
    world_spec = (direction.get("worlds") or {}).get(args.world)
    if not world_spec:
        print("no art direction for %r in tools/art-direction.json" % args.world)
        return 2

    defaults = direction.get("defaults", {})
    neg = world_spec.get("negative") or defaults.get("negative", "")

    # The world's direction is the style; the event is the subject. Both are
    # printed so the prompt can be judged on its own terms.
    world_prompt = world_spec["prompt"]
    # The register ("Painted in the style of ...") is reusable across every event
    # in a world; the scene before it is not - handing the model a fully
    # specified scene makes it paint that scene and demote the event to a detail.
    m = re.search(r"((?:Painted|Rendered|Drawn)\b.*)$", world_prompt, re.S)
    style = m.group(1).strip() if m else ""

    subject = "Depict a single moment: " + event["description"]
    if args.mode == "combined":
        head = world_prompt
    elif args.mode == "style":
        head = style
    else:
        head = ""
    prompt = " ".join(x for x in [head, subject,
                                  ("Constraints: " + neg + ".") if neg else ""] if x)

    print("=" * 78)
    print("WORLD   %s  (forks %s)" % (lineage["title"], lineage["divergence"]["year"]))
    print("EVENT   %s  %s" % (event["year"], event["title"]))
    print("=" * 78)
    print(prompt)
    print("=" * 78)
    print("mode    %s" % args.mode)
    print("characters: %d" % len(prompt))

    if args.dry_run:
        return 0

    env = load_env()
    key = env.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not key:
        print("no GEMINI_API_KEY (see .env.example)")
        return 3
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("run this with isramarket's venv:\n"
              "  /Users/shahar/Documents/isramarket/api/.venv/bin/python tools/test-event-art.py ...")
        return 3

    client = genai.Client(api_key=key)
    model = env.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
    size = env.get("GEMINI_IMAGE_SIZE", "2K")
    aspect = world_spec.get("aspectRatio") or defaults.get("aspectRatio", "4:3")
    print("\ngenerating (%s, %s) ..." % (model, aspect), flush=True)
    t0 = time.time()
    resp = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio=aspect, image_size=size),
            thinking_config=types.ThinkingConfig(thinking_level="MINIMAL"),
        ),
    )

    parts = getattr(resp, "parts", None) or []
    if not parts and resp.candidates:
        c = resp.candidates[0]
        parts = (c.content.parts if c.content else []) or []
    blob = None
    for part in parts:
        if getattr(part, "thought", False):
            continue
        inline = getattr(part, "inline_data", None)
        if inline and inline.data:
            blob = bytes(inline.data)
            break
    if not blob:
        finish = resp.candidates[0].finish_reason if resp.candidates else "no candidates"
        print("no image returned (finish=%s)" % finish)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    ext = "jpg" if blob[:3] == b"\xff\xd8\xff" else "png"
    dest = OUT / ("%s-%d-%s.%s" % (args.world, args.year, args.mode, ext))
    dest.write_bytes(blob)
    print("\nwrote %s  (%d KB in %.1fs)" % (
        dest.relative_to(ROOT), len(blob) // 1024, time.time() - t0))
    (OUT / "PROMPTS.txt").open("a").write(
        "=== %s @ %s (%s) ===\n%s\n\n" % (args.world, args.year, event["title"], prompt))
    return 0


if __name__ == "__main__":
    sys.exit(main())
