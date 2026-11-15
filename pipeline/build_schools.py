"""Build the app's static data from the Giga export and the OSM extract.

    python -I pipeline/build_schools.py [--data-dir data]

Inputs (in the data dir):
  School_report_*.csv          Giga "School location" export, every page (LKA rows are kept)
  sri-lanka-latest.osm.pbf     Geofabrik extract (same file as the roads pipeline)
Outputs (in the data dir):
  schools.json   schools + provinces + districts, contract in replica/02-architecture/architecture.md
  land.json      GeoJSON land polygons assembled from natural=coastline (simplified)
  admin.json     GeoJSON province (admin_level 4) and district (admin_level 5) polygons (simplified)

Requires: osmium (pyosmium), shapely >= 2 (see pipeline/requirements.txt).
"""
import argparse
import csv
import datetime as dt
import glob
import json
import pathlib
import re
import sys

import osmium
import shapely
from shapely import STRtree
from shapely.geometry import mapping
from shapely.ops import linemerge, polygonize, unary_union

LEVELS = {"Primary": 0, "Secondary": 1, "Primary and Secondary": 2}


class OsmReader(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.wkb = osmium.geom.WKBFactory()
        self.coast = []
        self.admin = {4: [], 5: []}

    def way(self, w):
        if w.tags.get("natural") == "coastline":
            try:
                self.coast.append(shapely.from_wkb(self.wkb.create_linestring(w)))
            except Exception:
                pass

    def area(self, a):
        if a.tags.get("boundary") != "administrative":
            return
        try:
            level = int(a.tags.get("admin_level", "0"))
        except ValueError:
            return
        if level not in self.admin:
            return
        try:
            geom = shapely.from_wkb(self.wkb.create_multipolygon(a))
        except Exception:
            return
        name = {"en": a.tags.get("name:en") or a.tags.get("name", "")}
        for lang in ("si", "ta"):
            if a.tags.get(f"name:{lang}"):
                name[lang] = a.tags.get(f"name:{lang}")
        osm_id = a.orig_id()
        self.admin[level].append({"osm_id": osm_id, "name": name, "geom": geom})


def clean_name(s):
    return re.sub(r"\s+(Province|District)$", "", s.strip())


def export_date(files):
    m = re.search(r"dated_(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})(\d{2})", files[-1])
    if not m:
        return None
    d, mo, y, h, mi, s = map(int, m.groups())
    return dt.datetime(y, mo, d, h, mi, s, tzinfo=dt.timezone.utc).isoformat().replace("+00:00", "Z")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data")
    args = ap.parse_args()
    data = pathlib.Path(args.data_dir).resolve()

    files = sorted(glob.glob(str(data / "School_report_*.csv")))
    if not files:
        sys.exit(f"ERROR: no School_report_*.csv in {data}")
    pbf = data / "sri-lanka-latest.osm.pbf"
    if not pbf.exists():
        sys.exit(f"ERROR: {pbf} missing; run pipeline/build-roads.ps1 first")

    # 1. schools
    seen, rows = set(), []
    for f in files:
        for r in csv.DictReader(open(f, encoding="utf-8")):
            gid = r["School Giga ID"].strip()
            if r["Country ISO3 Code"] != "LKA" or not gid or gid in seen:
                continue
            seen.add(gid)
            rows.append(r)
    print(f"schools: {len(rows)} unique LKA rows from {len(files)} file(s)")

    # 2. OSM: coastline + admin areas
    rd = OsmReader()
    rd.apply_file(str(pbf), locations=True)
    print(f"osm: {len(rd.coast)} coastline ways, {len(rd.admin[4])} provinces, {len(rd.admin[5])} districts")

    merged = linemerge(rd.coast)
    land = unary_union(list(polygonize(merged)))
    land_s = shapely.simplify(land, 0.0003, preserve_topology=True)
    print(f"land: {len(getattr(land, 'geoms', [land]))} polygon(s), area {land.area:.3f} deg2")

    areas = {}
    for level, key in ((4, "provinces"), (5, "districts")):
        items = sorted(rd.admin[level], key=lambda x: x["name"]["en"])
        for i, it in enumerate(items):
            it["idx"] = i
            it["name"]["en"] = clean_name(it["name"]["en"])
            # clip to land so province shapes follow the coast, not the maritime limit
            it["geom_land"] = it["geom"].intersection(land) if not land.is_empty else it["geom"]
        areas[key] = items

    # 3. assign each school to a province and a district
    out_rows, missing = [], {"provinces": 0, "districts": 0}
    trees = {k: STRtree([a["geom"] for a in v]) for k, v in areas.items()}
    for r in rows:
        lon, lat = round(float(r["Longitude"]), 5), round(float(r["Latitude"]), 5)
        pt = shapely.Point(lon, lat)
        idx = {}
        for key in ("provinces", "districts"):
            hits = trees[key].query(pt, predicate="intersects")
            if len(hits):
                idx[key] = int(hits[0])
            else:  # schools on the shoreline / tiny islands: nearest area within ~2 km
                near = trees[key].nearest(pt)
                ok = areas[key][near]["geom"].distance(pt) < 0.02
                idx[key] = int(near) if ok else -1
                missing[key] += not ok
        out_rows.append([r["School Giga ID"], r["School Name"].strip(), lon, lat,
                         LEVELS.get(r["Education Level"], 2), idx["provinces"], idx["districts"]])
    print(f"unassigned: {missing}")

    def area_entry(a):
        return {"id": a["idx"], "osmId": a["osm_id"], "name": a["name"], "bbox": [round(v, 4) for v in a["geom_land"].bounds]}

    schools = {
        "version": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": {"name": "Giga School location export", "exportedAt": export_date(files), "files": [pathlib.Path(f).name for f in files]},
        "country": {"iso3": "LKA", "gigaId": 49},
        "provinces": [area_entry(a) for a in areas["provinces"]],
        "districts": [area_entry(a) for a in areas["districts"]],
        "schools": out_rows,
    }
    (data / "schools.json").write_text(json.dumps(schools, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    def fc(features):
        return {"type": "FeatureCollection", "features": features}

    def rounded(geom, nd=5):
        return json.loads(json.dumps(mapping(geom)), parse_float=lambda x: round(float(x), nd))

    (data / "land.json").write_text(json.dumps(fc([{"type": "Feature", "properties": {}, "geometry": rounded(land_s)}]), separators=(",", ":")), encoding="utf-8")
    admin_feats = []
    for key, level in (("provinces", 4), ("districts", 5)):
        for a in areas[key]:
            g = shapely.simplify(a["geom_land"], 0.0005, preserve_topology=True)
            admin_feats.append({"type": "Feature", "properties": {"id": a["idx"], "level": level, "name": a["name"]["en"]}, "geometry": rounded(g)})
    (data / "admin.json").write_text(json.dumps(fc(admin_feats), separators=(",", ":")), encoding="utf-8")

    for n in ("schools.json", "land.json", "admin.json"):
        print(f"wrote {n}: {(data / n).stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
