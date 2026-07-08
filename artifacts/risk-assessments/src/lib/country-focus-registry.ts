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
const OPERATIONAL_CANVAS_SIZE = 1000; // the shared 1000x1000 alignment-engine space
const TARGET_DIMENSION_FRACTION = 0.45;
const FOCUS_SCALE_MIN = 0.85;
const FOCUS_SCALE_MAX = 9.0;

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

function largestRingCentroidAndBounds(
  svgPath: string,
): { centroid: Point; boundingBox: CountryDefinition["boundingBox"] } | null {
  let best: { area: number; centroid: Point; boundingBox: CountryDefinition["boundingBox"] } | null = null;
  for (const ring of parseRings(svgPath)) {
    const result = ringAreaAndCentroid(ring);
    if (!result) continue;
    if (best && result.area <= best.area) continue;
    const xs = ring.map((p) => p.x);
    const ys = ring.map((p) => p.y);
    best = {
      area: result.area,
      centroid: result.centroid,
      boundingBox: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    };
  }
  return best;
}

function buildFocusDefinition(country: CountryDefinition): CountryFocusDefinition {
  const largestRing = largestRingCentroidAndBounds(country.svgPath);
  // Defensive fallback only, for the rare degenerate/near-zero-size
  // geometry (e.g. a micro-nation simplified to a single point) where no
  // ring encloses any measurable area - the overall stored bounding box
  // is the only data left to fall back to.
  const { minX, minY, maxX, maxY } = country.boundingBox;
  const focusPoint = largestRing?.centroid ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const scaleBoundingBox = largestRing?.boundingBox ?? country.boundingBox;
  return {
    ...country,
    focusPoint,
    cameraTarget: OPERATIONAL_CANVAS_CENTER,
    defaultFocusScale: computeDefaultFocusScale(scaleBoundingBox),
  };
}

export const COUNTRY_FOCUS_REGISTRY: CountryFocusDefinition[] = COUNTRY_REGISTRY.map(buildFocusDefinition);

export function getCountryFocusDefinition(iso3: string): CountryFocusDefinition | undefined {
  return COUNTRY_FOCUS_REGISTRY.find((country) => country.iso3 === iso3);
}
