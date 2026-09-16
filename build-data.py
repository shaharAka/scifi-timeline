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
ASSETS = os.path.join(ROOT, "assets")
GROUPS_FILE = os.path.join(ROOT, "data", "groups.json")
OUT = os.path.join(ROOT, "data", "timeline-data.json")
HTML = os.path.join(ROOT, "timeline.html")
SRC = os.path.join(ROOT, "src")
ATLAS_FILE = os.path.join(ROOT, "data", "atlas.json")
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



def load_art(lineage_ids):
    """Art plates and their provenance, keyed by lineage id.

    Paths are RELATIVE and the files ship in assets/, so the page keeps working
    over file:// - a data: URI would add ~4 MB to timeline.html and a fetch would
    be blocked. `kind` distinguishes a generated plate from a public-domain one;
    the viewer labels generated art as such, because this project's whole claim
    is that its provenance is legible.
    """
    credits_path = os.path.join(ROOT, "assets", "ART-CREDITS.json")
    if not os.path.exists(credits_path):
        return {}
    try:
        with open(credits_path, "r", encoding="utf-8") as fh:
            credits = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        err("assets/ART-CREDITS.json is unreadable: %s" % exc)
        return {}
    out = {}
    for wid, meta in credits.items():
        if wid not in lineage_ids:
            warn("art plate %r has no matching lineage; it will not be shown" % wid)
            continue
        lg = os.path.join(ASSETS, "derived", wid + "-lg.jpg")
        sm = os.path.join(ASSETS, "derived", wid + "-sm.jpg")
        entry = {
            "kind": meta.get("kind", "generated"),
            "model": meta.get("model"),
            "prompt": meta.get("prompt"),
            "note": meta.get("note"),
        }
        if os.path.exists(lg):
            entry["lg"] = "assets/derived/" + wid + "-lg.jpg"
        if os.path.exists(sm):
            entry["sm"] = "assets/derived/" + wid + "-sm.jpg"
        if os.path.exists(os.path.join(ASSETS, wid + ".jpg")):
            entry["full"] = "assets/" + wid + ".jpg"
        if "lg" not in entry and "full" not in entry:
            warn("art plate %r has no derived copy; run tools/derive-art.py" % wid)
            continue
        out[wid] = entry
    return out



