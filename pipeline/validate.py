"""Acceptance-gate validation for roads.pmtiles (PAE phase 1B).

Checks:
  1. Archive header/metadata: minzoom 5, maxzoom 14, vector layer `roads`, OSM attribution.
  2. Every expected `class` value is present in the z14 tiles (unique OSM way ids per class).
  3. Completeness: distinct highway line ways in the source PBF vs. distinct OSM way ids
     found in the z14 tiles (feature id = way_id * 10 + 2). Must differ by < 1 %.
  4. Sizes: pbf, pmtiles, largest tile (compressed and raw) per zoom.

Usage:
  python -I pipeline/validate.py --data-dir data [--pbf NAME] [--pmtiles NAME] [--out replica/01-data]

Requires: pip install osmium pmtiles mapbox-vector-tile
Exit code 0 when every gate passes, 1 otherwise.
"""
import argparse
import collections
import csv
import gzip
import json
import os
import sys
import time

import mapbox_vector_tile
import osmium
from pmtiles.reader import MmapSource, Reader, all_tiles

# Must mirror the `road_class` match in pipeline/roads.yml.
CLASS_MAP = {
    "motorway": ["motorway", "motorway_link"],
    "trunk": ["trunk", "trunk_link"],
    "primary": ["primary", "primary_link"],
    "secondary": ["secondary", "secondary_link"],
    "tertiary": ["tertiary", "tertiary_link"],
    "unclassified": ["unclassified"],
    "residential": ["residential", "living_street", "road"],
    "service": ["service", "busway", "bus_guideway", "rest_area", "services", "escape"],
    "track": ["track"],
    "path": ["path", "bridleway", "trailhead"],
    "footway": ["footway", "pedestrian", "corridor", "platform"],
    "cycleway": ["cycleway"],
    "steps": ["steps"],
    "construction": ["construction", "proposed"],
}
HIGHWAY_TO_CLASS = {h: c for c, hs in CLASS_MAP.items() for h in hs}
# Classes the brief requires; construction/other are extra buckets that may be empty elsewhere.
REQUIRED_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
                    "residential", "service", "track", "path", "footway", "cycleway", "steps"]
COMPLETENESS_TOLERANCE = 0.01


def classify(highway):
    return HIGHWAY_TO_CLASS.get(highway, "other")


def count_source(pbf):
    """Distinct highway=* ways that Planetiler can emit as lines: not area=yes, >= 2 nodes."""
    ids = {}
    skipped = collections.Counter()
    for w in osmium.FileProcessor(pbf, osmium.osm.WAY):
        h = w.tags.get("highway")
        if h is None:
            continue
        if w.tags.get("area") == "yes":
            skipped["area=yes"] += 1
            continue
        if len(w.nodes) < 2:
            skipped["<2 nodes"] += 1
            continue
        ids[w.id] = classify(h)
    return ids, skipped


