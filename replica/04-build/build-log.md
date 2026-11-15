# Build log (phase 4)

Branch `fase-4-build`. Date: 2026-11-15. Stack as planned in `replica/02-architecture/architecture.md`: Vite 5 + TypeScript + Preact + signals, MapLibre GL 4.7, PMTiles 3.2, vite-plugin-pwa (Workbox), Lucide icons, Fontsource Noto fonts.
Clean room: no Giga code, assets or copy; every label written fresh (EN), then translated (SI/TA drafts).

## Data built in this phase

| file | how | size | notes |
|---|---|---|---|
| `data/base.pmtiles` | `pipeline/build-base.ps1` (Planetiler, `pipeline/base.yml`) | 8.9 MB | inland water, rivers, places; z6–14; `pmtiles verify` OK |
| `data/schools.json` | `pipeline/build_schools.py` | 0.90 MB | 10,000 schools, 9 provinces, 25 districts (names EN/SI/TA), 0 schools unassigned |
| `data/land.json` | same (OSM `natural=coastline`, polygonised, simplified 0.0003°) | 0.15 MB | 265 polygons, ≈ 65,000 km² |
| `data/admin.json` | same (admin_level 4 and 5, clipped to land, simplified) | 0.53 MB | borders overlay |

## Screens

| ID | date | status | missing / notes | harder than expected |
|---|---|---|---|---|
| S09 country view (Sri Lanka) | 2026-11-15 | done | connected/speed KPIs show "–" (no data) | map container had 0 px height: MapLibre's own CSS (`position: relative`) loaded after ours |
| S08 search | 2026-11-15 | done | | "K.V." vs "kv": normalisation drops dots; districts/provinces searchable in SI/TA |
| S10 school detail + popup | 2026-11-15 | done | speed chart / week navigator blocked (no data) | popup `close` event also fires on programmatic remove; guarded by route |
| district / province view | 2026-11-15 | done | | long names overflowed the grid → `minmax(0,1fr)` |
| S15 mobile bottom sheet | 2026-11-15 | done | drag uses a simple up/down gesture, not continuous | deep links did not centre the map → fly to the linked school/area after data loads |
| S03 map settings | 2026-11-15 | done | no basemap variants | |
| S04 accessibility mode | 2026-11-15 | done | | |
| S05 share | 2026-11-15 | done | social buttons replaced by native Web Share | |
| S13 about the data | 2026-11-15 | done | own wording | |
| S02 menu + language | 2026-11-15 | done | SI/TA strings are drafts | |
| S16 offline (new) | 2026-11-15 | done | Safari: OPFS `createWritable` missing → shows "unsupported" | Sinhala-only street names requested missing glyph ranges and failed offline → English-only place labels + empty SI/TA glyph ranges |
| S11 filters | 2026-11-15 | partial | education-level chips in the panel; no province select (lists instead) | |
| S12 layer picker | 2026-11-15 | partial | data layers need private APIs; road groups + overlays instead | |
| S01/S07 global, country list | — | skipped | Sri Lanka-only scope | |

## Verification (all on the production build, Edge via Playwright)

- `tsc --noEmit`: 0 errors. Unit tests (Vitest, search + parsing): **6/6 pass**.
- Build gate `scripts/check-dist.mjs`: **no Giga keys in `dist/`**.
- Screens `clone-screens/C*.jpg`: 15 views, **0 console errors**, 1.4–5 s to an idle map (local server).
- Interaction smoke (`smoke/interact.js`): **18/18 pass**: Tab order, keyboard search, deep link (school + `?lang=ta`), popup, dialog open/Escape/focus return, road chip, level filter (Secondary = 983), a11y theme on UI and map, share copies link, panel collapse, click on a school dot.
- Offline smoke (`smoke/offline-test.js`): service worker controls the page; "Download all" stores `roads.pmtiles` (37,148,344 B) and `base.pmtiles` (8,921,154 B) in OPFS in ≈2.3 s locally; **offline reload renders 11,388 features from OPFS**, the offline banner shows, z13.5 Kandy renders 1,054 road features; **0 errors**.

## Feature matrix after build (`replica/01-recon/features.csv`)

| priority | yes | partial | no |
|---|---|---|---|
| must (24) | 15 | 5 | 4 |
| should (11) | 8 | 2 | 1 |
| could (4) | 0 | 1 | 3 |

The 4 must-haves marked `no`: speed-bucket colouring, week navigator and speed chart (all blocked by the private Giga APIs), and legend checkboxes (left out on purpose: with every school "unknown" they filter nothing). Revisit when a `ConnectivityProvider` exists.

## Known gaps carried to phase 5

- JS bundle 906 KB raw / 255 KB gzip (MapLibre is ~75 %). Fine on 4G; measure on 3G in phase 5.
- SI/TA translations are drafts by the developer, not by a native speaker.
- Only page 1 of 2 of the schools export (10,000 of ~10,100).
- No Playwright test project yet: the smoke scripts are standalone; phase 5 turns them into `@playwright/test` specs.
