#!/usr/bin/env python3
"""Verify data.js against pdf_sites.json."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_SITES = json.loads((ROOT / "scripts" / "pdf_sites.json").read_text(encoding="utf-8"))
DATA_JS = (ROOT / "data.js").read_text(encoding="utf-8")


def norm(s):
    s = (s or "").strip().lower()
    s = s.replace("״", '"').replace("׳", "'")
    s = re.sub(r"\s+", " ", s)
    return s


def extract_data():
    m = re.search(r"window\.POLLING_DATA\s*=\s*(\[.*?\]);", DATA_JS, re.S)
    if not m:
        raise SystemExit("Could not parse data.js")
    return json.loads(m.group(1))


def main():
    data = extract_data()
    errors = []

    # Test 1: count
    expected = len(PDF_SITES)
    actual = len(data)
    print(f"COUNT: expected={expected}, actual={actual}", end="")
    if actual != expected:
        errors.append(f"Count mismatch: {actual} != {expected}")
        print(" FAIL")
    else:
        print(" OK")

    # Test 2: one-by-one field match
    print("\nFIELD-BY-FIELD CHECK:")
    ok = 0
    for i, (pdf, row) in enumerate(zip(PDF_SITES, data), 1):
        issues = []
        if norm(pdf["city"]) != norm(row["city"]):
            issues.append(f"city: {pdf['city']!r} != {row['city']!r}")
        if norm(pdf["site"]) != norm(row["site"]):
            issues.append(f"site: {pdf['site']!r} != {row['site']!r}")
        if norm(pdf["address"]) != norm(row["address"]):
            issues.append(f"address: {pdf['address']!r} != {row['address']!r}")
        if not isinstance(row.get("lat"), (int, float)) or not isinstance(row.get("lng"), (int, float)):
            issues.append("missing lat/lng")
        if issues:
            print(f"  [{i:3}] {pdf['city']} FAIL")
            for issue in issues:
                print(f"         - {issue}")
            errors.extend(issues)
        else:
            ok += 1
            print(f"  [{i:3}] {pdf['city']} OK")

    if len(data) > len(PDF_SITES):
        for row in data[len(PDF_SITES):]:
            errors.append(f"Extra row: {row['city']}")
            print(f"  EXTRA: {row['city']}")

    print(f"\nSUMMARY: {ok}/{expected} exact matches")
    if errors:
        print(f"FAILED with {len(errors)} issue(s)")
        raise SystemExit(1)
    print("ALL TESTS PASSED")


if __name__ == "__main__":
    main()
