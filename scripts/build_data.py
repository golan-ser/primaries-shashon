#!/usr/bin/env python3
"""Build data.js from pdf_sites.json with geocoding."""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_SITES = ROOT / "scripts" / "pdf_sites.json"
OUT = ROOT / "data.js"
CACHE = ROOT / "scripts" / "geocode_cache.json"

ALIASES = {
    "תל אביב-יפו (דרום)": ["תל אביב", "תא", "ת״א", "tel aviv", "tel aviv south"],
    "תל אביב-יפו (צפון)": ["תל אביב", "תא", "ת״א", "tel aviv", "tel aviv north"],
    "פתח תקווה": ["פת", "פ״ת", "petah tikva", "petach tikva", "עמישב"],
    "באר שבע": ["בארשבע", "ב״ש", "בש", "beer sheva", "beersheba"],
    "ראשון לציון": ["ראשלצ", "ראשל״צ", "ראשון", "rishon lezion"],
    "רמת גן": ["רמתגן", "ר״ג", "ramat gan"],
    "כפר סבא": ["כפס", "כפרסבא", "kfar saba"],
    "מודיעין-מכבים-רעות": ["מודיעין", "modiin"],
    "קריית אתא": ["קרית אתא", "kiryat ata"],
    "פרדס חנה-כרכור": ["פרדס חנה", "כרכור"],
    "מעלות-תרשיחא": ["מעלות", "תרשיחא"],
    "יהוד-מונסון": ["יהוד", "monosson"],
    "נוף הגליל": ["נוף הגליל", "upper nazareth"],
    "חצור הגלילית": ["חצור", "hazor"],
}


def load_cache():
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


MANUAL_COORDS = {
    "יהוד-מונסון": (32.0334, 34.8878),
    "יפיע": (32.6889, 35.2792),
    "ירוחם": (30.9889, 34.9311),
    "ירכא": (32.9534, 35.2117),
    "כסרא-סמיע": (32.9278, 35.3014),
    "מ.א. באר טוביה - שתולים": (31.7756, 34.8872),
    "מ.א. גוש עציון - תקוע": (31.6517, 35.2278),
    "מ.א. גזר - יד רמב\"ם": (31.8222, 34.8122),
    "מ.א. הגלבוע - פרזון": (32.4889, 35.3333),
    "מ.א. חבל מודיעין - חדיד": (31.9667, 34.9333),
    "מ.א. לב השרון - תנובות": (32.3083, 34.9667),
    "מ.א. מטה בנימין - טלמון": (31.9167, 35.1333),
    "מ.א. מטה בנימין - כוכב יעקב": (31.8833, 35.2333),
    "מ.א. מטה בנימין - מצפה יריחו": (31.8167, 35.3667),
    "מ.א. מטה בנימין - שילה": (32.0556, 35.2972),
    "מ.א. מרחבים - ביטחה": (31.3167, 34.7333),
    "מ.א. עמק לוד - זיתן": (31.9667, 34.8667),
    "מ.א. שדות נגב - מעגלים": (31.4167, 34.7833),
    "מ.א. שומרון - הר ברכה": (32.1833, 35.3167),
    "מ.א. שפיר - זבדיאל": (31.6833, 34.7167),
    "מ.א. מרום הגליל": (32.7833, 35.4333),
    "מג'אר": (32.8833, 35.4167),
    "נצרת": (32.6996, 35.3035),
    "נחל שורק": (31.8333, 34.9167),
    "קדומים": (32.2167, 35.1667),
    "קריית ארבע": (31.5272, 35.1036),
    "קרני שומרון": (32.1667, 35.0833),
    "שפרעם": (32.8056, 35.1694),
    "בית ג'אן": (32.9645, 35.3781),
    "ג'וליס": (32.9431, 35.1869),
    "הר חברון": (31.612, 34.7785),
    "טמרה": (32.634, 35.404),
}


def geocode(query, cache):
    key = query.strip()
    if key in cache:
        v = cache[key]
        return v[0], v[1]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": key, "format": "json", "limit": 1, "countrycodes": "il"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "likud110-polling-site/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        if data:
            lat = round(float(data[0]["lat"]), 4)
            lng = round(float(data[0]["lon"]), 4)
            cache[key] = [lat, lng]
            return lat, lng
    except Exception as e:
        print(f"  geocode fail: {query!r} -> {e}")
    return None, None


def resolve_coords(site, cache):
    city = site["city"]
    if city in MANUAL_COORDS:
        lat, lng = MANUAL_COORDS[city]
        cache[f"manual:{city}"] = [lat, lng]
        return lat, lng

    queries = [
        build_geocode_query(site),
        f"{site['address']}, Israel",
        f"{site['city']}, Israel",
    ]
    for q in queries:
        lat, lng = geocode(q, cache)
        if lat is not None:
            return lat, lng
    return None, None


def build_geocode_query(site):
    parts = [site["address"], site["city"]]
    if site.get("site"):
        parts.insert(0, site["site"])
    q = ", ".join(p for p in parts if p)
    q = re.sub(r"\s+", " ", q)
    return q


def js_str(s):
    return json.dumps(s, ensure_ascii=False)


def main():
    sites = json.loads(PDF_SITES.read_text(encoding="utf-8"))
    print(f"Loaded {len(sites)} sites from PDF reference")
    cache = load_cache()
    out = []

    for i, site in enumerate(sites, 1):
        lat, lng = resolve_coords(site, cache)
        if lat is None:
            raise SystemExit(f"Could not geocode: {site['city']}")
        aliases = list(ALIASES.get(site["city"], []))
        entry = {
            "city": site["city"],
            "site": site["site"],
            "address": site["address"],
            "lat": lat,
            "lng": lng,
        }
        if aliases:
            entry["aliases"] = aliases
        out.append(entry)
        print(f"[{i}/{len(sites)}] {site['city']} -> {lat}, {lng}")
        if site["city"] not in MANUAL_COORDS:
            time.sleep(1.05)
        if i % 10 == 0:
            save_cache(cache)

    save_cache(cache)

    lines = ["window.POLLING_DATA = ["]
    for item in out:
        lines.append("  {")
        lines.append(f'    "city": {js_str(item["city"])},')
        lines.append(f'    "site": {js_str(item["site"])},')
        lines.append(f'    "address": {js_str(item["address"])},')
        if item.get("aliases"):
            lines.append(f'    "lat": {item["lat"]},')
            lines.append(f'    "lng": {item["lng"]},')
            lines.append(f'    "aliases": {json.dumps(item["aliases"], ensure_ascii=False)}')
        else:
            lines.append(f'    "lat": {item["lat"]},')
            lines.append(f'    "lng": {item["lng"]}')
        lines.append("  },")
    lines[-1] = lines[-1].rstrip(",")
    lines.append("];")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT} ({len(out)} sites)")


if __name__ == "__main__":
    main()
