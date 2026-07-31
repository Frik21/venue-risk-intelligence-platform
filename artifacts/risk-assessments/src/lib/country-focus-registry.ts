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
//
// Hard ceiling, reintroduced after the follow-up USA split surfaced
// exactly the case it exists for: Hawaii's real geographic footprint is
// small enough that fitting it to the full 550x300 block needs ~79x
// scale - and at that scale the focused image's own drop-shadow filter
// (getCountryFocusImageStyle, dashboard.tsx) became catastrophically
// expensive to rasterize, hanging the browser for 90+ seconds on every
// selection (reproduced directly, not theoretical). The pre-3.8 code had
// this exact ceiling for the same reason ("only degenerate micro-
// territories... demand scales in the hundreds or thousands, which is
// not a sensible limit to chase") and it was dropped during the 3.8
// rebuild on the assumption that fitting each country's own real,
// complete bounding box to the block would never need it - true for
// every ordinary country, not true for a genuinely tiny standalone
// region like Hawaii. Clamping means Hawaii (and anything similarly
// small) renders smaller than a full block-filling size rather than
// hanging the tab - a real, inspectable size with breathing room, not
// the block's own upper bound.
const FOCUS_SCALE_MAX = 30;

function scaleToFit(box: BoundingBox, targetWidth: number, targetHeight: number): number {
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  // Defensive fallback only, for the rare degenerate/near-zero-size
  // geometry (e.g. a micro-nation simplified to a single point) where
  // there is no real extent to scale against.
  if (width <= 0 || height <= 0) return FOCUS_SCALE_MAX;
  return Math.min(targetWidth / width, targetHeight / height, FOCUS_SCALE_MAX);
}

