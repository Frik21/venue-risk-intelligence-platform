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
# tried first, but left a visible seam wherever a real ocean tile met the
# CSS radial-gradient fallback (index.css) showing through the gap; the
# two are only equal at one specific position. A tiny tile decodes just
# as fast as any other, so there's no perf reason to skip them.
#
# Index 1.4: land colour and the ocean's brightness gradient are measured
# directly off the pre-1.3 source image (git history, commit 4ecafb6),
# not invented - see LANDMASS_FILL_COLOR and the _GRADIENT_STOPS table
# below for the extraction method and real sampled values. The 1.3 tile
# rewrite was scoped to fixing decode/request cost, not to changing this
# established palette; flat-filling the ocean during that work lost the
# real photographic falloff the source image had baked in.
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
# Measured directly off the pre-1.3 source image (git history, commit
# 4ecafb6) rather than guessed: sampled real pixels at known lat/lng
# across every continent for land, and across the open ocean at varying
# distance from the image's own bright-centre gradient for ocean (Index
# 1.4 - see generate_ocean_gradient_rgb below for the ocean curve).
LANDMASS_FILL_COLOR = (0x00, 0x0E, 0x1A)
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


# Ocean brightness gradient (Index 1.4): the pre-1.3 source image had a
# real photographic falloff baked into its ocean - brightest near the
# image's own centre (50%/42% of its own bounds, the same reference point
# index.css's own fallback gradient already uses), darkening outward -
# not a flat colour. Flat-filling ocean lost this look entirely once the
# image was replaced by tiles. These stops are not invented: they're a
# binned average of real ocean-only pixels (land excluded via the actual
# country-borders mask) from that source image, at increasing normalized
# elliptical distance from its centre. Distance is normalized the same
# way regardless of zoom/tile (a fraction of the world's own half-span),
# so this same curve applies unchanged at any resolution.
GRADIENT_CENTER_LNG = 11.1
GRADIENT_CENTER_LAT = 27.65861979122676

_GRADIENT_STOPS = [
    (0.064, (8.5, 32.6, 53.8)),
    (0.128, (9.6, 32.5, 52.7)),
    (0.191, (5.7, 28.3, 50.1)),
    (0.255, (1.6, 23.7, 48.3)),
    (0.319, (0.3, 21.6, 46.6)),
    (0.383, (0.9, 20.8, 44.2)),
    (0.446, (0.6, 19.4, 42.4)),
    (0.510, (0.7, 18.5, 40.6)),
    (0.574, (1.0, 18.2, 38.9)),
    (0.638, (1.1, 17.0, 37.9)),
    (0.702, (0.5, 15.4, 36.1)),
    (0.765, (0.2, 13.9, 33.4)),
    (0.829, (0.0, 11.8, 31.6)),
    (0.893, (0.0, 10.6, 29.8)),
    (0.957, (0.0, 9.5, 28.2)),
    (1.021, (0.0, 8.4, 27.3)),
    (1.084, (0.0, 7.9, 25.5)),
    (1.148, (0.0, 7.0, 22.8)),
    (1.212, (0.0, 5.9, 21.0)),
    (1.276, (0.0, 4.7, 19.2)),
    (1.339, (0.0, 3.5, 18.0)),
    (1.403, (0.0, 1.8, 16.6)),
    (1.467, (0.0, 0.3, 14.9)),
    (1.531, (0.0, 0.0, 12.8)),
]
_GRADIENT_DISTS = np.array([d for d, _ in _GRADIENT_STOPS])
_GRADIENT_R = np.array([c[0] for _, c in _GRADIENT_STOPS])
_GRADIENT_G = np.array([c[1] for _, c in _GRADIENT_STOPS])
_GRADIENT_B = np.array([c[2] for _, c in _GRADIENT_STOPS])


