# One-time offline generator for src/lib/city-registry.ts - not part of
# the app build or runtime, only re-run by hand if a newer/different
# source dataset is ever wanted. Requires network access; run from this
# directory (`python3 generate-city-registry.py`).
#
# Source: Natural Earth's "populated places" dataset (ne_10m_populated_places),
# the same data provider and file already used for city-lights.json
# (generate-city-lights.py) - but that file strips out everything except
# [lng, lat, population] for baking the night-lights tiles. This generator
# keeps name, country, and capital-status too, since the Country Focus
# "major cities" layer needs to label them, not just glow.
#
# Every place in the source dataset that matches a known country goes in
# - no per-country cap. An earlier version capped this at 6 per country
# (MAX_CITIES_PER_COUNTRY) to keep the Country Focus map layer's dot/
# label display uncluttered, but that cap also silently limited what the
# Operational Search Index (dashboard.tsx) could find - searching a real,
# named town or mid-size city with the misfortune of being the 7th+
# largest in its own country returned nothing. Verified directly (see
# generate-city-registry.py's own commit history) that "_simple" and the
# full ne_10m_populated_places.geojson carry the identical 7,342 point
# features - Natural Earth's "_simple" only drops attribute columns, not
# places - so there was no fuller dataset to switch to; the cap was the
# only real lever. Visual declutter on the map is handled downstream by
# the label-collision system (selectNonOverlappingCities, dashboard.tsx)
# regardless of how many candidates it's given, so removing the cap here
# doesn't reintroduce the clutter problem it was originally added for. A
# country with no populated places in the source dataset (a handful of
# small/uninhabited territories - Nauru and Western Sahara among them)
# simply gets no entry, the same graceful-degradation pattern
# country-capitals.ts already uses, rather than failing.
#
# Reuses the exact Web Mercator projection formula from
# generate-country-registry.py unchanged, so a city lands in the same
# 1000x1000 Operational Geometry space as the country borders it sits
# inside of - any drift between the two projections would put a city
# outside its own country's coastline.
import json
import math
import re
import urllib.request

SRC_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson"
COUNTRY_REGISTRY_PATH = "../../src/lib/country-registry.ts"
OUT_TS_PATH = "../../src/lib/city-registry.ts"
OUT_REPORT_PATH = "city-registry-report.txt"

SEAM = 191.1
LEFT_EDGE = SEAM - 360
MERCATOR_LAT_LIMIT = 85.05112877980659


def mercator_y_fraction(lat_deg):
    lat_rad = math.radians(lat_deg)
    return 0.5 - math.asinh(math.tan(lat_rad)) / (2 * math.pi)


def project(lng, lat):
    x_frac = (lng - LEFT_EDGE) / 360
    clamped_lat = max(-MERCATOR_LAT_LIMIT, min(MERCATOR_LAT_LIMIT, lat))
    y_frac = mercator_y_fraction(clamped_lat)
    return x_frac * 1000, y_frac * 1000


