# One-time offline generator for earth-at-night-no-lights.png - not part
# of the app build or runtime, only re-run by hand if earth-at-night.png
# itself is ever regenerated. Requires Pillow and NumPy
# (`pip install Pillow numpy`); run from this directory
# (`python3 generate-night-map-no-lights.py`).
#
# Removes the amber city-light glow from earth-at-night.png while
# preserving landmass/ocean/coastline texture, for use while zoomed into
# a country (Index 1.3) - unlike hiding the whole image, this keeps
# geographic context visible behind the outline.
#
# There's no clean brightness threshold that separates "faint glow
# falloff" from "unlit landmass texture" - sampling the real image shows
# a continuous gradient from full-brightness city cores down through the
# same low-brightness range unlit land already occupies. Instead this
# detects glow adaptively, relative to each pixel's own local
# surroundings: a "background" estimate is built by taking the true
# darkest actual pixel (not independent per-channel minimums, which can
# synthesize a hue that never existed in the real image) within a large
# neighbourhood of every point, so any real, present-day glow reads as
# "brighter than its own local floor" regardless of the glow's absolute
# brightness. The neighbourhood must be large enough that even the
# densest real city clusters (e.g. the Netherlands/Ruhr valley) still
# contain a truly dark sample within it - a smaller radius leaves
# visible residual glow in exactly those spots. The minimum is computed
# on a heavily downscaled copy (for both speed and to make the effective
# window large) then smoothed and upscaled back; a sliding-window
# minimum (not a block-partitioned one) is required to avoid tie-
# breaking bias on smooth gradients (e.g. open ocean), which otherwise
# shows up as visible vertical banding.
from PIL import Image, ImageFilter
import numpy as np

SRC = "earth-at-night.png"
OUT = "earth-at-night-no-lights.png"

DOWNSCALE = 32
MIN_FILTER_SIZE = 9
BACKGROUND_BLUR_RADIUS = 3
MASK_SENSITIVITY = 12.0  # lower = more aggressive glow removal
MASK_BLUR_RADIUS = 2

img = Image.open(SRC).convert("RGB")
w, h = img.size
arr = np.array(img).astype(np.float32)

small = img.resize((w // DOWNSCALE, h // DOWNSCALE), Image.BOX)
small_min = small.filter(ImageFilter.MinFilter(size=MIN_FILTER_SIZE))
small_min = small_min.filter(ImageFilter.GaussianBlur(radius=BACKGROUND_BLUR_RADIUS))
background = small_min.resize((w, h), Image.BICUBIC)
bg_arr = np.array(background).astype(np.float32)

brightness = arr.sum(axis=2)
bg_brightness = bg_arr.sum(axis=2)
excess = np.clip(brightness - bg_brightness, 0, None)

mask = np.clip(excess / MASK_SENSITIVITY, 0, 1)
mask_img = Image.fromarray((mask * 255).astype(np.uint8))
mask_blurred = mask_img.filter(ImageFilter.GaussianBlur(radius=MASK_BLUR_RADIUS))
alpha = (np.array(mask_blurred).astype(np.float32) / 255.0)[:, :, None]

result = (arr * (1 - alpha) + bg_arr * alpha).astype(np.uint8)
Image.fromarray(result, "RGB").save(OUT)
print("done, mean alpha (fraction of image blended toward background):", alpha.mean())
