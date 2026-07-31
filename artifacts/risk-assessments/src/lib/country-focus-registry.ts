// Operational Country Focus Registry (Index 3.2, rebuilt Index 3.8) -
// extends the Operational Country Registry with the data every country
// transition (click focus, search, deep links) reads from: a Focus
// Point, a Camera Target, and a Default Focus Scale per country. This
// module only stores data - it renders nothing, animates nothing, and
// moves no camera. Every value below is computed once at module load,
// not per frame.
import { COUNTRY_REGISTRY } from "./country-registry";
import type { CountryDefinition } from "./country-registry";

export type FocusPoint = { x: number; y: number };
export type CameraTarget = { x: number; y: number };
type BoundingBox = CountryDefinition["boundingBox"];

// Index 3.8 rebuild: every prior scaling model (Index 3.3's 45%-of-canvas
// target, Index 3.4I/3.8's per-ring "significant secondary territory"
// visibility constraints) was a heuristic layered on top of a single
// (focus point, scale) pair, and every one of those heuristics still let
// real territory render outside the visible viewport for some country
// (Canada, New Zealand, Indonesia, USA all reproduced broken). This
// rebuild replaces the heuristics with one immutable concept instead:
// the Operational Focus Block, a fixed rectangle in the same 1000x1000
// Operational Geometry space every other overlay already shares. Every
// focused country's COMPLETE geometry (its real registry bounding box -
// every ring, every territory, nothing dropped) is scaled uniformly and
// translated so it fits entirely inside this block. The block itself
// never moves or resizes to accommodate a country - countries adapt to
// the block, never the reverse.
const OPERATIONAL_FOCUS_BLOCK: BoundingBox = { minX: 250, minY: 100, maxX: 800, maxY: 400 };
const OPERATIONAL_FOCUS_BLOCK_WIDTH = OPERATIONAL_FOCUS_BLOCK.maxX - OPERATIONAL_FOCUS_BLOCK.minX; // 550
const OPERATIONAL_FOCUS_BLOCK_HEIGHT = OPERATIONAL_FOCUS_BLOCK.maxY - OPERATIONAL_FOCUS_BLOCK.minY; // 300