def main():
    with open(COUNTRY_REGISTRY_PATH) as f:
        registry_src = f.read()
    known_iso3 = set(re.findall(r'iso3: "([A-Z]+)"', registry_src))

    with urllib.request.urlopen(SRC_URL) as resp:
        data = json.load(resp)

    by_country = {}
    for feature in data["features"]:
        props = feature["properties"]
        iso3 = props.get("adm0_a3")
        name = props.get("name")
        lng, lat = props.get("longitude"), props.get("latitude")
        if not iso3 or iso3 not in known_iso3 or not name or lng is None or lat is None:
            continue
        pop = props.get("pop_max") or 0
        by_country.setdefault(iso3, []).append(
            {
                "name": name,
                "population": int(pop),
                "capital": props.get("adm0cap") == 1,
                "lng": lng,
                "lat": lat,
            }
        )

    # Natural Earth occasionally carries two separate records with the
    # identical name inside one country (confirmed on Niger: "Niamey"
    # appears both as the adm0cap-flagged capital and again as a lower-
    # population, non-capital record a few km away) - real data, but
    # showing the same name as two dots on the map reads as a bug, not a
    # feature. Deduped per country by name, keeping the capital-flagged
    # copy if either is a capital, otherwise the larger-population one.
    def dedupe_by_name(places):
        best_by_name = {}
        for p in places:
            existing = best_by_name.get(p["name"])
            if existing is None:
                best_by_name[p["name"]] = p
                continue
            existing_wins = existing["capital"] or (not p["capital"] and existing["population"] >= p["population"])
            if not existing_wins:
                best_by_name[p["name"]] = p
        return list(best_by_name.values())

    registry = {}
    for iso3, places in by_country.items():
        places = dedupe_by_name(places)
        capitals = [p for p in places if p["capital"]]
        rest = sorted(
            (p for p in places if not p["capital"]),
            key=lambda p: p["population"],
            reverse=True,
        )
        selected = capitals + rest
        selected.sort(key=lambda p: p["population"], reverse=True)
        registry[iso3] = selected

    countries_with_cities = len(registry)
    countries_without_cities = sorted(known_iso3 - set(registry.keys()))
    total_cities = sum(len(v) for v in registry.values())

    ts_lines = [
        "// GENERATED FILE - do not edit by hand. Regenerate via",
        "// public/data/generate-city-registry.py.",
        "//",
        "// Major-cities lookup for the Country Focus \"major cities\" layer AND",
        "// the Operational Search Index (dashboard.tsx) - keyed by ISO",
        "// 3166-1 alpha-3, matching CountryDefinition.iso3 in",
        "// country-registry.ts. Every place in the source dataset matching a",
        "// known country is included, no per-country cap - the map layer's",
        "// own visual density is handled downstream by its label-collision",
        "// system (selectNonOverlappingCities), not by limiting this data.",
        "// Position is pre-projected into the same 1000x1000 Operational Geometry space",
        "// as CountryDefinition.svgPath (identical Web Mercator projection,",
        "// see generate-country-registry.py) - a city's [x, y] lands inside",
        "// its own country's coastline, not a separate coordinate system. A",
        "// country with no populated places in the source dataset (a handful",
        "// of small/uninhabited territories) simply has no entry here rather",
        "// than an empty array - callers should treat a missing key the same",
        "// as \"no cities to show\", never as an error.",
        "export interface CityDefinition {",
        "  name: string;",
        "  position: [number, number];",
        "  population: number;",
        "  capital: boolean;",
        "}",
        "",
        "export const CITY_REGISTRY: Record<string, CityDefinition[]> = {",
    ]
    for iso3 in sorted(registry.keys()):
        ts_lines.append(f"  {json.dumps(iso3)}: [")
        for p in registry[iso3]:
            x, y = project(p["lng"], p["lat"])
            ts_lines.append(
                "    { name: "
                + json.dumps(p["name"])
                + f", position: [{x:.1f}, {y:.1f}], population: {p['population']}, capital: "
                + ("true" if p["capital"] else "false")
                + " },"
            )
        ts_lines.append("  ],")
    ts_lines.append("};")
    ts_lines.append("")

    ts_content = "\n".join(ts_lines)
    with open(OUT_TS_PATH, "w") as f:
        f.write(ts_content)

    output_size_bytes = len(ts_content.encode("utf-8"))

    report_lines = [
        "City Registry generation report",
        "",
        f"Source dataset: Natural Earth ne_10m_populated_places_simple.geojson (fetched live)",
        f"Projection: identical to generate-country-registry.py (Web Mercator, seam {SEAM}deg,",
        f"            clamped to +-{MERCATOR_LAT_LIMIT}deg lat, 1000x1000 space)",
        "Cap per country: none (every place in the source dataset matching a known country)",
        "",
        f"Countries in registry with at least one city: {countries_with_cities} / {len(known_iso3)}",
        f"Total cities selected: {total_cities}",
        f"Countries with no matching city data (no entry, not an error): {len(countries_without_cities)}",
        "  " + ", ".join(countries_without_cities),
        f"Output file: {OUT_TS_PATH} ({output_size_bytes} bytes, {output_size_bytes/1024:.1f} KB)",
    ]
    report = "\n".join(report_lines)
    with open(OUT_REPORT_PATH, "w") as f:
        f.write(report + "\n")
    print(report)


if __name__ == "__main__":
    main()
