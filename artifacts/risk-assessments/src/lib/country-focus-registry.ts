// Operational Country Focus Registry (Index 3.2) - extends the Operational
// Country Registry with the data every future country transition (click
// focus, search, deep links) will read from: a Focus Point, a Camera
// Target, and a Default Focus Scale per country. This module only stores
// data - it renders nothing, animates nothing, and moves no camera. Every
// value below is computed once at module load, not per frame.
import { COUNTRY_REGISTRY } from "./country-registry";
import type { CountryDefinition } from "./country-registry";

export type FocusPoint = { x: number; y: number };
export type CameraTarget = { x: number; y: number };

export type CountryFocusDefinition = CountryDefinition & {
  focusPoint: FocusPoint;
  cameraTarget: CameraTarget;
  defaultFocusScale: number;
};

// Every country currently finishes its Country Focus animation at the
// Operational Canvas's centre (Index 3.1) - there is no per-country
// camera-target behaviour built yet, so this is the same sensible default
// for every country, not a placeholder pretending otherwise.
const OPERATIONAL_CANVAS_CENTER: CameraTarget = { x: 500, y: 500 };

// Country Focus Normalisation Engine (Index 3.3): every country - large or
// small - targets the same visual footprint on the Operational Canvas, so
// Russia does not dwarf Syria once both are focused. Scale is derived
// uniformly from a bounding box (never hardcoded per country) by finding
// its largest dimension - width or height - and scaling that dimension to
// the target canvas fraction. Since both axes share the same target
// fraction in this square 1000x1000 space, the larger of the two is
// always the binding constraint, which is what keeps the scale-up uniform
// (no distortion) - the same single multiplier is applied to both axes.
// Clamped so the formula can't blow up a sliver country or shrink a huge
// one to nothing.
//
// Scaling Engine refinement (Index 3.4B): the upper clamp must sit above
// the largest raw scale any real country needs to reach the 45% target,
// otherwise every country past that size gets capped at the same
// ceiling and reads as visually smaller than the 45% target implies -
// exactly what made Russia/USA/Australia/Brazil (whose raw scale need is
// low) look inconsistent next to South Africa/Japan/UK/Syria (whose raw
// scale need was above the old 9.0 ceiling and so got flattened to it).
// The highest raw requirement across every ordinary country's own
// largest-ring geometry tops out in the mid-20s (Syria, ~24.6x); only
// degenerate micro-territories simplified down to a handful of pixels
// (e.g. Nauru, Monaco) demand scales in the hundreds or thousands, which
// is not a "sensible limit" to chase - clamping those is correct
// behaviour, not a bug. 26 sits just above every ordinary country's
// requirement while still capping the degenerate cases.
const OPERATIONAL_CANVAS_SIZE = 1000; // the shared 1000x1000 alignment-engine space
const TARGET_DIMENSION_FRACTION = 0.45;
const FOCUS_SCALE_MIN = 0.85;
const FOCUS_SCALE_MAX = 26.0;

function computeDefaultFocusScale(boundingBox: CountryDefinition["boundingBox"]): number {
  const countryWidth = boundingBox.maxX - boundingBox.minX;
  const countryHeight = boundingBox.maxY - boundingBox.minY;
  const largestDimension = Math.max(countryWidth, countryHeight);
  if (largestDimension <= 0) return FOCUS_SCALE_MAX;
  const targetDimension = OPERATIONAL_CANVAS_SIZE * TARGET_DIMENSION_FRACTION;
  const scale = targetDimension / largestDimension;
  return Math.min(FOCUS_SCALE_MAX, Math.max(FOCUS_SCALE_MIN, scale));
}

// Index 3.4A bug fix: focusPoint/defaultFocusScale used to come from either
// a small hand-reviewed override list (Index 3.2, six countries only) or a
// generic fallback using the country's OVERALL registry bounding box for
// everyone else. Netherlands was in that fallback group - its stored
// bounding box is stretched from mainland Europe all the way to the
// Caribbean Netherlands (Bonaire, Sint Eustatius, Saba - special
// municipalities that are part of the Netherlands proper under ISO 3166,
// not the separate countries Aruba/Curacao/Sint Maarten), the exact same
// class of bug the USA override was hand-patched for (Index 3.2/3.2A -
// Aleutian islands stretching the USA's bounding box to the antimeridian
// seam). A hand-picked override list only patches whichever countries
// happen to get noticed; the geometry itself already tells us which ring
// is the "real" one for any country, without needing a curated list at
// all: whichever ring encloses the largest area IS the mainland. Every
// country - not just a reviewed few - now gets its focusPoint (that ring's
// own polygon centroid) and the bounding box used for scale calculation
// (that ring's own local bounding box, not the whole multi-territory
// bounding box) derived the same way, generically, from its own SVG path.
// No hardcoded values for any single country remain.
type Point = { x: number; y: number };

