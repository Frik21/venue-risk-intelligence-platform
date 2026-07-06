# One-time offline generator for night-map-edge-fade-{west,east}.webp - not
# part of the app build or runtime, only re-run by hand if the lit tile set
# itself is ever regenerated (see generate-night-map-tiles.py). Requires
# Pillow and NumPy (`pip install Pillow numpy`); run from this directory
# (`python3 generate-night-map-edge-fades.py`) after the tiles/ directory
# already exists.
#
# Index 1.6: noWrap (Index 1.5) stops the lit/no-lights tile layers from
# repeating, which correctly stops landmass/city-lights duplicating on a
# wide viewport - but it also means the map's own real edges (Alaska on
# the west, Russia's Far East on the other, since the tile grid's seam
# sits there) are directly exposed against the ocean-gradient CSS
# fallback with no coastline continuation, reading as land abruptly cut
# off rather than trailing into open ocean. These two images are a
# narrow vertical strip for each edge, built from a heavily
# vertically-smoothed (darkest-of-window - ocean is always the darkest
# content here, so this can't pick up a coastline or city-light streak)
# version of that edge's own real column (stitched from the lit tile
# set's own x=0 and x=n-1 tile columns at zoom 4), fading out to the
# ocean gradient's own darkest measured tone (Index 1.4). NightMapLayer
# (dashboard.tsx) stretches these via Leaflet's ImageOverlay bounds to
# cover whatever extra reach the current viewport's aspect ratio needs
# beyond the map's own 360deg width - lit-only, since the no-lights
# (country-zoom) state is never shown at a zoom wide enough to need this.
#
# Index 1.7: an earlier version held the real (unsmoothed) tile-edge
# pixels exactly for the innermost 3px, for a perfect colour match right
# at the seam. That raw sliver carries whatever's really at that column -
# here, a real hint of Alaska/Chukotka coastline and city lights, right
# where the tile grid's edge happens to sit - and once stretched across a
# wide viewport's worth of screen space, that thin real detail read as a
# chunk of land duplicated in open ocean (visible on both the west and
# east fades at once, since they're anchored to opposite sides of the
# same real-world seam - Alaska and Chukotka are right across the
# dateline from each other). The smoothed column is already derived from
# that same source column, so starting the fade immediately from that
# instead keeps the seam colour close without any raw coastline/light
# detail able to leak through and get magnified.
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

TILES_DIR = "tiles/lit/4"
OUT_DIR = "."

TILE_SIZE = 512
N = 16  # tiles per axis at zoom 4 (LIT_MAX_ZOOM)

DARK_BASE = (0x00, 0x00, 0x0D)  # the ocean gradient's own darkest measured stop (Index 1.4)
FADE_W = 96
SMOOTH_WINDOW = round(150 * (TILE_SIZE * N) / 2048)
# Deliberately much smaller than any real on-screen display height (which
# ranges from a few hundred px to a couple thousand). This asset has no
# fine detail to lose - it's a smooth fade to a flat dark tone - so there's
# no cost to shrinking it well past that point. What that buys: the
# browser almost always scales this image UP at runtime rather than down.
# Upscaling interpolates between fewer samples, which blends dithering
# into a smooth result; downscaling area-averages, which is specifically
# what ordered dithering is designed to cancel back out to the plain
# (banded) rounded value - see the dithering comment in build_fade below,
# which found exactly that when this was still 2048.
OUT_HEIGHT = 512

# Same technique and reasoning as generate-night-map-tiles.py's _BAYER_8:
# the faded-out region changes brightness by only a handful of 8-bit
# levels over the whole image, so plain rounding produces flat bands with
# a visible 1-unit step between them. Ordered dithering breaks each step
# into a fine dot pattern instead, which reads as smooth.
_BAYER_8 = (
    np.array(
        [
            [0, 32, 8, 40, 2, 34, 10, 42],
            [48, 16, 56, 24, 50, 18, 58, 26],
            [12, 44, 4, 36, 14, 46, 6, 38],
            [60, 28, 52, 20, 62, 30, 54, 22],
            [3, 35, 11, 43, 1, 33, 9, 41],
            [51, 19, 59, 27, 49, 17, 57, 25],
            [15, 47, 7, 39, 13, 45, 5, 37],
            [63, 31, 55, 23, 61, 29, 53, 21],
        ],
        dtype=np.float64,
    )
    / 64.0
    - 0.5
)


def stitch_column(tx):
    strip = Image.new("RGB", (TILE_SIZE, TILE_SIZE * N))
    for ty in range(N):
        tile = Image.open(f"{TILES_DIR}/{tx}_{ty}.webp").convert("RGB")
        strip.paste(tile, (0, ty * TILE_SIZE))
    return strip