export type CountryFocusDefinition = CountryDefinition & {
  focusPoint: FocusPoint;
  cameraTarget: CameraTarget;
  defaultFocusScale: number;
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

// --- Splitting the USA into independently selectable regions ----------
// The USA's mainland, Alaska, and Hawaii are separated by whole oceans -
// on the Operational Canvas, treating a single click anywhere in any of
// the three as "select the United States" made the country feel like it
// belonged to itself rather than to the operator. Per explicit direction,
// each is now its own click target and its own focus target: selecting
// the mainland shows the mainland; selecting Alaska shows Alaska;
// selecting Hawaii shows Hawaii - each filling the Operational Focus
// Block on its own, exactly like any ordinary country, rather than the
// mainland-dominant-plus-two-small-insets layout this replaces. This is
// still the only country-specific logic in this file - every other
// country (Russia, France, Canada, all 234 others) is unaffected and
// still selects/focuses as a single whole via buildGenericFocusDefinition
// above. It only derives new region geometry from the USA's own already-
// approved registry path - Operational Country Registry itself is never
// touched.
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
// small to matter") and area (used below to pick each region's own
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

// Index 3.8 bug fix, still needed here: scaling to a region's naive
// combined bounding box breaks for Alaska specifically - its ring set
// legitimately includes the westernmost Aleutian islands, which cross
// the antimeridian and render near x=1000 in this equirectangular-style
// projection, the same wraparound that inflated the whole pre-rebuild
// USA registry bounding box to x:-0.5-1000.5. A combined bbox across
// both x~2 and x~1000 is ~1000 units wide, computing a near-zero scale.
// Using only the LARGEST ring in the group as the scale/focus reference
// (the same "trust the mainland ring, not the whole multi-territory
// bbox" fix Index 3.4A already applied generically) sidesteps the
// wraparound without dropping anything - every ring in the group,
// including the wrapped Aleutian fragments, still goes into the region's
// `svgPath` and still renders; only the scale/focus calculation ignores
// them in favour of the one ring that actually represents the region's
// real size.
function buildRegionFocusDefinition(base: CountryDefinition, rings: RingPoint[][]): CountryFocusDefinition {
  const svgPath = ringsToPath(rings);
  const boundingBox = pathBoundingBox(svgPath);
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
  const scaleReferenceBox = largestRing ? pathBoundingBox(ringsToPath([largestRing.ring])) : boundingBox;
  const region: CountryDefinition = { ...base, svgPath, boundingBox };
  return {
    ...region,
    focusPoint: boxCenter(scaleReferenceBox),
    cameraTarget: boxCenter(OPERATIONAL_FOCUS_BLOCK),
    defaultFocusScale: scaleToFit(scaleReferenceBox, OPERATIONAL_FOCUS_BLOCK_WIDTH, OPERATIONAL_FOCUS_BLOCK_HEIGHT),
  };
}

// Splits the real USA registry entry into three independently selectable
// CountryDefinition-shaped regions. Mainland keeps the real "USA"
// identity (it is still, conceptually, the United States); Alaska and
// Hawaii get their own synthetic identifiers (ALK/HAW - not real
// ISO 3166 codes, chosen not to collide with any) since they aren't
// countries in their own right, only separately-focusable regions of one.
type UsaSplit = { mainRings: RingPoint[][]; alaskaRings: RingPoint[][]; hawaiiRings: RingPoint[][] };

// Ring classification happens exactly once per the USA's own registry
// entry (there is only one) - both the selectable regions below and
// their focus definitions are derived from this single result, so the
// two can never drift apart from each other.
function classifyUsaRings(usa: CountryDefinition): UsaSplit {
  const rings = parsePathRings(usa.svgPath);
  const split: UsaSplit = { mainRings: [], alaskaRings: [], hawaiiRings: [] };
  for (const ring of rings) {
    const centroid = ringCentroidAndArea(ring)?.centroid ?? null;
    if (centroid && isUsaAlaskaRing(centroid)) {
      split.alaskaRings.push(ring);
    } else if (centroid && isUsaHawaiiRing(centroid)) {
      split.hawaiiRings.push(ring);
    } else {
      // Every ring not classified as Alaska or Hawaii - CONUS mainland,
      // Puerto Rico, every other small real feature - stays together as
      // the mainland region. Nothing is dropped.
      split.mainRings.push(ring);
    }
  }
  return split;
}

// Alaska and Hawaii get their own synthetic identifiers (ALK/HAW - not
// real ISO 3166 codes, chosen not to collide with any) since they aren't
// countries in their own right, only separately-focusable regions of
// one. Mainland keeps the real "USA" identity - it is still,
// conceptually, the United States.
function buildUsaRegion(base: CountryDefinition, rings: RingPoint[][]): CountryDefinition {
  const svgPath = ringsToPath(rings);
  return { ...base, svgPath, boundingBox: pathBoundingBox(svgPath) };
}

const USA_BASE = COUNTRY_REGISTRY.find((country) => country.iso3 === "USA");
const USA_SPLIT = USA_BASE ? classifyUsaRings(USA_BASE) : null;
const USA_ALASKA_BASE: CountryDefinition = { id: "usa-alaska", iso2: "AK", iso3: "ALK", name: "Alaska", svgPath: "", boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
const USA_HAWAII_BASE: CountryDefinition = { id: "usa-hawaii", iso2: "HI", iso3: "HAW", name: "Hawaii", svgPath: "", boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };

// The USA's own registry entry, replaced by its three split regions;
// every other country passes through unchanged. This is what the
// Operational Canvas's selection hit-zones render from, so Alaska and
// Hawaii become their own clickable shapes on the map instead of only
// reachable as part of a USA click.
export const OPERATIONAL_SELECTABLE_REGIONS: CountryDefinition[] = COUNTRY_REGISTRY.flatMap((country) => {
  if (country.iso3 !== "USA" || !USA_SPLIT) return [country];
  return [
    buildUsaRegion(country, USA_SPLIT.mainRings),
    buildUsaRegion(USA_ALASKA_BASE, USA_SPLIT.alaskaRings),
    buildUsaRegion(USA_HAWAII_BASE, USA_SPLIT.hawaiiRings),
  ];
});

export const COUNTRY_FOCUS_REGISTRY: CountryFocusDefinition[] = COUNTRY_REGISTRY.flatMap((country) => {
  if (country.iso3 !== "USA" || !USA_SPLIT) return [buildGenericFocusDefinition(country)];
  return [
    buildRegionFocusDefinition(country, USA_SPLIT.mainRings),
    buildRegionFocusDefinition(USA_ALASKA_BASE, USA_SPLIT.alaskaRings),
    buildRegionFocusDefinition(USA_HAWAII_BASE, USA_SPLIT.hawaiiRings),
  ];
});

export function getCountryFocusDefinition(iso3: string): CountryFocusDefinition | undefined {
  return COUNTRY_FOCUS_REGISTRY.find((country) => country.iso3 === iso3);
}