function boxCenter(box: BoundingBox): FocusPoint {
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

// One uniform multiplier for both axes (never two different ones - that
// would distort the country's real shape). Using the SMALLER of the two
// ratios is what guarantees the box's own larger dimension is the
// binding constraint, so the other dimension always finishes with room
// to spare rather than overflowing the block.
function scaleToFit(box: BoundingBox, targetWidth: number, targetHeight: number): number {
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  // Defensive fallback only, for the rare degenerate/near-zero-size
  // geometry (e.g. a micro-nation simplified to a single point) where
  // there is no real extent to scale against.
  if (width <= 0 || height <= 0) return Math.min(targetWidth, targetHeight);
  return Math.min(targetWidth / width, targetHeight / height);
}

// A focused country's rendered piece: its own geometry (an SVG path
// subset - the whole country for every ordinary country, one of three
// subsets for the USA's approved custom layout below), the point in
// that geometry which lands on the Camera Target, the Camera Target
// itself, and the uniform scale that fits it to its target area.
export type CountryFocusPiece = {
  id: string;
  geometry: string;
  focusPoint: FocusPoint;
  cameraTarget: CameraTarget;
  scale: number;
};

export type CountryFocusDefinition = CountryDefinition & {
  focusPoint: FocusPoint;
  cameraTarget: CameraTarget;
  defaultFocusScale: number;
  // Present only for the USA's approved custom Operational Layout below.
  // Every other country renders as a single piece built from its own
  // top-level focusPoint/cameraTarget/defaultFocusScale.
  pieces?: CountryFocusPiece[];
};

function buildGenericFocusDefinition(country: CountryDefinition): CountryFocusDefinition {
  // The registry's own boundingBox is already the union of every ring in
  // the country's geometry - mainland, every island, every territory -
  // so fitting it to the block is fitting the COMPLETE country, not a
  // largest-piece approximation of it.
  const focusPoint = boxCenter(country.boundingBox);
  const cameraTarget = boxCenter(OPERATIONAL_FOCUS_BLOCK);
  const defaultFocusScale = scaleToFit(country.boundingBox, OPERATIONAL_FOCUS_BLOCK_WIDTH, OPERATIONAL_FOCUS_BLOCK_HEIGHT);
  return { ...country, focusPoint, cameraTarget, defaultFocusScale };
}

// --- USA's approved custom Operational Layout (Index 3.8) -------------
// The ticket's only sanctioned exception to "no country-specific hacks":
// the mainland stays the dominant focus, filling the block exactly like
// any ordinary country would; Alaska and Hawaii - both real, both kept,
// neither distorted - are pulled out of that dominant fit and rendered
// as their own small insets so they no longer drag the whole country's
// scale down or get cut off, the two failure modes every previous model
// hit for the USA specifically. This only ever touches how the USA's
// own three focus pieces are computed here in the registry - it does
// not change the stored geometry, and does not run for any other
// country.
type RingPoint = { x: number; y: number };

function parsePathRings(svgPath: string): RingPoint[][] {
  const ringStrings = svgPath.match(/M[^M]*Z/g) ?? [];
  const rings: RingPoint[][] = [];
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

// Shoelace formula, centroid only (area isn't needed for classification
// here - every ring is bucketed by position, not by size, so nothing is
// ever dropped as "too small to matter").
function ringCentroid(ring: RingPoint[]): FocusPoint | null {
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
  return { x: cx / (3 * signedArea2), y: cy / (3 * signedArea2) };
}

function ringsToPath(rings: RingPoint[][]): string {
  let path = "";
  for (const ring of rings) {
    if (ring.length < 3) continue;
    path += `M ${ring[0].x} ${ring[0].y} `;
    for (let i = 1; i < ring.length; i++) {
      path += `L ${ring[i].x} ${ring[i].y} `;
    }
    path += "Z ";
  }
  return path.trim();
}

function pathBoundingBox(svgPath: string): BoundingBox {
  const numberPairs = svgPath.match(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pair of numberPairs) {
    const [x, y] = pair.split(/\s+/).map(Number);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

// Classification is purely geometric (ring centroid position in the same
// 1000x1000 Operational Geometry space every country's own registry
// path already lives in), derived directly from the USA's own stored
// coastline data - not a hand-picked island list. Alaska (mainland plus
// the full Aleutian chain, including the westernmost islands that wrap
// past the antimeridian to render near x=1000) sits north of and far
// from the CONUS mainland; Hawaii sits south and west of it. CONUS's own
// bounding box is y:341.9-427.8 / x:122.7-283.1, which is why 335/430/115
// cleanly separate the three groups with no overlap in this country's
// actual data.
function isUsaAlaskaRing(centroid: FocusPoint): boolean {
  return centroid.y < 335 && (centroid.x < 115 || centroid.x > 900);
}
function isUsaHawaiiRing(centroid: FocusPoint): boolean {
  return centroid.y > 430 && centroid.x < 115;
}

// Small inset boxes inside the Operational Focus Block, top-left for
// Alaska and bottom-left for Hawaii per the ticket. Positioned within
// Y:225-395 rather than using the block's own full Y:100-400 span:
// the Operational Canvas's existing, unmodified "xMidYMid slice"
// viewBox only ever shows the vertically-CENTRED band of the shared
// 1000x1000 Operational Geometry space (Index 2.2C) - on a typical
// landscape viewport that band does not reach all the way up to the
// block's own Y:100 top edge (confirmed directly: at 1600x900, only
// Y:218.75-781.25 is ever visible). That crop is outside this ticket's
// scope to change, so the insets are placed inside the portion of the
// block that's actually on screen, while still reading as top-left/
// bottom-left relative to each other and to the block's own left edge.
const USA_ALASKA_INSET_BOX: BoundingBox = { minX: 260, minY: 225, maxX: 400, maxY: 300 };
const USA_HAWAII_INSET_BOX: BoundingBox = { minX: 260, minY: 320, maxX: 400, maxY: 395 };

function buildUsaFocusPiece(id: string, rings: RingPoint[][], targetBox: BoundingBox): CountryFocusPiece {
  const geometry = ringsToPath(rings);
  const box = pathBoundingBox(geometry);
  return {
    id,
    geometry,
    focusPoint: boxCenter(box),
    cameraTarget: boxCenter(targetBox),
    scale: scaleToFit(box, targetBox.maxX - targetBox.minX, targetBox.maxY - targetBox.minY),
  };
}

function buildUsaFocusDefinition(country: CountryDefinition): CountryFocusDefinition {
  const rings = parsePathRings(country.svgPath);
  const alaskaRings: RingPoint[][] = [];
  const hawaiiRings: RingPoint[][] = [];
  const mainRings: RingPoint[][] = [];
  for (const ring of rings) {
    const centroid = ringCentroid(ring);
    if (centroid && isUsaAlaskaRing(centroid)) {
      alaskaRings.push(ring);
    } else if (centroid && isUsaHawaiiRing(centroid)) {
      hawaiiRings.push(ring);
    } else {
      // Every ring not classified as Alaska or Hawaii - CONUS mainland,
      // Puerto Rico, every other small real feature - stays together and
      // moves with the mainland's own dominant fit, exactly like an
      // ordinary country. Nothing is dropped.
      mainRings.push(ring);
    }
  }

  const mainPiece = buildUsaFocusPiece("main", mainRings, OPERATIONAL_FOCUS_BLOCK);
  const alaskaPiece = buildUsaFocusPiece("alaska", alaskaRings, USA_ALASKA_INSET_BOX);
  const hawaiiPiece = buildUsaFocusPiece("hawaii", hawaiiRings, USA_HAWAII_INSET_BOX);

  return {
    ...country,
    focusPoint: mainPiece.focusPoint,
    cameraTarget: mainPiece.cameraTarget,
    defaultFocusScale: mainPiece.scale,
    pieces: [mainPiece, alaskaPiece, hawaiiPiece],
  };
}

export const COUNTRY_FOCUS_REGISTRY: CountryFocusDefinition[] = COUNTRY_REGISTRY.map((country) =>
  country.iso3 === "USA" ? buildUsaFocusDefinition(country) : buildGenericFocusDefinition(country),
);

export function getCountryFocusDefinition(iso3: string): CountryFocusDefinition | undefined {
  return COUNTRY_FOCUS_REGISTRY.find((country) => country.iso3 === iso3);
}