function parseRings(svgPath: string): Point[][] {
  const ringStrings = svgPath.match(/M[^M]*Z/g) ?? [];
  const rings: Point[][] = [];
  for (const ringString of ringStrings) {
    const numberPairs = ringString.match(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) ?? [];
    const ring = numberPairs.map((pair) => {
      const [x, y] = pair.split(/\s+/).map(Number);
      return { x, y };
    });
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

// Shoelace formula: signed area (magnitude used) and area-weighted
// centroid of a closed polygon ring, in the same 1000x1000 units as the
// registry's own svgPath data.
function ringAreaAndCentroid(ring: Point[]): { area: number; centroid: Point } | null {
  let signedArea2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[i];
    const p1 = ring[(i + 1) % ring.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    signedArea2 += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  if (Math.abs(signedArea2) < 1e-9) return null;
  return {
    area: Math.abs(signedArea2) / 2,
    centroid: { x: cx / (3 * signedArea2), y: cy / (3 * signedArea2) },
  };
}

type RingSummary = { area: number; centroid: Point; boundingBox: CountryDefinition["boundingBox"] };

function ringBoundingBox(ring: Point[]): CountryDefinition["boundingBox"] {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function summarizeRings(svgPath: string): RingSummary[] {
  const summaries: RingSummary[] = [];
  for (const ring of parseRings(svgPath)) {
    const result = ringAreaAndCentroid(ring);
    if (!result) continue;
    summaries.push({ area: result.area, centroid: result.centroid, boundingBox: ringBoundingBox(ring) });
  }
  return summaries;
}

// Index 3.4I bug fix: defaultFocusScale was derived purely from the
// largest ring's own bounding box (Index 3.4A) - correct for choosing a
// sensible zoom level, but it never checked whether OTHER real, sizeable
// territory (e.g. USA's Alaska - a real landmass, not a data artifact)
// stays inside the visible viewport once that scale and centring are
// applied. Alaska sits far enough from the mainland's own centroid that
// a tight mainland-only zoom pushed it off-screen entirely on wide
// viewports (reported directly: "US mainland showing... Alaska is cut
// off").
//
// Index 3.8 bug fix: the Index 3.4I comment above assumed only the
// VERTICAL extent ever gets cropped, because the Operational Canvas's own
// world-view viewBox ("xMidYMid slice") scales to cover width first on a
// landscape viewport, so the full 0-1000 horizontal range is always shown
// with zero crop. That is true for the passive world-view scaling - but
// the Country Focus transform applies its OWN additional translate+scale
// on top of it, centred on the focus point. Because the pre-focus local
// space already fills the viewport edge-to-edge horizontally with zero
// spare margin (unlike vertically, where the slice crop already hides a
// large band of the local space even at rest), any horizontal excursion
// introduced by that focus-scale transform can push real territory off
// the left/right edges just as easily as off the top/bottom - confirmed
// directly: Canada's high-Arctic islands and New Zealand's North Island
// were both measured rendering partly off-screen (mostly above the top
// edge) even though a "significant ring" existed and the old vertical-only
// constraint had already reduced the scale - the constant it reduced
// scale TO was itself too large. FOCUS_SAFE_VERTICAL_HALF_EXTENT=300 was
// picked without converting through the world-view viewBox's own scale
// factor (viewportWidth/1000, e.g. 1.6x at a 1600px-wide viewport): 300
// local units at that scale is 480 screen px, already past the 450px
// half-height of a 900px-tall viewport before the focus scale is even
// multiplied in. 250 keeps the same margin's intent while actually
// staying under a common wide (~16:9) viewport's real half-height. The
// horizontal counterpart uses the same reasoning against the viewport's
// own half-WIDTH, which is why its safe extent (450) is close to, but
// deliberately under, the theoretical max of 500 (half of the always-
// fully-visible 1000-unit local width) - it needs a margin of its own for
// the same reason 250 undercuts 300.
//
// "Significant" still means at least a meaningful fraction of the largest
// ring's own area, so a real second territory (Alaska) counts but a
// peripheral sliver a few pixels wide does not - otherwise a single
// far-flung sliver would crush the zoom for every country that has one
// (confirmed: applying this per-axis check to every non-degenerate ring
// regardless of size, instead of only "significant" ones, shrinks the USA
// down to the minimum clamp just to keep the westernmost Aleutian speck
// on-screen - the opposite of "large enough to inspect"). Nearby secondary
// islands (Hokkaido next to Honshu, the Isle of Wight next to Great
// Britain) still never trigger either check - only genuinely distant,
// substantial territory does. This only ever REDUCES the candidate scale
// (never increases it), and runs generically for all 235 countries, not
// as a per-country override.
const FOCUS_SIGNIFICANT_RING_AREA_FRACTION = 0.05;
const FOCUS_SAFE_VERTICAL_HALF_EXTENT = 250;
const FOCUS_SAFE_HORIZONTAL_HALF_EXTENT = 450;

function constrainScaleForVisibility(rings: RingSummary[], focusPoint: Point, candidateScale: number): number {
  if (rings.length === 0) return candidateScale;
  const largestArea = Math.max(...rings.map((ring) => ring.area));
  if (largestArea <= 0) return candidateScale;
  let maxVerticalOffset = 0;
  let maxHorizontalOffset = 0;
  for (const ring of rings) {
    if (ring.area >= largestArea) continue; // the largest ring's own spread is not re-checked here
    if (ring.area < largestArea * FOCUS_SIGNIFICANT_RING_AREA_FRACTION) continue;
    const { minX, minY, maxX, maxY } = ring.boundingBox;
    maxVerticalOffset = Math.max(maxVerticalOffset, Math.abs(minY - focusPoint.y), Math.abs(maxY - focusPoint.y));
    maxHorizontalOffset = Math.max(maxHorizontalOffset, Math.abs(minX - focusPoint.x), Math.abs(maxX - focusPoint.x));
  }
  let visibilityScale = candidateScale;
  if (maxVerticalOffset > 0) {
    visibilityScale = Math.min(visibilityScale, FOCUS_SAFE_VERTICAL_HALF_EXTENT / maxVerticalOffset);
  }
  if (maxHorizontalOffset > 0) {
    visibilityScale = Math.min(visibilityScale, FOCUS_SAFE_HORIZONTAL_HALF_EXTENT / maxHorizontalOffset);
  }
  return visibilityScale;
}

function buildFocusDefinition(country: CountryDefinition): CountryFocusDefinition {
  const rings = summarizeRings(country.svgPath);
  const largestRing = rings.reduce<RingSummary | null>(
    (best, ring) => (!best || ring.area > best.area ? ring : best),
    null,
  );
  // Defensive fallback only, for the rare degenerate/near-zero-size
  // geometry (e.g. a micro-nation simplified to a single point) where no
  // ring encloses any measurable area - the overall stored bounding box
  // is the only data left to fall back to.
  const { minX, minY, maxX, maxY } = country.boundingBox;
  const focusPoint = largestRing?.centroid ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const scaleBoundingBox = largestRing?.boundingBox ?? country.boundingBox;

  const candidateScale = computeDefaultFocusScale(scaleBoundingBox);
  const visibilityConstrainedScale = constrainScaleForVisibility(rings, focusPoint, candidateScale);
  const defaultFocusScale = Math.min(FOCUS_SCALE_MAX, Math.max(FOCUS_SCALE_MIN, visibilityConstrainedScale));

  return {
    ...country,
    focusPoint,
    cameraTarget: OPERATIONAL_CANVAS_CENTER,
    defaultFocusScale,
  };
}

export const COUNTRY_FOCUS_REGISTRY: CountryFocusDefinition[] = COUNTRY_REGISTRY.map(buildFocusDefinition);

export function getCountryFocusDefinition(iso3: string): CountryFocusDefinition | undefined {
  return COUNTRY_FOCUS_REGISTRY.find((country) => country.iso3 === iso3);
}
