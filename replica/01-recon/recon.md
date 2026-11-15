# Recon map: Giga Maps (web, desktop + mobile)

Scope: the public school-connectivity map, focused on the country → school drill-down for **Sri Lanka**, plus the PAE additions (all Sri Lanka roads in a Strava-like style, offline-first, EN/SI/TA).
For: PAE project, a PWA for Sri Lankan school staff and emergency responders.
Date: 2026-11-15
Method: clean-room. Public pages only, no login. Pages were rendered with Playwright driving the installed Microsoft Edge, one page load per state, at human pace. No JS bundles read, no network calls logged, no copy taken. Screens are described in our own words.
Reference screenshots: `replica/01-recon/screens/` (gitignored, local only, never shipped).

## Sources

| # | source | URL | notes |
|---|---|---|---|
| 1 | Giga Maps (live app) | https://maps.giga.global/map?lng=es | Main source; all screens below |
| 2 | Giga website | https://giga.global/ | Positioning: UNICEF + ITU initiative to connect every school |
| 3 | Giga FAQ | https://giga.global/faq/ | General only; no map feature details |
| 4 | Giga terms of use | https://giga.global/terms-of-use/ | Body not readable without JS; re-check in phase 2 before using the API |
| 5 | Giga Maps API (Swagger) | https://uni-ooi-giga-maps-service.azurewebsites.net/api/v1/ | Public API docs page (SPA). The user holds two keys (school location, country). Contract to be verified in phase 2 |

## Core loop

Find a place (country or school), see at a glance which schools are connected and how fast, then open a school to see its details and speed history.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
|---|---|---|---|---|---|
| S01 | Global map | `/map` | Worldwide overview of schools and health facilities | Side panel (title, intro, two stat cards with 3 KPIs each, partner logos), search bar with country picker, facility-type chips, map controls, legend card | filled (dark) |
| S02 | Main menu | ☰ in panel header | Language and secondary links | Close button, language combobox (ES selected) | open |
| S03 | Theme & layers dialog | ⚙ map control | Choose theme, basemap and overlays | Radio groups: theme (dark/light), basemap (default/satellite/street); switches: admin boundaries, labels, admin-level navigation; Cancel/Apply | open |
| S04 | Accessibility popover | ♿ map control | High-contrast + colour-blind-safe palette | Switch with state label, explanatory text | off |
| S05 | Share dialog | share icon in panel | Share the current view | Modal title, read-only URL field + copy button, 3 social buttons, close | open |
| S06 | Legend hidden | legend map control (toggle) | Free map space | Legend card toggled off | hidden |
| S07 | Country list | globe button left of search | Browse countries with data | Scrollable list of country rows | filled (long list) |
| S08 | Search results | type in search | Find a country, region or school | Results list: row = name + type + admin area / country; clear button | filled ("Sri Lanka": 1 country + many schools) |
| S09 | Country view (Sri Lanka) | pick country in S08 or `/map/country/lk` | Country KPIs and map zoomed to country | Breadcrumb (home > country) + share; schools card: 3 counts (total / connected / with speed data), average download speed big number, week navigator (prev / next / latest), weekly/monthly tabs, bar chart with benchmark line, data source; layer tiles (status, download speed, mobile coverage, "more"); health card; Filters button; legend with per-category **checkboxes and counts** | filled |
| S10 | School detail | pick school in S08, or click a school dot | One school's connectivity | Breadcrumb (home > country > … > school); panel: name, avg speed, week nav, weekly/monthly chart, details (coordinates, status, Giga ID, …), data source; map: pin + popup card (name, speed badge, week, source, open link) | filled |
| S11 | Filters drawer | "Filtro(s)" in country view | Narrow schools by attribute | Right drawer, collapsible per facility type, select dropdowns (education level, …), Clear all / Apply | open, nothing selected |
| S12 | Layer picker | "more" tile in S09 | Pick the active data layer | Popover with two groups: real-time layers (download speed variants) and static layers (status, mobile coverage, fibre-node distance); tooltip on hover; disabled tiles where no data | open |
| S13 | About our data | link in intro text | Data provenance disclaimer | Dismissible popover with close button | open |
| S14 | Country view, light theme | S03 → light → Apply | Same as S09 with light UI and basemap | Same as S09 | light |
| S15 | Country view, mobile (390 px) | `/map/country/lk` on phone | Mobile layout | Full-width header + search, horizontally scrolling chips, floating map controls, **bottom sheet** with resize handle, title, share and close-to-global | collapsed sheet |

Not seen yet (no public trigger found or needs data): empty search result, loading skeletons, API error, health-facility detail, satellite basemap, accessibility mode ON. Record them in phase 3 as states to design anyway.

## URL state (visible in the address bar)

The view is fully addressable: `/map` (global), `/map/country/{iso2}`, `/map/entity/?country={iso2}&school_ids={id}`, with query params for language (`lng`), visible facility types/statuses and the active layer. The clone should keep this idea (deep links that restore the view), with our own route names.

## Flows

