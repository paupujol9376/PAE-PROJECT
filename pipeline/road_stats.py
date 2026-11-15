"""Measure every road class of the Sri Lanka extract: number of ways, length and refs.

    python -I pipeline/road_stats.py [--data-dir data]

Input:  <data-dir>/sri-lanka-latest.osm.pbf (same file as the roads pipeline)
Output: <data-dir>/road-stats.json, read by the app legend (counts and km per class)

Everything is measured from OpenStreetMap; nothing is estimated. Lengths are geodesic
(haversine) sums over each way's nodes. The class mapping is the one used by roads.yml
(imported from validate.py so the two cannot drift). `refPrefixes` counts the first letter
of the `ref` tag (A, B, E...) to check how Sri Lanka's road classes are tagged in OSM.
"""
import argparse
import collections
import datetime as dt
import json
import pathlib
import re
import sys

import osmium

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from validate import classify  # noqa: E402  (same class mapping as roads.yml)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data")
    data = pathlib.Path(ap.parse_args().data_dir).resolve()
    pbf = data / "sri-lanka-latest.osm.pbf"
    if not pbf.exists():
        sys.exit(f"ERROR: {pbf} missing; run pipeline/build-roads.ps1 first")

    ways = collections.Counter()
    km = collections.Counter()
    refs = collections.defaultdict(collections.Counter)
    highways = collections.defaultdict(collections.Counter)
    # Node locations are cached natively; only highway ways reach Python (fast).
    fp = (osmium.FileProcessor(str(pbf)).with_locations()
          .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
          .with_filter(osmium.filter.KeyFilter("highway")))
    for o in fp:
        h = o.tags.get("highway")
        if h is None or o.tags.get("area") == "yes" or len(o.nodes) < 2:
            continue
        c = classify(h)
        ways[c] += 1
        highways[c][h] += 1
        try:
            km[c] += osmium.geom.haversine_distance(o.nodes) / 1000.0
        except osmium.InvalidLocationError:
            pass
        ref = o.tags.get("ref")
        if ref:
            m = re.match(r"\s*([A-Za-z]+)", ref)
            refs[c][m.group(1).upper() if m else "other"] += 1

    out = {
        "version": 1,
        "source": "OpenStreetMap via Geofabrik sri-lanka-latest.osm.pbf",
        "pbfMd5": (pbf.with_suffix(".pbf.md5").read_text().split()[0] if pbf.with_suffix(".pbf.md5").exists() else None),
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "classes": {
            c: {
                "ways": ways[c],
                "km": round(km[c], 1),
                "highway": dict(highways[c].most_common()),
                "refPrefixes": dict(refs[c].most_common()),
            }
            for c in sorted(ways, key=lambda c: -ways[c])
        },
    }
    (data / "road-stats.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    for c, v in out["classes"].items():
        print(f"{c:<13} {v['ways']:>8,} ways {v['km']:>10,.1f} km  refs {v['refPrefixes']}")


if __name__ == "__main__":
    main()