def scan_tiles(pmtiles_path):
    with open(pmtiles_path, "rb") as f:
        src = MmapSource(f)
        reader = Reader(src)
        header = reader.header()
        metadata = reader.metadata()
        z14_ids = {}
        id_less = 0
        non_way_ids = 0
        per_zoom = collections.defaultdict(lambda: {"tiles": 0, "max_bytes": 0, "max_tile": None,
                                                    "max_raw_bytes": 0, "total_bytes": 0})
        for (z, x, y), data in all_tiles(src):
            st = per_zoom[z]
            st["tiles"] += 1
            st["total_bytes"] += len(data)
            raw = gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data
            if len(data) > st["max_bytes"]:
                st["max_bytes"], st["max_tile"] = len(data), f"{z}/{x}/{y}"
            st["max_raw_bytes"] = max(st["max_raw_bytes"], len(raw))
            if z != 14:
                continue
            layer = mapbox_vector_tile.decode(raw).get("roads", {"features": []})
            for feat in layer["features"]:
                fid = feat.get("id")
                if not fid:
                    id_less += 1
                    continue
                # Planetiler encodes OSM ids as osm_id * 10 + type (1 node, 2 way, 3 relation).
                if fid % 10 != 2:
                    non_way_ids += 1
                    continue
                z14_ids.setdefault(fid // 10, feat["properties"].get("class"))
    return header, metadata, z14_ids, id_less, non_way_ids, dict(sorted(per_zoom.items()))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--pbf", default="sri-lanka-latest.osm.pbf")
    ap.add_argument("--pmtiles", default="roads.pmtiles")
    ap.add_argument("--out", default=None, help="directory for stats.json and class-counts.csv")
    args = ap.parse_args()

    pbf = os.path.join(args.data_dir, args.pbf)
    pmt = os.path.join(args.data_dir, args.pmtiles)
    for p in (pbf, pmt):
        if not os.path.isfile(p):
            sys.exit(f"ERROR: missing input {p}")

    t0 = time.time()
    src_ids, skipped = count_source(pbf)
    t1 = time.time()
    header, metadata, tile_ids, id_less, non_way_ids, per_zoom = scan_tiles(pmt)
    t2 = time.time()

    results = {}
    # Gate 1: metadata
    layers = [l.get("id") for l in metadata.get("vector_layers", [])]
    attribution = metadata.get("attribution", "")
    g1 = (header["min_zoom"] == 5 and header["max_zoom"] == 14 and layers == ["roads"]
          and "OpenStreetMap contributors" in attribution)
    results["gate1_metadata"] = {"pass": g1, "min_zoom": header["min_zoom"], "max_zoom": header["max_zoom"],
                                 "vector_layers": layers, "attribution": attribution}

    # Gate 2: classes
    src_classes = collections.Counter(src_ids.values())
    tile_classes = collections.Counter(tile_ids.values())
    missing_classes = [c for c in REQUIRED_CLASSES if tile_classes.get(c, 0) == 0]
    results["gate2_classes"] = {"pass": not missing_classes, "missing": missing_classes,
                                "tile_z14_unique_ways_per_class": dict(tile_classes.most_common()),
                                "source_ways_per_class": dict(src_classes.most_common())}

    # Gate 3: completeness
    s, t = set(src_ids), set(tile_ids)
    missing = s - t
    extra = t - s
    diff = abs(len(s) - len(t)) / len(s)
    missing_frac = len(missing) / len(s)
    g3 = diff < COMPLETENESS_TOLERANCE and missing_frac < COMPLETENESS_TOLERANCE
    results["gate3_completeness"] = {
        "pass": g3, "source_ways": len(s), "tile_z14_unique_ids": len(t),
        "missing_in_tiles": len(missing), "extra_in_tiles": len(extra),
        "count_difference_pct": round(diff * 100, 4), "missing_pct": round(missing_frac * 100, 4),
        "z14_features_without_id": id_less, "z14_features_non_way_id": non_way_ids,
        "feature_id_encoding": "osm_way_id * 10 + 2 (Planetiler convention)",
        "sample_missing_ids": sorted(missing)[:20], "sample_extra_ids": sorted(extra)[:20],
        "source_skipped": dict(skipped),
    }

    # Gate 4: sizes
    largest = max(per_zoom.items(), key=lambda kv: kv[1]["max_bytes"])
    results["gate4_sizes"] = {
        "pbf_bytes": os.path.getsize(pbf), "pmtiles_bytes": os.path.getsize(pmt),
        "tile_count": sum(v["tiles"] for v in per_zoom.values()),
        "largest_tile": {"tile": largest[1]["max_tile"], "compressed_bytes": largest[1]["max_bytes"]},
        "per_zoom": {str(z): v for z, v in per_zoom.items()},
    }
    results["timing_s"] = {"source_scan": round(t1 - t0, 1), "tile_scan": round(t2 - t1, 1)}
    results["pmtiles_metadata"] = {k: v for k, v in metadata.items() if k != "vector_layers"}
    results["vector_layers"] = metadata.get("vector_layers")

    ok = g1 and results["gate2_classes"]["pass"] and g3
    results["all_pass"] = ok

    if args.out:
        os.makedirs(args.out, exist_ok=True)
        with open(os.path.join(args.out, "stats.json"), "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        with open(os.path.join(args.out, "class-counts.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["class", "source_ways", "tile_z14_unique_ways", "difference"])
            for c in sorted(set(src_classes) | set(tile_classes), key=lambda c: -src_classes.get(c, 0)):
                w.writerow([c, src_classes.get(c, 0), tile_classes.get(c, 0),
                            tile_classes.get(c, 0) - src_classes.get(c, 0)])

    print(f"Gate 1 metadata     : {'PASS' if g1 else 'FAIL'}  minzoom={header['min_zoom']} "
          f"maxzoom={header['max_zoom']} layers={layers}")
    print(f"Gate 2 classes      : {'PASS' if not missing_classes else 'FAIL'}  missing={missing_classes}")
    print(f"  {'class':<14}{'source':>10}{'tiles z14':>12}")
    for c in sorted(set(src_classes) | set(tile_classes), key=lambda c: -src_classes.get(c, 0)):
        print(f"  {c:<14}{src_classes.get(c, 0):>10}{tile_classes.get(c, 0):>12}")
    print(f"Gate 3 completeness : {'PASS' if g3 else 'FAIL'}  source={len(s)} tiles={len(t)} "
          f"missing={len(missing)} extra={len(extra)} diff={diff * 100:.4f}%")
    print(f"Gate 4 sizes        : pbf={os.path.getsize(pbf)} B  pmtiles={os.path.getsize(pmt)} B  "
          f"largest tile={largest[1]['max_tile']} ({largest[1]['max_bytes']} B gzipped)")
    for z, v in per_zoom.items():
        print(f"  z{z:<3} tiles={v['tiles']:>6}  max={v['max_bytes']:>7} B gz ({v['max_tile']}), "
              f"raw max={v['max_raw_bytes']:>7} B")
    print(f"ALL GATES: {'PASS' if ok else 'FAIL'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
