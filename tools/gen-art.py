#!/usr/bin/env python3
"""
Generate per-world art plates with Gemini, from tools/art-direction.json.

Every prompt describes TECHNIQUE, ERA, PALETTE and MOOD only. Nothing here asks
for a franchise's characters, vessels, logos or named locations: that keeps the
output clear of derivative-work territory and is also what the model will accept.

    python3 tools/gen-art.py --list                 show what would be generated
    python3 tools/gen-art.py --only dune            generate one
    python3 tools/gen-art.py                        generate everything missing
    python3 tools/gen-art.py --force --only dune    regenerate

Reads GEMINI_API_KEY from .env (never committed). Writes assets/<id>.png and
records provenance in assets/ART-CREDITS.json, which the build reads.
"""
import argparse, json, os, sys, time, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
DIRECTION = ROOT / "tools" / "art-direction.json"
CREDITS = ASSETS / "ART-CREDITS.json"


def load_env():
    """Minimal .env reader - avoids a dotenv dependency."""
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


def load_credits():
    if CREDITS.exists():
        try:
            return json.loads(CREDITS.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def save_credits(data):
    ASSETS.mkdir(parents=True, exist_ok=True)
    CREDITS.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")


def build_prompt(spec, defaults):
    parts = [spec["prompt"]]
    neg = spec.get("negative") or defaults.get("negative")
    if neg:
        parts.append("Constraints: " + neg + ".")
    return " ".join(parts)


def vram_only(name):
    return name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="generate a single world id")
    ap.add_argument("--force", action="store_true", help="regenerate even if cached")
    ap.add_argument("--list", action="store_true", help="list worlds and exit")
    args = ap.parse_args()

    direction = json.loads(DIRECTION.read_text())
    defaults = direction.get("defaults", {})
    worlds = direction["worlds"]

    if args.list:
        for wid, spec in worlds.items():
            png = next((ASSETS / (wid + e) for e in (".jpg", ".png") if (ASSETS / (wid + e)).exists()), None)
            state = ("cached " + png.name) if png else "missing"
            print(f"  {wid:22} {state:8} {spec['prompt'][:64]}...")
        return 0

    env = load_env()
    key = env.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not key:
        print("No GEMINI_API_KEY. Put it in .env (gitignored) - see .env.example.")
        return 2

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("google-genai is not importable. Run this with isramarket's venv:\n"
              "  /Users/shahar/Documents/isramarket/api/.venv/bin/python tools/gen-art.py")
        return 3

    model = env.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
    size = env.get("GEMINI_IMAGE_SIZE", "2K")
    client = genai.Client(api_key=key)

    targets = [args.only] if args.only else list(worlds)
    credits = load_credits()
    made = skipped = failed = 0

    for wid in targets:
        if wid not in worlds:
            print(f"  {wid}: not in art-direction.json"); continue
        spec = worlds[wid]
        existing = [ASSETS / (wid + e) for e in (".jpg", ".png")]
        png = next((p for p in existing if p.exists()), existing[0])
        if png.exists() and not args.force:
            skipped += 1
            print(f"  {wid:22} cached, skipping")
            continue
        prompt = build_prompt(spec, defaults)
        aspect = spec.get("aspectRatio") or defaults.get("aspectRatio", "4:3")
        print(f"  {wid:22} generating ({aspect}) ...", flush=True)
        t0 = time.time()
        try:
            resp = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=aspect, image_size=size),
                    thinking_config=types.ThinkingConfig(thinking_level="MINIMAL"),
                ),
            )
        except Exception as exc:
            failed += 1
            print(f"    FAILED: {str(exc)[:200]}")
            continue

        data = mime = None
        parts = getattr(resp, "parts", None) or []
        if not parts and resp.candidates:
            c = resp.candidates[0]
            parts = (c.content.parts if c.content else []) or []
        for part in parts:
            if getattr(part, "thought", False):
                continue
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                data, mime = bytes(inline.data), (inline.mime_type or "image/png")
                break
        if not data:
            failed += 1
            finish = resp.candidates[0].finish_reason if resp.candidates else "no candidates"
            print(f"    no image returned (finish={finish}) - the model may have refused the prompt")
            continue

        # the API reports image/png but actually returns JPEG - trust the bytes
        ext = "jpg" if data[:3] == b"\xff\xd8\xff" else ("png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "bin")
        out = ASSETS / (wid + "." + ext)
        ASSETS.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        credits[wid] = {
            "kind": "generated",
            "file": out.name,
            "bytesFormat": ext,
            "model": model,
            "prompt": prompt,
            "aspectRatio": aspect,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()[:16],
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "note": ("Generated illustration. Depicts no specific franchise's characters, "
                     "vessels, logos or named locations."),
        }
        save_credits(credits)
        made += 1
        print(f"    wrote assets/{out.name}  {len(data)//1024} KB in {time.time()-t0:.1f}s")

    print(f"\n  generated {made}, skipped {skipped}, failed {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
