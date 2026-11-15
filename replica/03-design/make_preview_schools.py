"""Build data/schools-preview.geojson from every data/School_report_*.csv (Giga export).

    python -I replica/03-design/make_preview_schools.py

Design preview only; phase 4 replaces it with pipeline/build_schools.py.
All schools get status "unknown" (connectivity data is not available).
"""
import csv
import glob
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[2]
seen, feats = set(), []
for f in sorted(glob.glob(str(root / "data" / "School_report_*.csv"))):
    for r in csv.DictReader(open(f, encoding="utf-8")):
        gid = r["School Giga ID"]
        if r["Country ISO3 Code"] != "LKA" or gid in seen:
            continue
        seen.add(gid)
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(float(r["Longitude"]), 5), round(float(r["Latitude"]), 5)]},
            "properties": {"id": gid, "name": r["School Name"], "level": r["Education Level"], "status": "unknown"},
        })
out = root / "data" / "schools-preview.geojson"
out.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
print(f"{len(feats)} schools -> {out}")
