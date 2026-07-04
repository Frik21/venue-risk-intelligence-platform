# One-time offline generator for night-map-edge-fade-{west,east}.png - not
# part of the app build or runtime, only re-run by hand if earth-at-night.png
# itself is ever regenerated. Requires Pillow (`pip install Pillow`); run
# from this directory (`python3 generate-night-map-edge-fades.py`).
#
# Produces a narrow vertical strip for each edge of earth-at-night.png,
# anchored pixel-exact to that edge's own real column for its innermost 3px,
# then a heavily vertically-smoothed (darkest-of-150px-window - ocean is
# always the darkest content here, so this can't pick up a coastline or
# city-light streak) version of that same column, fading out to the same
# dark ocean tone the CSS gradient fallback in index.css already uses
# (#020b18). NightMapLayer (dashboard.tsx) stretches these via Leaflet's
# ImageOverlay bounds to cover whatever extra reach the current viewport's
# aspect ratio needs beyond the main image's own 360deg width, instead of
# tiling a second full copy of the image (which would duplicate real
# geography at the opposite edge).
from PIL import Image

SRC = "earth-at-night.png"
OUT_DIR = "."

src = Image.open(SRC).convert("RGB")
W, H = src.size
spx = src.load()

DARK_BASE = (0x02, 0x0b, 0x18)
FADE_W = 60
ANCHOR_PX = 3
SMOOTH_WINDOW = 150


def darkest_smoothed_column(x, window=SMOOTH_WINDOW):
    col = [spx[x, y] for y in range(H)]
    half = window // 2
    result = []
    for y in range(H):
        lo, hi = max(0, y - half), min(H, y + half + 1)
        result.append(min(col[lo:hi], key=lambda c: sum(c)))
    return result


def raw_column(x):
    return [spx[x, y] for y in range(H)]


def build_fade(source_edge_x: int, anchor_on_right: bool, out_path: str):
    raw_col = raw_column(source_edge_x)
    smooth_col = darkest_smoothed_column(source_edge_x)

    img = Image.new("RGB", (FADE_W, H))
    px = img.load()
    for y in range(H):
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
    img.save(out_path)


# West fade: sits further west than the main image's own west edge (x=0 in
# source, lng -168.9). Anchor (real edge pixel) touches the main image's
# west edge -> anchor on the RIGHT of this fade image, fading to dark
# ocean on the left (outermost, furthest from any real geography).
build_fade(source_edge_x=0, anchor_on_right=True, out_path=f"{OUT_DIR}/night-map-edge-fade-west.png")

# East fade: sits further east than the main image's own east edge
# (x=W-1 in source, lng 191.1). Anchor on the LEFT (touching the main
# image's east edge), fading to dark ocean on the right (outermost).
build_fade(source_edge_x=W - 1, anchor_on_right=False, out_path=f"{OUT_DIR}/night-map-edge-fade-east.png")

print("done", W, H)
