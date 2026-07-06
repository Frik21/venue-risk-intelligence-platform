# One-time offline generator for night-map-edge-fade-{west,east}.webp - not
# part of the app build or runtime, only re-run by hand if the lit tile set
# itself is ever regenerated (see generate-night-map-tiles.py). Requires
# Pillow (`pip install Pillow`); run from this directory
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
# narrow vertical strip for each edge, anchored pixel-exact to that
# edge's own real column (stitched from the lit tile set's own x=0 and
# x=n-1 tile columns at zoom 4 - real map data, not an invented
# gradient) for its innermost 3px, then a heavily vertically-smoothed
# (darkest-of-window - ocean is always the darkest content here, so this
# can't pick up a coastline or city-light streak) version of that same
# column, fading out to the ocean gradient's own darkest measured tone
# (Index 1.4). NightMapLayer (dashboard.tsx) stretches these via
# Leaflet's ImageOverlay bounds to cover whatever extra reach the current
# viewport's aspect ratio needs beyond the map's own 360deg width -
# lit-only, since the no-lights (country-zoom) state is never shown at a
# zoom wide enough to need this.
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

TILES_DIR = "tiles/lit/4"
OUT_DIR = "."

TILE_SIZE = 512
N = 16  # tiles per axis at zoom 4 (LIT_MAX_ZOOM)

DARK_BASE = (0x00, 0x00, 0x0D)  # the ocean gradient's own darkest measured stop (Index 1.4)
FADE_W = 96
ANCHOR_PX = 3
SMOOTH_WINDOW = round(150 * (TILE_SIZE * N) / 2048)


def stitch_column(tx):
    strip = Image.new("RGB", (TILE_SIZE, TILE_SIZE * N))
    for ty in range(N):
        tile = Image.open(f"{TILES_DIR}/{tx}_{ty}.webp").convert("RGB")
        strip.paste(tile, (0, ty * TILE_SIZE))
    return strip


def darkest_smoothed_column(spx, x, height, window):
    col = [spx[x, y] for y in range(height)]
    half = window // 2
    result = []
    for y in range(height):
        lo, hi = max(0, y - half), min(height, y + half + 1)
        result.append(min(col[lo:hi], key=lambda c: sum(c)))
    return result


def build_fade(strip, source_edge_x, anchor_on_right, out_path):
    height = strip.size[1]
    spx = strip.load()
    raw_col = [spx[source_edge_x, y] for y in range(height)]
    smooth_col = darkest_smoothed_column(spx, source_edge_x, height, SMOOTH_WINDOW)

    img = Image.new("RGB", (FADE_W, height))
    px = img.load()
    for y in range(height):
        raw_c = raw_col[y]
        smooth_c = smooth_col[y]
        for cx in range(FADE_W):
            dist_from_anchor_side = (FADE_W - 1 - cx) if anchor_on_right else cx
            if dist_from_anchor_side < ANCHOR_PX:
                color = raw_c
            else:
                t = min((dist_from_anchor_side - ANCHOR_PX) / (FADE_W - ANCHOR_PX), 1.0)
                color = tuple(round(smooth_c[k] + (DARK_BASE[k] - smooth_c[k]) * t) for k in range(3))
            px[cx, y] = color
    img.save(out_path, "WEBP", quality=90, method=6)
    print(f"saved {out_path}")


def main():
    west_strip = stitch_column(0)
    east_strip = stitch_column(N - 1)

    # West fade: sits further west than the map's own west edge (tile x=0,
    # world lng -180). Anchor (real edge pixel) touches that edge -> anchor
    # on the RIGHT of this fade image, fading to dark ocean on the left.
    build_fade(west_strip, source_edge_x=0, anchor_on_right=True, out_path=f"{OUT_DIR}/night-map-edge-fade-west.webp")

    # East fade: sits further east than the map's own east edge (tile
    # x=n-1, world lng +180). Anchor on the LEFT, fading to dark ocean on
    # the right.
    build_fade(
        east_strip, source_edge_x=TILE_SIZE - 1, anchor_on_right=False, out_path=f"{OUT_DIR}/night-map-edge-fade-east.webp"
    )

    print("done", "height=", TILE_SIZE * N, "smooth window=", SMOOTH_WINDOW)


if __name__ == "__main__":
    main()
