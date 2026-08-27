# One-time offline generator for city-lights.json - not part of the app
# build or runtime, only re-run by hand if a newer/different source
# dataset is ever wanted. Requires network access; run from this
# directory (`python3 generate-city-lights.py`).
#
# Source: Natural Earth's "populated places" dataset (ne_10m_populated_places),
# the same data provider already used for operational-country-borders.json.
# Natural Earth data is explicitly public domain (no attribution required) -
# https://www.naturalearthdata.com/about/terms-of-use/. Fetched via the
# nvkelso/natural-earth-vector GitHub mirror, which republishes Natural
# Earth's shapefiles as GeoJSON.
#
# Slims the original ~4.9MB/7342-feature GeoJSON (dozens of unused
# cartographic fields) down to just [lng, lat, population] tuples for
# every place with a valid population figure - used to render vector
# city-light points sized/brightened by population (Index 1.3+
# vector-lights rework), instead of the earlier baked-in raster glow.
import json
import urllib.request

SRC_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson"
OUT = "city-lights.json"

with urllib.request.urlopen(SRC_URL) as resp:
    data = json.load(resp)

out = []
for feature in data["features"]:
    props = feature["properties"]
    pop = props.get("pop_max", 0)
    if pop is None or pop <= 0:
        continue
    lng, lat = feature["geometry"]["coordinates"]
    out.append([round(lng, 3), round(lat, 3), int(pop)])

with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))

print(f"done: {len(out)} populated places written to {OUT}")
