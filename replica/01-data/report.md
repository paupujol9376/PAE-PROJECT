# Phase 1B: OSM to PMTiles roads pipeline (Sri Lanka)

Branch `fase-1-data`. Run date: 2026-11-15. **Gate: all five criteria pass.**
Spot-checked by the orchestrator: `pmtiles show` on `data/roads.pmtiles` gives
min zoom 5, max zoom 14, layer `roads`, OSM attribution.

## What was built

| File | Purpose |
|---|---|
| `pipeline/roads.yml` | Planetiler `generate-custom` schema: one layer `roads` with every `highway=*` line |
| `pipeline/build-roads.ps1` / `.sh` | Build: downloads pinned, checksum-checked tools and the PBF, runs Planetiler, then `pmtiles show` and `verify`. Logs to `<data-dir>/build-roads.log`. The data dir is a parameter (default `./data`). |
| `pipeline/validate.py` | Acceptance gate; exit code 0 means pass |
| `pipeline/requirements.txt` | osmium 4.3.2, pmtiles 3.8.1, mapbox-vector-tile 2.2.0 (validation only) |
| `replica/01-data/stats.json`, `class-counts.csv` | Output of `validate.py --out replica/01-data` |

**Toolchain:** Windows 11, Java 21.0.8, Python 3.14.0, Planetiler 0.10.2, go-pmtiles 1.31.2. Tools go in the gitignored `pipeline/bin/`.

**Data:** Geofabrik `asia/sri-lanka-latest.osm.pbf`, MD5 `24ddb9f97e6e896de6cada2b7c5e2cf9`, OSM replication time 2026-11-14T21:20:41Z (seq 4684).

## Schema decisions

- **Which features.** Every `highway=*` way that is a line. Only `area=yes` ways are excluded (27 in the extract; plazas drawn as polygons). Footways, paths, tracks, cycleways, steps, construction and proposed roads are kept as their own classes, because the brief asks for all roads. The app can hide classes in its style.
- **Class mapping and min zooms:**

  | class | OSM `highway` values | min zoom |
  |---|---|---|
  | motorway | motorway, motorway_link | 5 (links 8) |
  | trunk | trunk, trunk_link | 5 (links 8) |
  | primary | primary, primary_link | 5 (links 9) |
  | secondary | secondary, secondary_link | 8 (links 10) |
  | tertiary | tertiary, tertiary_link | 10 (links 11) |
  | unclassified | unclassified | 11 |
  | residential | residential, living_street, road | 12 |
  | service | service, busway, bus_guideway, rest_area, services, escape | 12 (service, busway, bus_guideway), 13 (rest) |
  | track | track | 12 |
  | path | path, bridleway, trailhead | 13 |
  | footway | footway, pedestrian, corridor, platform | 13 |
  | cycleway | cycleway | 13 |
  | steps | steps | 13 |
  | construction | construction, proposed | 13 |
  | other | anything else (raceway, bus_stop, mini_roundabout, `no`) | 13 |

- **Links.** `*_link` ways take the parent class and add `link=true`. The raw `highway` value is kept on every feature.
- **Attributes:** class, highway, link, name, name:si, name:ta, name:en, ref, oneway (1 or -1; absent means two-way), bridge and tunnel (true unless the tag is `no`), surface, layer (integer). Missing tags are omitted.
- **Feature id.** No line merging, so each feature is one OSM way. The id is `osm_way_id*10+2` (Planetiler convention); **the client must use `Math.floor(id/10)`** to get the way id. The cost is heavier z12/z13 tiles.
- **Simplification.** Tolerance 0.2 px below z14 and 0.0625 px at z14. `min_size_at_max_zoom: 0` keeps sub-metre ways at z14 (Planetiler's default dropped 61 ways in a first trial). Below z14 the 1 px minimum still drops tiny pieces: z13 shows 345 of 752 steps; z14 shows all.
- **Attribution:** `© OpenStreetMap contributors` with a link to openstreetmap.org/copyright (ODbL).

## Gate

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Archive valid, z5–14, layer `roads` | PASS | `pmtiles show`: spec 3, mvt, bounds 79.164,5.621 – 82.646,10.072, 14,584 tiles, gzip. `pmtiles verify` exit 0. |
| 2 | All classes present | PASS | 13 required classes plus construction and other (table below). Zoom ranges confirmed by decoding every tile below z14. |
| 3 | Completeness < 1 % | PASS | Source (pyosmium): 340,300 ways. z14: 340,294 distinct way ids from 432,622 features. 6 missing, 0 extra = **0.0018 %**. |
| 4 | Size and timing reported | PASS | See below |
| 5 | Regenerates from scratch | PASS | Clean clone of `88591be`, README commands exited 0, `ALL GATES: PASS`, byte-identical output (SHA-256 `9952614b…dce5b`). |

### Per-class counts (source ways / ways in z14 tiles)

| class | source | z14 |
|---|---:|---:|
| residential | 184,454 | 184,449 |
| track | 42,754 | 42,754 |
| unclassified | 32,205 | 32,204 |
| service | 26,707 | 26,707 |
| path | 25,379 | 25,379 |
| tertiary | 7,473 | 7,473 |
| primary | 7,049 | 7,049 |
| footway | 6,859 | 6,859 |
| trunk | 3,720 | 3,720 |
| secondary | 1,725 | 1,725 |
| motorway | 894 | 894 |
| steps | 752 | 752 |
| cycleway | 164 | 164 |
| construction | 133 | 133 |
| other | 32 | 32 |

Missing way ids: 926265892, 1005000815, 1023961667, 1244120841, 1494978777, 1497035216. Each is a 2-node way of 0.3–0.6 m that collapses to a single point on the z14 grid (4096 units ≈ 0.6 m). Not fixable in the schema.

### Size and timing

- PBF 144,638,707 B; `roads.pmtiles` 37,148,344 B.
- Planetiler build 16–22 s; fresh clone end to end 42 s (61 s with validation).
- Largest tile 12/2957/1969 (central Colombo): 147,869 B gzipped / 285,735 B raw.
- Largest tile per zoom, gzipped bytes: z5 18,261 · z6 38,389 · z7 51,441 · z8 36,497 · z9 24,918 · z10 48,162 · z11 45,200 · z12 147,869 · z13 66,669 · z14 31,618.

## Not tested

- Cloning from the GitHub URL (the branch was not pushed at test time).
- `build-roads.sh` on real Linux/macOS (tested in Git Bash only).

## Notes for later phases

- Scripts are idempotent: tools are re-downloaded only when missing or failing their checksum; the PBF only when missing or with `-Refresh` / `--refresh`.
- Scripts fail early with an `ERROR:` line and exit 1 on: missing or too-old Java, checksum mismatch, failed download, Planetiler error, missing output, failed `pmtiles verify`.
- Planetiler rejects `C:/...` paths ("Unsupported scheme C"); the bash script converts with `cygpath -w`.
- `validate.py` keeps its own `CLASS_MAP`. Keep it in sync with `roads.yml`.
- For 2G/3G (phase 5 performance), consider moving residential/service/track to z13 to shrink z12 tiles.
