# PAE-PROJECT

An offline-first mobile application that helps schools in Sri Lanka respond to emergencies such as floods and heavy rain. It uses quantum-based optimization to find the best routes for moving students in critical conditions, and keeps working when there is no internet.

> **Status:** Draft / design phase

---

## Table of Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Main Screens](#main-screens)
4. [Architecture decisions](#architecture-decisions)
5. [Folder structure](#folder-structure)
6. [Install and run](#install-and-run)
7. [Regenerating roads.pmtiles](#regenerating-roadspmtiles)
8. [Status by phase](#status-by-phase)
9. [Known issues](#known-issues)
10. [Data sources and licences](#data-sources-and-licences)


---

## Overview

PAE-PROJECT helps school staff, district officers and emergency responders decide **when** to act and **where** to move students when conditions become critical. It combines:

- Real-time hazard data (rainfall, river levels, road status)
- School locations and availability from the Giga map
- An offline road map of Sri Lanka with a Strava-like interface (the whole app is scoped to Sri Lanka only: no global view, no other countries)
- Quantum (or quantum-inspired) route optimization, with a classical fallback
- Predefined templates that turn a trigger into a set of actions
- Alerts translated to the local language of each area

## Requirements

### Core

| # | Requirement | Description |
|---|---|---|
| 1 | Multi-generation mobile support | Works on 2G, 3G, 4G and 5G. Full maps on 4G/5G, lightweight data on 3G, SMS/USSD-style text alerts on 2G. |
| 2 | Quantum route optimization | QUBO/QAOA/annealing to find the best path to move students in critical conditions. Falls back to a classical solver if quantum resources are unavailable. |
| 3 | Offline-first | Fully functional without internet. Maps, school data, templates and the solver are stored on the device. |
| 4 | Real-time data | Rainfall, flood levels, road status and school availability update whenever any link is available. Every data point shows its age. |
| 5 | Giga map and road map | Giga map for schools, connectivity and availability. Offline Sri Lanka road map with a Strava-like interface (route lines, heatmaps, segment status). |
| 6 | Scenario templates | Each emergency has a template linking a trigger to actions. Editable and versioned. |
| 7 | Localized messaging | Alerts translated by area (Sinhala, Tamil, English). |
| 8 | Connectivity flags | Every school, route and device shows its connection status. |
| 9 | Data synchronization | Offline changes are stored locally and merged automatically when a connection returns. |




## Main Screens

1. **Map:** schools, routes, connectivity flags, hazard overlays
2. **Alerts:** active triggers and recommended actions
3. **Route planner:** optimized evacuation plan with ETA and capacity
4. **School detail:** status, students present, connection flag
5. **Templates:** create and edit scenarios
6. **Settings:** language, area and sync status

---

## Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| App type | **PWA** (Vite + TypeScript) | Installable on any Android/iOS phone without a store, cached by a service worker so it works offline, and a single codebase. |
| UI | **Preact + signals** | 4 KB components for panels, sheets and dialogs; light enough for low-end Android. |
| Map engine | **MapLibre GL JS** | Open source (BSD), vector-tile rendering on the GPU, full control over the style (needed for the Strava-like look). |
| Tile format | **PMTiles** (single file) | One static file served over HTTP range requests or read from device storage, so no tile server is needed. That fits offline-first. |
| Tile pipeline | **Planetiler** (Java 21) | Fast, runs natively on Windows without Docker/WSL, and outputs PMTiles directly. |
| Road data | **OpenStreetMap** via Geofabrik | Most complete open road network for Sri Lanka, under the ODbL licence. |
| School data | **Giga "School location" export** (public API, CSV from the portal) | Official school locations for Sri Lanka. Built into a static `schools.json`, so the app never calls the API and no key reaches the browser. Connectivity/speed APIs are private and not available yet. |
| Giga replica | **Clean-room** | We reproduce functions and UX only. No Giga code, logos or copy, and no Strava data or tiles. |

The full rationale is written in `replica/02-architecture/` (phase 2).

## Folder structure

```
.
├── README.md
├── .env.example        # Giga API key variables (copy to .env)
├── replica/            # Phase outputs; each phase reads the previous one
│   ├── 00-plan.md      # Phases, owners and gates
│   ├── 01-recon/       # Screens, flows, components, feature matrix
│   ├── 01-data/        # Road pipeline report and validation
│   ├── 02-architecture/
│   ├── 03-design/      # Tokens, component specs, map style
│   ├── 04-build/
│   └── 05-qa/          # Test plan, bugs, diff, evidence
├── pipeline/           # Reproducible OSM → PMTiles scripts
├── app/                # PWA source (MapLibre + PMTiles)
└── data/               # (gitignored) .osm.pbf, .pmtiles: generate locally
```

## Install and run

Requirements: Node.js ≥ 20, Java 21 (only to regenerate tiles), Git.

```bash
git clone https://github.com/paupujol9376/PAE-PROJECT.git
cd PAE-PROJECT
cp .env.example .env        # then paste your Giga API keys
```

The app commands (`npm install`, `npm run dev`) will be added in phase 4.

**Design preview (phase 3):** after generating `data/roads.pmtiles` and a schools export, run:

```bash
python -I replica/03-design/build_tokens.py      # regenerate tokens.css + WCAG contrast report
node replica/03-design/serve.mjs 8080             # static server with HTTP Range (PMTiles needs it)
# open http://127.0.0.1:8080/replica/03-design/preview.html?theme=dark   (themes: dark, light, a11y)
```

The preview reads `data/schools-preview.geojson` (build it with `python -I replica/03-design/make_preview_schools.py`).

## Regenerating roads.pmtiles

Heavy data is **not** stored in the repo. `pipeline/` turns the Geofabrik Sri Lanka extract into
`data/roads.pmtiles`: one line layer `roads` with every OSM `highway=*` way, z5 to z14.
Requirements: Java 21+, curl (built into Windows 10/11) and, only for the validation step, Python 3.
Nothing else (no Docker, WSL, osmium-tool or tippecanoe). Verified from a fresh clone on Windows 11:

```powershell
git clone https://github.com/paupujol9376/PAE-PROJECT.git
cd PAE-PROJECT
# 1. Download pinned Planetiler 0.10.2 + pmtiles 1.31.2 into pipeline/bin (SHA-256 checked),
#    download data/sri-lanka-latest.osm.pbf (MD5 checked), build data/roads.pmtiles,
#    then run `pmtiles show` and `pmtiles verify`. About 1 minute in total.
powershell -ExecutionPolicy Bypass -File pipeline/build-roads.ps1
# 2. Acceptance gate: metadata, road classes, way-count completeness, tile sizes.
python -m pip install -r pipeline/requirements.txt
python -I pipeline/validate.py --data-dir data
```

Options:

- Another data folder: `pipeline/build-roads.ps1 -DataDir D:\gis\pae-data` (relative paths resolve
  against the repo root), and `validate.py --data-dir D:\gis\pae-data`.
- Newer OSM data: add `-Refresh` to download the current Geofabrik extract again.
- Linux, macOS or Git Bash: `bash pipeline/build-roads.sh [DATA_DIR] [--refresh]`, then the same
  two Python commands (use `python3` where needed).
- `validate.py --out replica/01-data` also writes `stats.json` and `class-counts.csv`.

The schema is `pipeline/roads.yml`; the last gate results are in
`replica/01-data/` (`stats.json`, `class-counts.csv`). Feature ids are `osm_way_id * 10 + 2`.

## Status by phase

| Phase | Status |
|---|---|
| 0: Setup (gitignore, README, plan) | ✅ Done |
| 1A: Recon of Giga map | ✅ Done (15 screens, 7 flows, 44 features; see `replica/01-recon/`) |
| 1B: OSM → PMTiles roads pipeline | ✅ Done (gate passed, see `replica/01-data/`) |
| 2: Architecture | ✅ Done (see `replica/02-architecture/architecture.md`) |
| 3: Design system + map style | ✅ Done (tokens, 94/94 AA contrast, Strava-like road style; see `replica/03-design/`) |
| 4: Build | ⏳ Pending |
| 5: Test, diff, QA | ⏳ Pending |

## Known issues

- Roads tiles: 6 of 340,300 source highway ways (0.0018 %) are not in the z14 tiles. Each is a two-node way under ~0.6 m long that collapses to a single point at the z14 tile grid (4096 units, ~0.6 m). Within the 1 % gate; not fixable in the schema.
- Roads tiles: the largest tile is z12 over central Colombo (148 KB gzipped, 286 KB raw), because every residential and service road starts at z12. Fine for MapLibre, but watch it on 2G/3G.
- Giga connectivity status and speeds come from private APIs that this project has no access to. Schools are shown with status "unknown"; the UI is ready for a data provider.
- Only page 1 of 2 of the Sri Lanka schools export is in `data/` (10,000 of ~10,100 schools). Download page 2 from the Giga portal into `data/`; the build merges every `School_report_*.csv`.
- Sinhala/Tamil map labels: MapLibre cannot shape these scripts, so map labels use English names. All other UI text is fully translated.
- No basemap yet: until `base.pmtiles` (water, coastline, boundaries) is built in phase 4, the sea and the land have the same colour in the map.
- Recon screenshots of Giga are kept locally in `replica/01-recon/screens/` and are gitignored (third-party content, reference only). Regenerate them by re-running the recon (phase 1A).

## Data sources and licences

| Source | Use | Licence / attribution |
|---|---|---|
| OpenStreetMap (via Geofabrik) | Road network | © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). The map must show "© OpenStreetMap contributors". Derived databases shared publicly must stay under ODbL. |
| Giga (UNICEF/ITU) API | School locations and connectivity | Subject to Giga's API terms of use. Credit Giga as the source. |
| MapLibre GL JS | Map rendering | BSD-3-Clause |
| PMTiles | Tile archive format | BSD-3-Clause |
| Planetiler | Tile generation | Apache-2.0 |