def load_pd(lineage_ids):
    """Real-world counterpart photographs (public domain / CC attribution).

    These are the opposite of the illustrative plates: actual photographs of the
    real objects a fiction's chronology leans on. Their licence and author are
    carried through to the UI, because that is what the attribution licences
    require and because it is the point of them.
    """
    path = os.path.join(ROOT, "assets", "PD-CREDITS.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            credits = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        err("assets/PD-CREDITS.json is unreadable: %s" % exc)
        return {}
    out = {}
    for wid, meta in credits.items():
        if wid not in lineage_ids:
            warn("PD counterpart %r has no matching lineage; it will not be shown" % wid)
            continue
        rel = meta.get("file") or ("assets/pd/" + wid + ".jpg")
        if not os.path.exists(os.path.join(ROOT, rel)):
            warn("PD counterpart for %r is missing on disk (%s)" % (wid, rel))
            continue
        out[wid] = {
            "kind": meta.get("kind", "public-domain"),
            "file": rel,
            "caption": meta.get("caption", ""),
            "why": meta.get("why", ""),
            "license": meta.get("license", ""),
            "licenseUrl": meta.get("licenseUrl", ""),
            "author": meta.get("author", ""),
            "sourceTitle": meta.get("sourceTitle", ""),
            "sourcePage": meta.get("sourcePage", ""),
        }
    return out



def load_news(lineage_ids):
    """Hand-curated news, keyed for the TODAY line.

    Every item is written by a person and its facts checked, so this loader is
    strict: a news item with an unparseable date or an unknown world id is an
    error rather than something silently dropped, because a chronology that
    claims a research standard cannot quietly ship a wrong date.
    """
    path = os.path.join(ROOT, "data", "news.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        err("data/news.json is unreadable: %s" % exc)
        return []
    items = doc.get("items")
    if not isinstance(items, list):
        err("data/news.json needs an 'items' list")
        return []
    out = []
    seen = set()
    for i, it in enumerate(items):
        tag = "data/news.json item[%d]" % i
        if not isinstance(it, dict):
            err("%s is not an object" % tag)
            continue
        for key in ("date", "headline", "summary", "source"):
            if not it.get(key):
                err("%s is missing %r" % (tag, key))
        raw = str(it.get("date", ""))
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
            err("%s has a malformed date %r; use YYYY-MM-DD" % (tag, raw))
            continue
        try:
            when = datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError as exc:
            err("%s has an impossible date %r (%s)" % (tag, raw, exc))
            continue
        src = it.get("source") or {}
        if not isinstance(src, dict) or not src.get("url"):
            err("%s needs source.url" % tag)
            continue
        worlds = it.get("worlds") or []
        if not isinstance(worlds, list):
            err("%s 'worlds' must be a list" % tag)
            worlds = []
        for wid in worlds:
            if wid not in lineage_ids:
                err("%s references world %r, which is not in this dataset" % (tag, wid))
        if raw in seen:
            warn("%s duplicates the date %s; both will sit on the same marker" % (tag, raw))
        seen.add(raw)
        out.append({
            "date": raw,
            "year": when.year,
            "headline": it["headline"],
            "summary": it.get("summary", ""),
            "source": {"title": src.get("title", ""), "url": src["url"]},
            "worlds": [w for w in worlds if w in lineage_ids],
        })
    out.sort(key=lambda x: x["date"], reverse=True)
    return out


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


def load_atlas():
    """Page copy and era presets for this atlas. Optional; the viewer has
    fallbacks for everything, but if the file exists it must be sane."""
    if not os.path.exists(ATLAS_FILE):
        warn("data/atlas.json not found; the page will use its built-in copy")
        return None
    try:
        with open(ATLAS_FILE, "r", encoding="utf-8") as fh:
            atlas = json.load(fh)
    except Exception as e:  # noqa: BLE001
        err("data/atlas.json does not parse: %s" % e)
        return None
    if not isinstance(atlas, dict):
        err("data/atlas.json must be an object")
        return None
    for key in ("title", "headline", "lede"):
        if not isinstance(atlas.get(key), str) or not atlas[key].strip():
            err("data/atlas.json: %r must be a non-empty string" % key)
    eras = atlas.get("eras")
    if not isinstance(eras, list) or not eras:
        err("data/atlas.json: 'eras' must be a non-empty list")
    else:
        for i, e in enumerate(eras):
            ok = (isinstance(e, dict) and isinstance(e.get("label"), str)
                  and isinstance(e.get("from"), (int, float))
                  and isinstance(e.get("to"), (int, float)) and e["from"] < e["to"])
            if not ok:
                err("data/atlas.json: eras[%d] needs label, and numeric from < to" % i)
        d = atlas.get("defaultEra", 0)
        if not isinstance(d, int) or d < 0 or d >= len(eras):
            err("data/atlas.json: 'defaultEra' must index into 'eras'")
    atlas.pop("_comment", None)
    return atlas


def assemble():
    """Build timeline.html from src/: the page template with every stylesheet
    and every viewer module inlined, in filename order. Returns the HTML with
    the embedded-data block still empty, or None if src/ is absent."""
    tpl_path = os.path.join(SRC, "page.html")
    if not os.path.exists(tpl_path):
        return None
    with open(tpl_path, "r", encoding="utf-8") as fh:
        html = fh.read()

    def concat(sub, ext):
        """Concatenate every .ext under src/<sub>, walking subdirectories.

        Recursing matters for src/styles/themes/: the base token file must load
        before any theme, and plain filename order gives that for free
        (00-tokens, 10-base, 20-chart, 30-panels, then themes/10-paper, ...).
        """
        root = os.path.join(SRC, sub)
        names = []
        if os.path.isdir(root):
            for dirpath, _dirs, files in os.walk(root):
                for n in sorted(files):
                    if n.endswith(ext):
                        names.append(os.path.relpath(os.path.join(dirpath, n), root))
        names.sort()
        if not names:
            err("src/%s has no %s files" % (sub, ext))
        chunks = []
        for n in names:
            with open(os.path.join(root, n), "r", encoding="utf-8") as fh:
                body = fh.read().rstrip() + "\n"
            if "</script" in body.lower() or "</style" in body.lower():
                err("src/%s/%s contains a closing script/style tag; it would break the page" % (sub, n))
            chunks.append("/* ---- src/%s/%s ---- */\n%s" % (sub, n, body))
        return "\n".join(chunks), names

    css, css_names = concat("styles", ".css")
    js, js_names = concat("viewer", ".js")

    for marker in ("<!-- @styles -->", "<!-- @scripts -->", EMBED_MARK):
        if marker not in html:
            err("src/page.html is missing the %s marker" % marker)
    html = html.replace("<!-- @styles -->", "<style>\n" + css + "</style>", 1)
    html = html.replace("<!-- @scripts -->", "<script>\n" + js + "</script>", 1)
    return html, css_names, js_names



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

    atlas = load_atlas()
    assembled = assemble()
    if errors:
        print("BUILD FAILED - %d error(s):\n" % len(errors))
        for e in errors:
            print("  ERROR  " + e)
        return 1

    lineage_ids = set(l["id"] for l in lineages)
    worlds = load_worlds(lineage_ids)
    art = load_art(lineage_ids)
    pd = load_pd(lineage_ids)
    news = load_news(lineage_ids)
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
            "art": len(art),
            "pd": len(pd),
            "news": len(news),
            "note": ("Real-world calendar years throughout. In-universe date systems "
                     "(BBY, AG, GE, stardates, millennium notation) are preserved per event "
                     "in the inUniverse field."),
        },
        "groups": groups,
        "lineages": lineages,
        "worlds": [worlds[l["id"]] for l in lineages if l["id"] in worlds],
        "art": art,
        "pd": pd,
        "news": news,
    }
    if atlas:
        payload["atlas"] = atlas

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)

    embedded = False
    assembled_from = None
    if assembled:
        html, css_names, js_names = assembled
        assembled_from = (css_names, js_names)
    elif os.path.exists(HTML):
        with open(HTML, "r", encoding="utf-8") as fh:
            html = fh.read()
    else:
        html = None
    if html is not None:
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
    if assembled_from and embedded:
        print("    assembled timeline.html from src/ (%d stylesheets, %d viewer modules)"
              % (len(assembled_from[0]), len(assembled_from[1])))
    if embedded:
        print("    embedded a copy inside timeline.html (%.1f KB)"
              % (os.path.getsize(HTML) / 1024.0))
    if atlas:
        print("    atlas: %r, %d era presets" % (atlas.get("title"), len(atlas.get("eras", []))))
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
