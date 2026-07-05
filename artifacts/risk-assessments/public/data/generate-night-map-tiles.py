# One-time offline generator for the tiles/ directory - not part of the app
# build or runtime, only re-run by hand if the source country-borders or
# city-lights datasets ever change. Requires Pillow and NumPy
# (`pip install Pillow numpy`); run from this directory
# (`python3 generate-night-map-tiles.py`).
#
# Supersedes the earlier single-image approach (generate-night-map.py,
# earth-at-night.webp/earth-at-night-no-lights.webp): a single 16383px image
# solved blur at country-zoom, but the browser had to decode all ~268
# million of its pixels every time it was swapped in, which cost multiple
# seconds of main-thread blocking on each country selection - the whole
# image is "the same size pixels everywhere" whether or not that pixel is
# open ocean or a detailed coastline. Standard Web Mercator XYZ tiling (the
# same technique every web map product uses) fixes this by never showing
# more resolution than a given zoom level needs: a small single tile covers
# the whole world at the default view, and only the handful of 256px tiles
# actually visible in the viewport get decoded once zoomed into a country -
# each is small enough to decode in a fraction of a millisecond, regardless
# of how much total map data exists.
#
# Every tile in the grid is generated, including pure-ocean ones - skipping
# them and relying on Leaflet's "missing tile is transparent" behaviour was
# tried first, but left a visible seam wherever a real ocean tile's flat
# fill met the CSS radial-gradient fallback (index.css) showing through
# the gap; the two are rarely the same tone at a given point. A tiny flat
# tile decodes just as fast as any other, so there's no perf reason to
# skip them.
import json
import math
import os
import time

import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

BORDERS_PATH = "operational-country-borders.json"
LIGHTS_PATH = "city-lights.json"
OUT_ROOT = "tiles"

# 512px tiles (not the more typical 256px) - same total pixel density,
# but a quarter as many tiles cover any given viewport, cutting request
# count proportionally. That matters more than usual here: this app's
# zoom transitions are all animated flyToBounds calls that pass through
# several intermediate integer zoom levels, and Leaflet fetches tiles for
# each one it passes even mid-animation - so total request count per
# transition is already inflated well beyond what the final view alone
# needs. The frontend (dashboard.tsx) sets zoomOffset=-1 to compensate:
# a 512px tile at internal zoom z covers the same ground a 256px tile
# would at map zoom z+1, so map-perceived maxNativeZoom is unchanged.
TILE_SIZE = 512
OCEAN_COLOR = (0x00, 0x08, 0x1A)
LANDMASS_FILL_COLOR = (0x1C, 0x1F, 0x16)
LIGHT_COLOR = np.array([255.0, 226.0, 158.0])

LIT_MAX_ZOOM = 4
NOLIGHTS_MAX_ZOOM = 5

SHIFTS = (0, -360, 360)


def mercator_y_fraction(lat_deg):
    lat_rad = math.radians(lat_deg)
    return 0.5 - math.asinh(math.tan(lat_rad)) / (2 * math.pi)


def world_px_x(lng, z):
    return (lng + 180) / 360 * (TILE_SIZE * (1 << z))


def world_px_y(lat, z):
    return mercator_y_fraction(lat) * (TILE_SIZE * (1 << z))


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


def load_features():
    with open(BORDERS_PATH) as f:
        data = json.load(f)
    features = []
    for feature in data["features"]:
        geometry = unwrap_geometry(feature["geometry"])
        polys = []
        if geometry["type"] == "Polygon":
            polys = [geometry["coordinates"]]
        elif geometry["type"] == "MultiPolygon":
            polys = geometry["coordinates"]
        for rings in polys:
            all_lngs = [pt[0] for ring in rings for pt in ring]
            features.append({"rings": rings, "min_lng": min(all_lngs), "max_lng": max(all_lngs)})
    return features


# Reference zoom the radii below were tuned at - matches the earlier
# single-image approach's implicit resolution (16383px wide == this app's
# native pixel density at zoom 6). Radii scale down proportionally at
# lower zooms (see generate_zoom_level) since a fixed pixel radius applied
# at every zoom would cover a much larger *fraction* of the (much smaller)
# world tile at low zoom - without scaling, 7332 lights' halos overlapped
# into one solid blob at low zoom instead of individual dots, since each
# halo was tuned to be a small dot only relative to a zoom-6-sized world.
REFERENCE_ZOOM = NOLIGHTS_MAX_ZOOM


def light_params(population):
    t = (math.log10(population + 1) - 2.5) / (7.3 - 2.5)
    t = max(0.0, min(1.0, t))
    core_r = 2.2 + t * 15.0
    halo_r = core_r * 3.4
    peak = 0.55 + t * 1.65
    return core_r, halo_r, peak


def load_lights():
    with open(LIGHTS_PATH) as f:
        raw = json.load(f)
    out = []
    for lng, lat, pop in raw:
        core_r, halo_r, peak = light_params(pop)
        out.append((lng, lat, core_r, halo_r, peak))
    return out


def relevant_shifts(min_lng, max_lng, margin=1.0):
    out = []
    for shift in SHIFTS:
        if max_lng + shift >= -180 - margin and min_lng + shift <= 180 + margin:
            out.append(shift)
    return out


