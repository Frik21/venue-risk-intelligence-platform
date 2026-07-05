# One-time offline generator for earth-at-night.webp / earth-at-night-no-lights.webp -
# not part of the app build or runtime, only re-run by hand if the source
# country-borders or city-lights datasets ever change. Requires Pillow and
# NumPy (`pip install Pillow numpy`); run from this directory
# (`python3 generate-night-map.py`).
#
# Rasterizes our own real vector data - the same operational-country-borders.json
# already used for country selection/outlining, plus city-lights.json (see
# generate-city-lights.py) - into two flat WEBP images, rather than sourcing or
# hand-editing a photographic image. Earlier versions of this layer shipped a
# single 2048px-wide static image of unknown provenance; at country-zoom levels
# (this app's maxZoom is 16, but the map's own locked zoom range in practice
# reaches 6 on a selected country) that image's pixel density fell far short of
# the viewport's own native resolution, reading as visibly blurry/pixelated.
# WIDTH below (16383) is chosen to match Leaflet's own native pixel density at
# zoom 6 (256 * 2^6 = 16384, minus 1px to stay under WEBP's 16383px hard limit)
# so the image never needs to be upscaled beyond its own source resolution at
# any zoom this app actually uses.
#
# Two variants are produced from the same landmass pass:
#   - earth-at-night.webp: landmass + real city-light glow (default world view)
#   - earth-at-night-no-lights.webp: landmass only, no lights (shown once a
#     country's zoom-in animation settles - see NightMapLayer in dashboard.tsx)
# generated as two separate images (not a single image with a CSS/runtime
# toggle) since the lights are baked pixel data, not a separable layer.
import json
import math
import time

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

BORDERS_PATH = "operational-country-borders.json"
LIGHTS_PATH = "city-lights.json"
LANDMASS_OUT = "earth-at-night-no-lights.webp"
LIT_OUT = "earth-at-night.webp"

WIDTH = 16383
WEST, EAST = -168.9, 191.1
SOUTH, NORTH = -85.05112877980659, 85.05112877980659

OCEAN_COLOR = (0x00, 0x08, 0x1A)
LANDMASS_FILL_COLOR = (0x1C, 0x1F, 0x16)
LIGHT_COLOR = np.array([255.0, 226.0, 158.0])  # warm amber, matches the app's existing glow tone

BAND_HEIGHT = 1024


def mercator_y_fraction(lat_deg):
    lat_rad = math.radians(lat_deg)
    return 0.5 - math.asinh(math.tan(lat_rad)) / (2 * math.pi)


NORTH_YFRAC = mercator_y_fraction(NORTH)
SOUTH_YFRAC = mercator_y_fraction(SOUTH)
HEIGHT = round((SOUTH_YFRAC - NORTH_YFRAC) * WIDTH)


def project(lng, lat):
    x = (lng - WEST) / (EAST - WEST) * WIDTH
    yfrac = mercator_y_fraction(lat)
    y = (yfrac - NORTH_YFRAC) / (SOUTH_YFRAC - NORTH_YFRAC) * HEIGHT
    return (x, y)


# Reimplements unwrapRingLongitudes / alignCrossingRings / unwrapGeometry from
# dashboard.tsx exactly, so antimeridian-crossing countries (Russia, Fiji)
# rasterize as one continuous shape instead of snapping across the seam -
# same logic, just in Python instead of TS.
def unwrap_ring_longitudes(ring):
    offset = 0
    crossed = False
    points = [ring[0]]
    for i in range(1, len(ring)):
        delta = ring[i][0] - ring[i - 1][0]
        if delta > 180:
            offset -= 360
            crossed = True
        elif delta < -180:
            offset += 360
            crossed = True
        points.append([ring[i][0] + offset, ring[i][1]])
    return points, crossed


def ring_area(ring):
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def align_crossing_rings(rings):
    largest = max(rings, key=lambda r: ring_area(r[0]))
    reference_lng = largest[0][0][0]
    out = []
    for points, crossed in rings:
        if not crossed:
            out.append(points)
            continue
        shift = round((reference_lng - points[0][0]) / 360) * 360
        out.append([[lng + shift, lat] for lng, lat in points] if shift else points)
    return out


