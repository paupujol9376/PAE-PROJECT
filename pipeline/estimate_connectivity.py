"""Assign an ESTIMATED connectivity status to every school, per district.

    python -I pipeline/estimate_connectivity.py [--data-dir data]

Input:  <data-dir>/schools.json (from build_schools.py)
Output: <data-dir>/connectivity.json  {method, generatedAt, rates, status: {gigaId: "connected"|"not_connected"}}

WHY THIS IS AN ESTIMATE
Per-school connectivity is only available through Giga's private APIs, which this project
has no access to. The project owner provided a visual estimate of the share of connected
schools per region of Sri Lanka, read from an image of the public Giga map (margin of error
about ±10-15 points; dense areas may over-represent "not connected"). The rates below are
the mid-points of those ranges. Within each district, schools are ordered by a hash of
their Giga ID and the first round(rate × n) are marked connected, so the result is
stable between runs and matches each district's rate exactly. It says NOTHING reliable
about any individual school. Replace with real data as soon as the Giga "School profile"
API is available.
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import sys

# Share of connected schools per district (mid-point of the owner's regional estimate).
RATES = {
    # Extremo norte (península de Jaffna): 60-65 % connected
    "Jaffna": 0.62,
    # Norte interior (Vanni): ~30 %
    "Kilinochchi": 0.30, "Mullaitivu": 0.30, "Vavuniya": 0.30,
    # Costa noroeste: 55-60 %
    "Mannar": 0.57, "Puttalam": 0.57,
    # Noreste: ~35 %
    "Trincomalee": 0.35,
    # Centro-norte: 30-35 %
    "Anuradhapura": 0.32, "Polonnaruwa": 0.32,
    # Este: ~40 %
    "Batticaloa": 0.40, "Ampara": 0.40,
    # Centro montañoso: ~35 %
    "Kandy": 0.35, "Matale": 0.35, "Nuwara Eliya": 0.35,
    # Oeste costero: 45-50 %
    "Gampaha": 0.47, "Colombo": 0.47, "Kalutara": 0.47,
    # Suroeste interior: 25-30 %
    "Ratnapura": 0.27, "Kegalle": 0.27,
    # Galle: interior counted in the south-west (27 %), coast in the south (40 %): mid-point. ASSUMPTION.
    "Galle": 0.33,
    # Sur y sureste: ~40 %
    "Matara": 0.40, "Hambantota": 0.40, "Monaragala": 0.40,
    # Not covered by the estimate. ASSUMPTIONS from the neighbouring regions:
    "Kurunegala": 0.40,  # between the north-west coast (57 %) and the central hills (35 %)
    "Badulla": 0.37,     # between the central hills (35 %) and the south-east (40 %)
}
DEFAULT_RATE = 0.40  # schools without a district: the island-wide estimate (40-45 %)


def key(gid: str) -> str:
    return hashlib.sha256(gid.encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data")
    data = pathlib.Path(ap.parse_args().data_dir).resolve()
    src = data / "schools.json"
    if not src.exists():
        sys.exit(f"ERROR: {src} missing; run pipeline/build_schools.py first")
    s = json.loads(src.read_text(encoding="utf-8"))
    names = [d["name"]["en"] for d in s["districts"]]
    missing = [n for n in names if n not in RATES]
    if missing:
        sys.exit(f"ERROR: no rate for districts {missing}")

    groups: dict[str, list[str]] = {}
    for row in s["schools"]:
        gid, d = row[0], row[6]
        groups.setdefault(names[d] if d >= 0 else "", []).append(gid)

    status, summary = {}, {}
    for district, ids in groups.items():
        rate = RATES.get(district, DEFAULT_RATE)
        ids = sorted(ids, key=key)
        n_conn = round(rate * len(ids))
        for i, gid in enumerate(ids):
            status[gid] = "connected" if i < n_conn else "not_connected"
        summary[district or "(none)"] = {"schools": len(ids), "rate": rate, "connected": n_conn}

    total = len(status)
    conn = sum(v == "connected" for v in status.values())
    out = {
        "version": 1,
        "kind": "estimate",
        "method": "Regional visual estimate of the share of connected schools (project owner, from an image of the public Giga map, ±10-15 points), applied per district; schools ordered by SHA-256 of the Giga ID. Not measured per school.",
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "rates": summary,
        "status": status,
    }
    (data / "connectivity.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"connectivity.json: {total} schools, {conn} connected ({conn / total:.1%}), {total - conn} not connected")


if __name__ == "__main__":
    main()