```
F01 Find a school by name and check its connectivity
    S01 -> S08 (type name) -> S10
    happy path clicks: 2 + typing
    edge: no results; same name in several provinces; school without speed data

F02 Explore a country
    S01 -> S08 or S07 -> S09 -> (S12 change layer) -> (legend checkboxes)
    happy path clicks: 2
    edge: country with no realtime data (disabled layers); health facilities absent

F03 Drill down from the map
    S09 -> zoom/click school dot -> popup -> S10
    happy path clicks: 2 (+ zoom)
    edge: overlapping dots at low zoom; mobile tap targets

F04 Read speed history
    S09 or S10 -> week prev/next/latest -> weekly/monthly tab
    happy path clicks: 1-3
    edge: weeks without measurements; benchmark line above all bars

F05 Filter schools
    S09 -> S11 -> select values -> Apply
    happy path clicks: 3-4
    edge: filter yields zero schools; clear all

F06 Personalise the view
    any -> S03 (theme, basemap, overlays) -> Apply   |  S04 accessibility toggle  |  S02 language
    happy path clicks: 3

F07 Share a view
    any -> S05 -> copy link
    happy path clicks: 2
```

## Components

| component | variants | states | used on |
|---|---|---|---|
| Side panel | desktop docked (collapsible via edge tab), mobile bottom sheet | expanded, collapsed, resizing | all |
| Search box | with country-picker prefix button | empty, typing, results, clear | S01, S08–S10 |
| Result row | country, school (with admin area) | default, hover, focus | S08 |
| Breadcrumb | 2–4 levels with ellipsis | truncated | S09, S10 |
| Facility chips | all / schools / health | selected, unselected | top of map |
| Stat card | collapsible section with KPI rows or count trio | expanded, collapsed | S01, S09 |
| Big metric | value + unit + info tooltip, coloured by quality | good, moderate, bad, unknown | S09, S10 |
| Week navigator | prev / range label / next / jump to latest | disabled at bounds | S09, S10 |
| Segmented tabs | weekly / monthly | selected | S09, S10 |
| Bar chart | bars + benchmark line, date axis | filled, empty | S09, S10 |
| Layer tile | icon + label + info, grid; "more" tile | active, inactive, disabled | S09, S12 |
| Legend card | tabs per facility type; two columns (status, speed bucket); read-only (global) or checkbox + count (country) | shown, hidden | map |
| Map controls | zoom in/out, accessibility, theme & layers, legend | default, active | map |
| Popover / dialog | small popover, modal with focus trap, right drawer | open, closed | S03–S05, S11–S13 |
| Switch | on/off with label | on, off | S03, S04 |
| Radio group | theme, basemap | selected | S03 |
| Select dropdown | filter fields | empty, selected | S11 |
| Map marker + popup | school pin, popup card with source badge and open link | open | S10 |
| School dot | colour = status or speed bucket; ring style per bucket | normal, highlighted | map |
| Toast/notice | dismissible info | open | S13 |
| Attribution bar | year, partner marks, basemap attribution | — | footer |

## Inferred data model

```
Country      iso2, name, school_count, connected_count, with_speed_count,
             avg_download_mbps (by week/month), data_sources[]
             evidence: S09 cards, URL /map/country/lk
             confidence: high

School       giga_id (uuid), external id (numeric, in URL), name, lat, lon,
             country_iso2, admin1 (province, local script), admin2?,
             education_level, connectivity_status (connected | not_connected | unknown),
             data_source (e.g. national ministry of education),
             mobile_coverage?, fibre_node_distance_km?
             evidence: S08 rows, S10 details + popup, S11 filter, S12 layers
             confidence: high (core fields), medium (coverage / fibre)

Measurement  school_id, period (week | month), period_start, avg_download_mbps,
             (upload / latency likely), source (realtime meter | SNMP)
             evidence: S09/S10 charts and week navigator, S12 realtime layers
             confidence: medium

SpeedBucket  good | moderate | bad | unknown, relative to a 20 Mbps global benchmark
             evidence: legend, benchmark selector in S09
             confidence: high for categories, guess for exact thresholds

HealthFacility  same shape as School, separate tab/filter
             evidence: S01 card, chips, legend tab
             confidence: medium (not visible for Sri Lanka)

Layer        id, kind (realtime | static), name, available_for_country
             evidence: S12
             confidence: medium
```

Relationships: Country 1-n School, School 1-n Measurement, Country 1-n HealthFacility, Layer n-n Country (availability).

Sri Lanka figures seen on 2026-11-15 (for sanity checks only, not shipped): ~10.1k schools, ~4k connected, ~6.1k not connected, country avg download ~38.9 Mbps for 02–08 Nov 2026.

## PAE additions (not in the original)

- **Roads layer**: all Sri Lanka `highway=*` lines from `data/roads.pmtiles` (phase 1B), Strava-like glow on dark, colour and width per class, toggle per class group.
- **Offline-first**: app shell, roads, last school snapshot and translations cached on the device; every data point shows its age.
- **i18n EN / SI / TA** (the original offers several languages but not Sinhala/Tamil UI).
- Sri Lanka as the default and only country view (global view simplified).

## Feature matrix

See `features.csv`. Must: 23, should: 11, could: 6, skip: 4.

## Out of scope (cannot or should not be cloned)

- Giga's name, logos, partner marks, copy and colour identity (we design our own in phase 3).
- The global dataset and realtime measurement network (Giga Meter / SNMP feeds): we consume the public API, we do not rebuild the network.
- Mapbox basemap and its styles (we use our own PMTiles + open basemap).
- Satellite imagery (licensed).

## Size

Screens 15 (+ PAE roads/offline settings), flows 7, entities 6.
Hard parts: (1) offline-first with a large tile archive and data snapshots, (2) rendering ~10k school points + 340k road ways smoothly on low-end phones, (3) Giga API contract/limits and keeping keys out of the client, (4) Sinhala/Tamil typography and translations.
Size: **M** (a few weeks) for the Sri Lanka slice.
