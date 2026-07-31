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
//
// Centred on (500, 500) - the Operational Geometry space's own true
// visible centre, not an arbitrary choice: the Operational Canvas's
// "xMidYMid slice" viewBox (Index 2.2C, unmodified by this ticket) keeps
// (500, 500) at the centre of the screen at any viewport size, while a
// block centred elsewhere in that space (the ticket's original
// (250,100)-(800,400), centred at (525,250)) sits in a region the slice
// crop doesn't always show on a landscape viewport - confirmed directly:
// tall countries (Canada, Russia, South Africa, Australia, USA mainland)
// rendered with their top portion above the visible screen. Re-centring
// on the space's own true middle - per explicit follow-up direction to
// show the selected country in the middle of the screen - fixes that
// directly, while keeping the exact 550x300 size the ticket specified.
const OPERATIONAL_FOCUS_BLOCK: BoundingBox = { minX: 225, minY: 350, maxX: 775, maxY: 650 };
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

// Shoelace formula: centroid (used for classification - every ring is
// bucketed by position, not by size, so nothing is ever dropped as "too
// small to matter") and area (used below to pick each piece's own
// largest ring as its scale/focus reference).
function ringCentroidAndArea(ring: RingPoint[]): { centroid: FocusPoint; area: number } | null {
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
  return { centroid: { x: cx / (3 * signedArea2), y: cy / (3 * signedArea2) }, area: Math.abs(signedArea2) / 2 };
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

// Small inset boxes inside the (now screen-centred) Operational Focus
// Block, top-left for Alaska and bottom-left for Hawaii per the ticket -
// comfortably clear of the block's own edges and of each other. With the
// block re-centred on the Operational Geometry space's true visible
// middle (500, 500), its entire Y:350-650 span is on screen at common
// viewport sizes, so these no longer need to dodge a crop margin the way
// the pre-recentring version did.
const USA_ALASKA_INSET_BOX: BoundingBox = { minX: 235, minY: 360, maxX: 405, maxY: 460 };
const USA_HAWAII_INSET_BOX: BoundingBox = { minX: 235, minY: 540, maxX: 405, maxY: 640 };

// Index 3.8 follow-up fix: fitting the SCALE to each piece's naive
// combined bounding box broke for Alaska specifically - its ring set
// legitimately includes the westernmost Aleutian islands, which cross
// the antimeridian and render near x=1000 in this equirectangular-style
// projection, the same wraparound that inflated the whole pre-rebuild
// USA registry bounding box to x:-0.5-1000.5 (documented in Index 3.8's
// own investigation). A combined bbox across both x~2 and x~1000 is
// ~1000 units wide, computing a scale of ~0.17 - Alaska rendering as a
// barely-visible speck instead of the intended dominant inset. Using
// only the LARGEST ring in the group for the scale/focus reference (the
// same "trust the mainland ring, not the whole multi-territory bbox"
// fix Index 3.4A already applied everywhere else in this file) sidesteps
// the wraparound without dropping anything - every ring in the group,
// including the wrapped Aleutian fragments, still goes into `geometry`
// and still renders.
function buildUsaFocusPiece(id: string, rings: RingPoint[][], targetBox: BoundingBox): CountryFocusPiece {
  const geometry = ringsToPath(rings);
  const ringsWithArea = rings
    .map((ring) => {
      const summary = ringCentroidAndArea(ring);
      return summary ? { ring, area: summary.area } : null;
    })
    .filter((r): r is { ring: RingPoint[]; area: number } => r !== null);
  const largestRing = ringsWithArea.reduce<{ ring: RingPoint[]; area: number } | null>(
    (best, current) => (!best || current.area > best.area ? current : best),
    null,
  );
  const scaleReferenceBox = largestRing ? pathBoundingBox(ringsToPath([largestRing.ring])) : pathBoundingBox(geometry);
  return {
    id,
    geometry,
    focusPoint: boxCenter(scaleReferenceBox),
    cameraTarget: boxCenter(targetBox),
    scale: scaleToFit(scaleReferenceBox, targetBox.maxX - targetBox.minX, targetBox.maxY - targetBox.minY),
  };
}

function buildUsaFocusDefinition(country: CountryDefinition): CountryFocusDefinition {
  const rings = parsePathRings(country.svgPath);
  const alaskaRings: RingPoint[][] = [];
  const hawaiiRings: RingPoint[][] = [];
  const mainRings: RingPoint[][] = [];
  for (const ring of rings) {
    const summary = ringCentroidAndArea(ring);
    const centroid = summary?.centroid ?? null;
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