def tiles_for_bbox(px_min, px_max, py_min, py_max, z, buffer_px=8):
    n = 1 << z
    tx0 = math.floor((px_min - buffer_px) / TILE_SIZE)
    tx1 = math.floor((px_max + buffer_px) / TILE_SIZE)
    ty0 = max(0, math.floor((py_min - buffer_px) / TILE_SIZE))
    ty1 = min(n - 1, math.floor((py_max + buffer_px) / TILE_SIZE))
    if ty0 > ty1:
        return []
    tx0c = max(0, tx0)
    tx1c = min(n - 1, tx1)
    if tx0c > tx1c:
        return []
    return [(tx, ty) for tx in range(tx0c, tx1c + 1) for ty in range(ty0, ty1 + 1)]


def generate_zoom_level(features, lights, z, out_dir, include_lights):
    n = 1 << z
    tile_polys = {}
    for feat in features:
        for shift in relevant_shifts(feat["min_lng"], feat["max_lng"]):
            rings_px = []
            all_px, all_py = [], []
            for ring in feat["rings"]:
                pts = [(world_px_x(lng + shift, z), world_px_y(lat, z)) for lng, lat in ring]
                rings_px.append(pts)
                all_px.extend(p[0] for p in pts)
                all_py.extend(p[1] for p in pts)
            px_min, px_max = min(all_px), max(all_px)
            py_min, py_max = min(all_py), max(all_py)
            for tx, ty in tiles_for_bbox(px_min, px_max, py_min, py_max, z):
                tile_polys.setdefault((tx, ty), []).append(rings_px)

    tile_lights = {}
    if include_lights:
        zoom_scale = (1 << z) / (1 << REFERENCE_ZOOM)
        for lng, lat, ref_core_r, ref_halo_r, peak in lights:
            core_r = max(ref_core_r * zoom_scale, 0.15)
            halo_r = max(ref_halo_r * zoom_scale, 0.3)
            for shift in SHIFTS:
                wx = world_px_x(lng + shift, z)
                wy = world_px_y(lat, z)
                for tx, ty in tiles_for_bbox(wx - halo_r, wx + halo_r, wy - halo_r, wy + halo_r, z, buffer_px=0):
                    tile_lights.setdefault((tx, ty), []).append((wx, wy, core_r, halo_r, peak))

    # Every coordinate in the valid grid, not just ones with land/lights -
    # a skipped "pure ocean" tile leaves a visible seam where its flat
    # OCEAN_COLOR neighbour meets the CSS radial-gradient fallback showing
    # through the gap (the two are deliberately different tones at most
    # positions, so any boundary between them shows as a hard edge). A
    # real, tiny, flat-color ocean tile decodes just as fast as any other
    # small tile, so generating them uniformly costs nothing meaningful.
    all_tile_keys = [(tx, ty) for tx in range(n) for ty in range(n)]
    os.makedirs(f"{out_dir}/{z}", exist_ok=True)

    for tx, ty in all_tile_keys:
        ox, oy = tx * TILE_SIZE, ty * TILE_SIZE
        img = Image.new("RGB", (TILE_SIZE, TILE_SIZE), OCEAN_COLOR)
        draw = ImageDraw.Draw(img)
        for rings_px in tile_polys.get((tx, ty), []):
            exterior = [(x - ox, y - oy) for x, y in rings_px[0]]
            draw.polygon(exterior, fill=LANDMASS_FILL_COLOR)
            for hole in rings_px[1:]:
                hole_local = [(x - ox, y - oy) for x, y in hole]
                draw.polygon(hole_local, fill=OCEAN_COLOR)

        if (tx, ty) in tile_lights:
            arr = np.asarray(img, dtype=np.float32)
            glow = np.zeros((TILE_SIZE, TILE_SIZE), dtype=np.float32)
            for wx, wy, core_r, halo_r, peak in tile_lights[(tx, ty)]:
                lx, ly = wx - ox, wy - oy
                x0, x1 = max(0, int(lx - halo_r)), min(TILE_SIZE, int(lx + halo_r) + 1)
                y0, y1 = max(0, int(ly - halo_r)), min(TILE_SIZE, int(ly + halo_r) + 1)
                if x0 >= x1 or y0 >= y1:
                    continue
                ys, xs = np.mgrid[y0:y1, x0:x1]
                dist = np.sqrt((xs - lx) ** 2 + (ys - ly) ** 2)
                glow_alpha = np.clip(1.0 - dist / halo_r, 0.0, 1.0) ** 2 * (peak * 0.4)
                core_alpha = np.clip(1.0 - dist / core_r, 0.0, 1.0) ** 1.5 * peak
                glow[y0:y1, x0:x1] += glow_alpha + core_alpha
            vis = np.clip(1.0 - np.exp(-glow * 0.9), 0.0, 1.0)[:, :, None]
            out_arr = arr * (1.0 - vis) + LIGHT_COLOR[None, None, :] * vis
            img = Image.fromarray(np.clip(out_arr, 0, 255).astype(np.uint8), "RGB")

        img.save(f"{out_dir}/{z}/{tx}_{ty}.webp", "WEBP", quality=95, method=6)

    return len(all_tile_keys)


def main():
    t0 = time.time()
    features = load_features()
    lights = load_lights()
    print(f"loaded {len(features)} polygon parts, {len(lights)} lights in {time.time()-t0:.1f}s")

    for z in range(0, LIT_MAX_ZOOM + 1):
        t0 = time.time()
        n = generate_zoom_level(features, lights, z, f"{OUT_ROOT}/lit", include_lights=True)
        print(f"lit z={z}: {n} tiles in {time.time()-t0:.1f}s")

    for z in range(0, NOLIGHTS_MAX_ZOOM + 1):
        t0 = time.time()
        n = generate_zoom_level(features, lights, z, f"{OUT_ROOT}/no-lights", include_lights=False)
        print(f"no-lights z={z}: {n} tiles in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