def unwrap_geometry(geometry):
    gtype = geometry["type"]
    if gtype == "Polygon":
        unwrapped = [unwrap_ring_longitudes(ring) for ring in geometry["coordinates"]]
        return {"type": "Polygon", "coordinates": align_crossing_rings(unwrapped)}
    if gtype == "MultiPolygon":
        polygons_unwrapped = [[unwrap_ring_longitudes(ring) for ring in poly] for poly in geometry["coordinates"]]
        flat = [r for poly in polygons_unwrapped for r in poly]
        aligned = align_crossing_rings(flat)
        coordinates = []
        cursor = 0
        for poly in polygons_unwrapped:
            coordinates.append([aligned[cursor + i] for i in range(len(poly))])
            cursor += len(poly)
        return {"type": "MultiPolygon", "coordinates": coordinates}
    return geometry


def draw_polygon_rings(draw, rings):
    exterior = [project(lng, lat) for lng, lat in rings[0]]
    draw.polygon(exterior, fill=LANDMASS_FILL_COLOR)
    for hole in rings[1:]:
        hole_px = [project(lng, lat) for lng, lat in hole]
        draw.polygon(hole_px, fill=OCEAN_COLOR)


def rasterize_landmass():
    from PIL import ImageDraw

    with open(BORDERS_PATH) as f:
        data = json.load(f)

    img = Image.new("RGB", (WIDTH, HEIGHT), OCEAN_COLOR)
    draw = ImageDraw.Draw(img)
    for feature in data["features"]:
        geometry = unwrap_geometry(feature["geometry"])
        if geometry["type"] == "Polygon":
            draw_polygon_rings(draw, geometry["coordinates"])
        elif geometry["type"] == "MultiPolygon":
            for rings in geometry["coordinates"]:
                draw_polygon_rings(draw, rings)
    return img


def light_params(population):
    t = (math.log10(population + 1) - 2.5) / (7.3 - 2.5)
    t = max(0.0, min(1.0, t))
    core_r = 2.2 + t * 15.0
    halo_r = core_r * 3.4
    peak = 0.55 + t * 1.65
    return core_r, halo_r, peak


def bake_lights(base):
    with open(LIGHTS_PATH) as f:
        raw_lights = json.load(f)

    lights = []
    for lng, lat, pop in raw_lights:
        px, py = project(lng, lat)
        core_r, halo_r, peak = light_params(pop)
        lights.append((px, py, core_r, halo_r, peak))

    out_img = Image.new("RGB", (WIDTH, HEIGHT))
    for y0 in range(0, HEIGHT, BAND_HEIGHT):
        y1 = min(y0 + BAND_HEIGHT, HEIGHT)
        band_h = y1 - y0

        glow = np.zeros((band_h, WIDTH), dtype=np.float32)
        for px, py, core_r, halo_r, peak in lights:
            if py + halo_r < y0 or py - halo_r > y1:
                continue
            r = int(math.ceil(halo_r))
            x0, x1 = int(px) - r, int(px) + r + 1
            ly0, ly1 = int(py) - r, int(py) + r + 1
            cx0, cx1 = max(x0, 0), min(x1, WIDTH)
            cy0, cy1 = max(ly0, y0), min(ly1, y1)
            if cx0 >= cx1 or cy0 >= cy1:
                continue

            ys, xs = np.mgrid[cy0:cy1, cx0:cx1]
            dist = np.sqrt((xs - px) ** 2 + (ys - py) ** 2)

            glow_alpha = np.clip(1.0 - dist / halo_r, 0.0, 1.0) ** 2 * (peak * 0.4)
            core_alpha = np.clip(1.0 - dist / core_r, 0.0, 1.0) ** 1.5 * peak
            glow[cy0 - y0 : cy1 - y0, cx0:cx1] += glow_alpha + core_alpha

        base_band = np.asarray(base.crop((0, y0, WIDTH, y1)), dtype=np.float32)
        vis = np.clip(1.0 - np.exp(-glow * 0.9), 0.0, 1.0)[:, :, None]
        out_band = base_band * (1.0 - vis) + LIGHT_COLOR[None, None, :] * vis
        out_img.paste(Image.fromarray(np.clip(out_band, 0, 255).astype(np.uint8), "RGB"), (0, y0))

    return out_img


def main():
    t0 = time.time()
    landmass = rasterize_landmass()
    print(f"rasterized landmass in {time.time()-t0:.1f}s")

    landmass.save(LANDMASS_OUT, "WEBP", quality=80, method=6)
    print(f"saved {LANDMASS_OUT}")

    t0 = time.time()
    lit = bake_lights(landmass)
    print(f"baked city lights in {time.time()-t0:.1f}s")

    lit.save(LIT_OUT, "WEBP", quality=80, method=6)
    print(f"saved {LIT_OUT}")


if __name__ == "__main__":
    main()