def darkest_smoothed_column(spx, x, height, window):
    col = [spx[x, y] for y in range(height)]
    half = window // 2
    # Pass 1: darkest-of-window - safe against ever showing brighter than
    # nearby real content (ocean is always the darkest content at this
    # column), but "min" is an order-statistic filter, not an averaging
    # one: it only changes value when the window's extremum shifts,
    # producing large flat plateaus with a sudden jump between them
    # instead of an actual gradual transition (visible as a blocky/grid
    # look once this column is stretched tall to cover a real viewport).
    darkest = []
    for y in range(height):
        lo, hi = max(0, y - half), min(height, y + half + 1)
        darkest.append(min(col[lo:hi], key=lambda c: sum(c)))
    # Pass 2: average that lower envelope over the same window so the
    # plateau edges become gradual ramps instead of instant steps - can't
    # brighten past nearby real darkest content since it only averages
    # values that already passed the min filter in pass 1.
    result = []
    for y in range(height):
        lo, hi = max(0, y - half), min(height, y + half + 1)
        window_vals = darkest[lo:hi]
        result.append(tuple(round(sum(c[k] for c in window_vals) / len(window_vals)) for k in range(3)))
    return result


def build_fade(strip, source_edge_x, anchor_on_right, out_path):
    height = strip.size[1]
    spx = strip.load()
    smooth_col = darkest_smoothed_column(spx, source_edge_x, height, SMOOTH_WINDOW)

    # Built at full resolution with plain, undithered continuous values -
    # dithering happens after the resize below (see that comment), not
    # here, so the noise survives to the actually-displayed resolution
    # instead of being smoothed back out by the resize's own filtering.
    #
    # No raw-pixel anchor: an earlier version held the real tile-edge
    # pixels exactly for the innermost few columns, for a perfect colour
    # match at the seam. But those raw pixels carry whatever's really at
    # that column - here, a real hint of Alaska/Chukotka coastline and
    # city lights, right where the tile grid's edge happens to sit. Once
    # stretched across a wide viewport's worth of screen space, that thin
    # real sliver reads as a chunk of land in open ocean - the same
    # problem Index 1.5/1.6 already fixed once for whole-tile duplication,
    # recurring at a smaller scale. Starting the smoothed/darkened blend
    # immediately at the seam instead (t=0 at dist 0, rather than holding
    # raw pixels for ANCHOR_PX columns first) avoids that: the smoothed
    # colour is already derived from this same column, so the seam colour
    # match stays close, with no real coastline/light detail able to leak
    # through and get magnified.
    arr = np.empty((height, FADE_W, 3), dtype=np.float64)
    for y in range(height):
        smooth_c = smooth_col[y]
        for cx in range(FADE_W):
            dist_from_anchor_side = (FADE_W - 1 - cx) if anchor_on_right else cx
            t = min(dist_from_anchor_side / FADE_W, 1.0)
            arr[y, cx] = [smooth_c[k] + (DARK_BASE[k] - smooth_c[k]) * t for k in range(3)]
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    # Downsample before saving: at full 8192px height this asset only ever
    # gets shown stretched down to roughly viewport-height on screen (a
    # few hundred to ~2000px), so the browser has to minify it by a large
    # factor (~8x) at runtime. Chromium's own runtime image scaling isn't a
    # true box/Lanczos filter at that ratio, and produces a visible blocky
    # look on this content - large flat, very dark, slowly-varying areas
    # where even a 1-unit rounding difference is a big relative jump. Doing
    # the downsample here with Pillow's own LANCZOS filter (a proper
    # multi-tap resample, unlike relying on the browser) fixes that.
    img = img.resize((FADE_W, OUT_HEIGHT), Image.LANCZOS)

    # Dither now, at final resolution, for the same reason as _BAYER_8's
    # own comment above: this gradient changes by only a few 8-bit levels
    # across the whole image, so plain rounding leaves a visible 1-unit
    # step at each level boundary.
    out = np.array(img).astype(np.float64)
    for cx in range(FADE_W):
        col_dither = _BAYER_8[np.arange(OUT_HEIGHT) % 8, cx % 8]
        out[:, cx] += col_dither[:, None]
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")

    img.save(out_path, "WEBP", lossless=True, method=6)
    print(f"saved {out_path}")


def main():
    west_strip = stitch_column(0)
    east_strip = stitch_column(N - 1)

    # West fade: sits further west than the map's own west edge (tile x=0,
    # world lng -180). The seam touches that edge on the RIGHT of this
    # fade image, fading to dark ocean on the left.
    build_fade(west_strip, source_edge_x=0, anchor_on_right=True, out_path=f"{OUT_DIR}/night-map-edge-fade-west.webp")

    # East fade: sits further east than the map's own east edge (tile
    # x=n-1, world lng +180). Seam on the LEFT, fading to dark ocean on
    # the right.
    build_fade(
        east_strip, source_edge_x=TILE_SIZE - 1, anchor_on_right=False, out_path=f"{OUT_DIR}/night-map-edge-fade-east.webp"
    )

    print("done", "height=", TILE_SIZE * N, "smooth window=", SMOOTH_WINDOW)


if __name__ == "__main__":
    main()
