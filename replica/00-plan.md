# Replica plan — Giga map (clean-room) + Sri Lanka roads (Strava-like style)

Target: functions and UX of https://maps.giga.global/map?lng=es, rebuilt from scratch.
No Giga code, logos or copy. No Strava data or tiles; only the visual idea
(glowing lines on a dark base).

Each phase writes to `replica/<phase>/` and the next phase reads from there.

## Phases and gates

| Wave | Branch | Owners | Output | Gate |
|---|---|---|---|---|
| 0 | main | Orchestrator | .gitignore, README, this plan | No binaries or secrets staged; commit + push |
| 1A | fase-1-recon | /replica-recon, GIS Analyst | `replica/01-recon/` | Every public screen/state inventoried with a screenshot; feature matrix (must/should/could); no copied text/code |
| 1B | fase-1-data (worktree, in parallel) | Spatial Data Engineer, Geoprocessing Specialist | `pipeline/`, `replica/01-data/` | roads.pmtiles valid, z5-14, all highway classes present, way count within 1 % of source, exact commands in README |
| 2 | fase-2-architect | Software Architect, Web GIS Developer | `replica/02-architecture/` | Justified stack; Giga API contract verified with a real call; offline-first + i18n EN/SI/TA covered |
| 3 | fase-3-design | Cartography Designer, UI Designer | `replica/03-design/` | WCAG AA UI; road classes distinguishable at every zoom; colorblind-safe; original assets |
| 4 | fase-4-build | Frontend Developer, Web GIS Developer | `app/` | Core flow works; roads + Giga schools layers; offline after first load; 3 languages |
| 5 | fase-5-qa | Test Automation, GIS QA, Performance Benchmarker, Evidence Collector, Reality Checker | `replica/05-qa/` | e2e green; must-have parity 100 %; no critical bugs; Reality Checker verdict with screenshots |

Merge to `main` only when the gate passes. Push after each phase.

## Decisions taken in wave 0
- App type: PWA (Vite + TypeScript, MapLibre GL JS, PMTiles protocol, service worker).
- Tile pipeline: Planetiler (Java 21 available; no Docker/WSL on the dev machine).
- Giga API keys live only in `.env` (gitignored); `.env.example` documents the variables.
- Scope: **Sri Lanka only** (2026-11-15). Map, schools and roads are limited to Sri Lanka; no global view or other countries.