def ocean_background_for_tile(tx, ty, z):
    """RGB array (TILE_SIZE, TILE_SIZE, 3) uint8 - the ocean's own
    position-based brightness gradient for this tile's exact world
    pixels, before any land or lights are composited on top."""
    n_px = TILE_SIZE * (1 << z)
    py, px = np.mgrid[ty * TILE_SIZE : (ty + 1) * TILE_SIZE, tx * TILE_SIZE : (tx + 1) * TILE_SIZE]
    lng = px / n_px * 360 - 180
    yfrac = py / n_px
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * yfrac))))

    center_yfrac = mercator_y_fraction(GRADIENT_CENTER_LAT)
    # Wrap the longitude difference to the shortest angular distance
    # (-180, 180] rather than using it raw - lng=180 and lng=-180 are the
    # same physical meridian, but a raw difference treats them as ~360deg
    # apart, so the gradient's distance-from-centre (and therefore its
    # colour) jumped discontinuously right at the antimeridian, visible
    # as a hard vertical seam every time the tile grid wraps for a wide
    # viewport. Wrapping first makes both sides of the seam compute the
    # same distance, and therefore the same colour.
    lng_diff = ((lng - GRADIENT_CENTER_LNG + 180) % 360) - 180
    dx = lng_diff / 180.0
    dy = (yfrac - center_yfrac) / 0.5
    dist = np.sqrt(dx**2 + dy**2)

    r = np.interp(dist, _GRADIENT_DISTS, _GRADIENT_R, left=_GRADIENT_R[0], right=_GRADIENT_R[-1])
    g = np.interp(dist, _GRADIENT_DISTS, _GRADIENT_G, left=_GRADIENT_G[0], right=_GRADIENT_G[-1])
    b = np.interp(dist, _GRADIENT_DISTS, _GRADIENT_B, left=_GRADIENT_B[0], right=_GRADIENT_B[-1])
    return np.clip(np.stack([r, g, b], axis=-1), 0, 255).astype(np.uint8)


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

        # Land is a flat mask composited over the ocean's own position-based
        # gradient background (Index 1.4), not drawn straight onto a flat
        # ocean fill - a hole (e.g. a lake) needs the gradient to continue
        # underneath it exactly as open ocean would, not a separate flat
        # tone, so it can't be painted directly like a flat-ocean fill could.
        land_mask = Image.new("L", (TILE_SIZE, TILE_SIZE), 0)
        mask_draw = ImageDraw.Draw(land_mask)
        for rings_px in tile_polys.get((tx, ty), []):
            exterior = [(x - ox, y - oy) for x, y in rings_px[0]]
            mask_draw.polygon(exterior, fill=255)
            for hole in rings_px[1:]:
                hole_local = [(x - ox, y - oy) for x, y in hole]
                mask_draw.polygon(hole_local, fill=0)

        background = ocean_background_for_tile(tx, ty, z)
        is_land = (np.asarray(land_mask) > 127)[:, :, None]
        arr = np.where(is_land, np.array(LANDMASS_FILL_COLOR, dtype=np.uint8), background)
        img = Image.fromarray(arr, "RGB")

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


def generate_ocean_gradient_zoom_level(z, out_dir):
    """Pure ocean-gradient tiles, no land or lights - a bottom layer that
    fills any extra width a wide viewport needs beyond one real world-copy.
    The lit/no-lights layers on top set noWrap=true so they never repeat
    (Index 1.5: repeating them duplicated real landmass/lights, which
    looked wrong even though the gradient itself no longer seams at the
    antimeridian) - this layer is deliberately allowed to keep wrapping
    normally, since a repeated gradient with no real content is
    indistinguishable from a single copy at every point."""
    n = 1 << z
    os.makedirs(f"{out_dir}/{z}", exist_ok=True)
    for tx in range(n):
        for ty in range(n):
            img = Image.fromarray(ocean_background_for_tile(tx, ty, z), "RGB")
            img.save(f"{out_dir}/{z}/{tx}_{ty}.webp", "WEBP", quality=95, method=6)
    return n * n


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

    # Only the default (lit) view's own zoom range ever needs extra width
    # beyond one world-copy - once zoomed into a country the viewport is
    # always far narrower than a single world-width, so no gap can appear.
    for z in range(0, LIT_MAX_ZOOM + 1):
        t0 = time.time()
        n = generate_ocean_gradient_zoom_level(z, f"{OUT_ROOT}/ocean-gradient")
        print(f"ocean-gradient z={z}: {n} tiles in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
