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
// A hard ceiling (FOCUS_SCALE_MAX = 30) lived here for a while - Hawaii's
// real footprint needs ~79x scale to fill the 550x300 block, and at that
// scale the focused image's own drop-shadow filter (getCountryFocusImageStyle,
// dashboard.tsx) became catastrophically expensive to rasterize, hanging
// the browser for 90+ seconds on every selection (reproduced directly).
// The actual cause turned out to be the filter living on the same element
// as the scale transform, not the scale value itself - moving the
// drop-shadow to the cutout's unscaled wrapper (getCountryFocusWrapperStyle)
// fixed the real problem at its root. Reproduced and confirmed directly
// afterward: scale settles in single-digit milliseconds at every value
// tested up to 3000x with that fix in place, so the ceiling was only ever
// protecting against the filter bug, not scale itself - every country now
// gets its own true, independent fit-to-block scale, however small its
// real footprint is, per direct product direction ("each country zoom
// scale must be independent" / "make smaller countries bigger").
//
// One genuine edge case remains, unrelated to that old performance bug:
// a handful of countries reduce to a truly zero-area bounding box in the
// registry (currently just Vatican City), where there is no real extent
// to scale against at all - not "very small", but exactly zero, so
// width/height-based scaling is undefined rather than merely large. This
// fallback exists for that literal division-by-zero case only.
const DEGENERATE_GEOMETRY_FALLBACK_SCALE = 30;

// Product decision: tall/narrow countries (Fiji, New Zealand, Chile -
// all noticeably taller than wide) rendered as thin vertical slivers
// under the standard uniform fit-to-block rule, since the block itself
// is landscape-shaped (550 wide x 300 tall) - a portrait country's own
// greater height hits that 300-unit ceiling long before its width uses
// any meaningful fraction of the 550-unit budget (measured directly:
// New Zealand's real fit-to-block scale filled only ~23% of the block's
// width). Per explicit direction ("make an exception for these
// countries to render bigger"), a country whose own bounding box is
// taller than it is wide scales against a taller effective height
// budget instead of the standard block height - its width is still
// capped at the block's own 550-unit width exactly as before, so it can
// never overflow the block horizontally, only render larger overall.
//
// Bounded at 400, not the ~562.5 units visible at the 16:9 viewport
// every past Operational Focus Block measurement in this file uses -
// deliberately conservative so a portrait country scaled against it
// still stays inside the Operational Canvas's always-visible region on
// a notably wider-than-16:9 display too. Reusing the exact "xMidYMid
// slice" visible-range math from the block's own original re-centring
// (Index 3.8) - visible half-height at aspect ratio W:H is 500*(H/W) -
// 400 stays safely under the ~429-unit ceiling a 21:9 ultrawide display
// allows, with real margin to spare.
const PORTRAIT_HEIGHT_BUDGET = 400;

function scaleToFit(box: BoundingBox, targetWidth: number, targetHeight: number): number {
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  if (width <= 0 || height <= 0) return DEGENERATE_GEOMETRY_FALLBACK_SCALE;
  const effectiveHeight = height > width ? Math.max(targetHeight, PORTRAIT_HEIGHT_BUDGET) : targetHeight;
  return Math.min(targetWidth / width, effectiveHeight / height);
}

export type CountryFocusDefinition = CountryDefinition & {
  focusPoint: FocusPoint;
  cameraTarget: CameraTarget;
  defaultFocusScale: number;
};

// --- Ring geometry helpers ----------------------------------------------
// Shared by both the ordinary (single-piece) focus path below and the
// country-splitting section further down - a country's stored geometry is
// a single SVG path string encoding one or more "rings" (M...Z segments),
// each a separate landmass/island/territory.
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

// Shoelace formula: centroid (used for split-region classification below -
// every ring is bucketed by position, not by size, so nothing is ever
// dropped as "too small to matter") and area (used both for split-region
// classification and for computeScaleReferenceBox's own ring ranking).
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

function boxArea(box: BoundingBox): number {
  return Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxY - box.minY);
}

function unionBoundingBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

// Originally a narrower "antimeridian wrap" special case written for
// Alaska alone (Index 3.8 bug fix): scaling to a country/region's naive
// combined bounding box breaks whenever some of its rings sit far from
// the rest, because the box has to stretch to cover the empty space
// between them, shrinking the scale and pulling the focus point away
// from the country's real, recognisable territory. Two different real
// causes produce the same symptom:
//  - Alaska's own ring set legitimately includes the westernmost
//    Aleutian islands, which cross the antimeridian and render near
//    x=1000 in this equirectangular-style projection while the rest of
//    Alaska sits near x=0-100 - a data/projection artifact, not real
//    geographic distance.
//  - Chile's Easter Island (~3,500 real km from the mainland),
//    Portugal's Azores/Madeira - genuinely distant real territory, no
//    projection artifact involved, but the same effect on the box.
//    Reported directly: Chile rendered visibly off-centre, its combined
//    bounding box (including the Easter Island ring, ~5.3x the mainland
//    ring's own area) pulling the focus point west of the actual visible
//    mainland.
//
// Generalises what was a single width-threshold check into ring-by-ring
// accretion: starting from the largest ring, greedily absorb every other
// ring (largest-first) into a running "core" box as long as doing so
// doesn't multiply the box's own area by more than GROWTH_FACTOR - a
// nearby island (Hawaii's own chain, Chile's own southern archipelago)
// barely grows the box and is absorbed; a genuinely distant, disconnected
// outlier would blow the box up far past what its own real close
// territory needs, and is excluded from the reference. Either way, every
// ring - including any excluded ones - still goes into the country's
// rendered svgPath and still renders; only the scale/focus calculation
// ever ignores any of them.
//
// GROWTH_FACTOR is deliberately generous: real, legitimately spread
// archipelago nations (Indonesia, Philippines, Fiji - none of which has
// one dominant ring in the first place, measured directly at 28-56% for
// their largest ring's own share of the total area) never come close to
// tripping it, since their islands sit close enough together that
// absorbing each one barely changes the box. It only excludes rings that
// would multiply the box's area several times over on their own -
// confirmed directly against Hawaii's tight ~15x10 unit cluster (nothing
// excluded, matches its long-verified behaviour) and Alaska's wrapped
// Aleutian tip (excluded, matches its long-verified behaviour).
const SCALE_REFERENCE_GROWTH_FACTOR = 4;

function computeScaleReferenceBox(rings: RingPoint[][]): BoundingBox {
  const ringsWithArea = rings
    .map((ring) => {
      const summary = ringCentroidAndArea(ring);
      return summary ? { bbox: pathBoundingBox(ringsToPath([ring])), area: summary.area } : null;
    })
    .filter((r): r is { bbox: BoundingBox; area: number } => r !== null)
    .sort((a, b) => b.area - a.area);

  if (ringsWithArea.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  let core = ringsWithArea[0].bbox;
  let coreArea = boxArea(core);
  for (let i = 1; i < ringsWithArea.length; i++) {
    const candidate = unionBoundingBox(core, ringsWithArea[i].bbox);
    const candidateArea = boxArea(candidate);
    if (coreArea <= 0 || candidateArea <= coreArea * SCALE_REFERENCE_GROWTH_FACTOR) {
      core = candidate;
      coreArea = candidateArea;
    }
    // else: a genuinely distant outlier, excluded from the scale/focus
    // reference (still rendered - see the comment above).
  }
  return core;
}

function buildGenericFocusDefinition(country: CountryDefinition): CountryFocusDefinition {
  // The registry's own boundingBox is still what's rendered and clicked -
  // mainland, every island, every territory, nothing dropped. Only the
  // reference used to compute the focus point and scale is narrowed to
  // the country's own close, contiguous territory (computeScaleReferenceBox
  // above) - a genuinely distant outlier would otherwise pull the focus
  // point away from the country's real, recognisable landmass and shrink
  // the scale to accommodate empty ocean between them.
  const rings = parsePathRings(country.svgPath);
  const scaleReferenceBox = computeScaleReferenceBox(rings);
  const focusPoint = boxCenter(scaleReferenceBox);
  const cameraTarget = boxCenter(OPERATIONAL_FOCUS_BLOCK);
  const defaultFocusScale = scaleToFit(scaleReferenceBox, OPERATIONAL_FOCUS_BLOCK_WIDTH, OPERATIONAL_FOCUS_BLOCK_HEIGHT);
  return { ...country, focusPoint, cameraTarget, defaultFocusScale };
}

function buildRegionFocusDefinition(base: CountryDefinition, rings: RingPoint[][]): CountryFocusDefinition {
  const svgPath = ringsToPath(rings);
  const boundingBox = pathBoundingBox(svgPath);
  const region: CountryDefinition = { ...base, svgPath, boundingBox };
  const scaleReferenceBox = computeScaleReferenceBox(rings);

  return {
    ...region,
    focusPoint: boxCenter(scaleReferenceBox),
    cameraTarget: boxCenter(OPERATIONAL_FOCUS_BLOCK),
    defaultFocusScale: scaleToFit(scaleReferenceBox, OPERATIONAL_FOCUS_BLOCK_WIDTH, OPERATIONAL_FOCUS_BLOCK_HEIGHT),
  };
}

// --- Splitting a country into independently selectable regions --------
// Some countries have territory separated from their mainland by whole
// oceans - on the Operational Canvas, treating a single click anywhere in
// any of them as "select the country" made it feel like the territory
// belonged to itself rather than to the operator. Per explicit direction
// (first for the USA's mainland/Alaska/Hawaii, later generalised for
// France's French Guiana and Spain's Canary Islands), each such piece is
// its own click target and its own focus target - filling the
// Operational Focus Block on its own, exactly like any ordinary country -
// rather than only reachable as part of a click on the whole. This is
// still the only country-specific logic in this file - every other
// country is unaffected and still selects/focuses as a single whole via
// buildGenericFocusDefinition above. It only derives new region geometry
// from a country's own already-approved registry path - the Operational
// Country Registry itself is never touched.

// Classification is purely geometric (ring centroid position in the same
// 1000x1000 Operational Geometry space every country's own registry path
// already lives in) - derived directly from each country's own stored
// coastline data, not a hand-picked island list. Every cutoff below is a
// real gap measured directly in that country's own ring centroids.
type SplitRegionRule = {
  id: string;
  iso2: string;
  iso3: string;
  name: string;
  isMember: (centroid: FocusPoint) => boolean;
};

// USA: mainland (CONUS, Puerto Rico, every other small feature close
// enough to stay bundled with it) split from Alaska (mainland plus the
// full Aleutian chain, including the westernmost islands that wrap past
// the antimeridian to render near x=1000) and Hawaii (its own tight
// island cluster, south and west of CONUS). CONUS's own bounding box is
// y:341.9-427.8 / x:122.7-283.1, which is why 335/430/115 cleanly
// separate the three groups with no overlap in this country's actual
// data.
const USA_ALASKA: SplitRegionRule = {
  id: "usa-alaska",
  iso2: "AK",
  iso3: "ALK",
  name: "Alaska",
  isMember: (c) => c.y < 335 && (c.x < 115 || c.x > 900),
};
const USA_HAWAII: SplitRegionRule = {
  id: "usa-hawaii",
  iso2: "HI",
  iso3: "HAW",
  name: "Hawaii",
  isMember: (c) => c.y > 430 && c.x < 115,
};

// France: mainland (Europe, Corsica, every other small feature close
// enough to stay bundled with it) split from four overseas departments,
// each its own real place with its own real ISO 3166-1 code (not a
// synthetic one - unlike Alaska/Hawaii/the Canary Islands, none of these
// are ambiguous about their own identity, simply not present as their
// own entries in this registry, bundled into France's own multi-ring
// path):
//
// - French Guiana, north coast of South America (y~489.2, x~321.3) - the
//   only French ring anywhere near that position; a first pass at this
//   split used y > 470 alone and accidentally also swept in the far more
//   distant Réunion/Mayotte cluster below (both also > 470) into a
//   single broken "French Guiana" region spanning two oceans - x < 400
//   is what actually isolates it.
// - Martinique and Guadeloupe, in the Antilles (Caribbean) - four small
//   rings cluster together at x~298-300, y~454-459, distinguished from
//   each other by area, not just position: the single largest ring here
//   (area 0.720, y~458.8, the southernmost of the four) matches
//   Martinique's real single-island shape and its real land area
//   relative to Guadeloupe (~1,128 vs ~1,628 sq km); the other three
//   rings combined (area 0.585+0.410+0.080=1.075, all at y~454.0-455.2,
//   further north) match Guadeloupe's own real butterfly-shaped main
//   island plus its small outlying islands (Les Saintes, Marie-Galante) -
//   both the area ratio (~1.49 measured vs ~1.44 real) and the
//   north/south ordering (Guadeloupe north of Martinique in reality)
//   agree, but this one is inferred from shape/area rather than a
//   labelled source, unlike every other split in this file.
// - Mayotte and Réunion, in the Indian Ocean - two rings at (594.5,
//   535.9) and (623.5,560.0), distinguished the same way: Réunion's real
//   land area is roughly 6.7x Mayotte's, and the larger, more
//   south-east ring here (area 1.875, at 623.5,560.0) is a near-exact
//   match (measured ratio ~6.8x) for Réunion; the smaller, more
//   north-west ring (area 0.275, at 594.5,535.9) matches Mayotte.
const FRANCE_GUIANA: SplitRegionRule = {
  id: "france-french-guiana",
  iso2: "GF",
  iso3: "GUF",
  name: "French Guiana",
  isMember: (c) => c.y > 470 && c.x < 400,
};
const FRANCE_MARTINIQUE: SplitRegionRule = {
  id: "france-martinique",
  iso2: "MQ",
  iso3: "MTQ",
  name: "Martinique",
  isMember: (c) => c.y > 456 && c.y < 465 && c.x < 310,
};
const FRANCE_GUADELOUPE: SplitRegionRule = {
  id: "france-guadeloupe",
  iso2: "GP",
  iso3: "GLP",
  name: "Guadeloupe",
  isMember: (c) => c.y > 452 && c.y <= 456 && c.x < 310,
};
const FRANCE_MAYOTTE: SplitRegionRule = {
  id: "france-mayotte",
  iso2: "YT",
  iso3: "MYT",
  name: "Mayotte",
  isMember: (c) => c.y > 500 && c.x < 610,
};
const FRANCE_REUNION: SplitRegionRule = {
  id: "france-reunion",
  iso2: "RE",
  iso3: "REU",
  name: "Réunion",
  isMember: (c) => c.y > 500 && c.x >= 610,
};

// Spain: mainland (Europe, the Balearic Islands, every other small
// feature close enough to stay bundled with it) split from the Canary
// Islands, off the coast of Morocco/Western Sahara in the Atlantic.
// Every other Spain ring tops out at y=392.6 (mainland/Balearics); the
// Canaries sit at y~415-419, a clean gap. Unlike French Guiana, the
// Canary Islands have no distinct ISO 3166-1 code of their own (fully
// part of Spain in that standard), so - like Alaska/Hawaii - they get a
// synthetic, clearly-non-colliding one instead.
const SPAIN_CANARY_ISLANDS: SplitRegionRule = {
  id: "spain-canary-islands",
  iso2: "IC",
  iso3: "ICA",
  name: "Canary Islands",
  isMember: (c) => c.y > 400,
};

// Chile: mainland (the full continental strip, plus its own nearby
// southern archipelago - Chiloé, Tierra del Fuego - already covered by
// computeScaleReferenceBox's own growth-based accretion, not this
// classifier) split from Easter Island (Rapa Nui), ~3,500 real km into
// the Pacific - the ring that originally caused Chile to render visibly
// off-centre (see computeScaleReferenceBox). Mainland's own westernmost
// extent is x=258.9; Easter Island sits at x~165.4, a clean gap. No
// distinct ISO 3166-1 code of its own (fully part of Chile in that
// standard), so a synthetic one.
const CHILE_EASTER_ISLAND: SplitRegionRule = {
  id: "chile-easter-island",
  iso2: "EI",
  iso3: "EAS",
  name: "Easter Island",
  isMember: (c) => c.x < 250,
};

// Norway: mainland (the full length of continental Norway, y:214.7-301.1)
// split from Svalbard, a real archipelago ~55 units further north than
// mainland's own northernmost point with no gap in between - measured
// directly off the registry's own ring set: Svalbard's own several
// islands (Spitsbergen, Nordaustlandet, Edgeøya) all sit at y<160, every
// one of mainland's own nearby small islands sits at y>214. Has a real
// ISO 3166-1 code of its own (Svalbard and Jan Mayen, SJ/SJM), not
// present as its own entry in this registry.
const NORWAY_SVALBARD: SplitRegionRule = {
  id: "norway-svalbard",
  iso2: "SJ",
  iso3: "SJM",
  name: "Svalbard",
  isMember: (c) => c.y < 200,
};

// Australia: mainland split from Tasmania - mainland's own southernmost
// point sits at y=618.3, every Tasmania-cluster ring sits at y>619.9, a
// clean gap with no real territory in between. No distinct ISO 3166-1
// code of its own (an Australian state, not a separate country), so a
// synthetic one.
const AUSTRALIA_TASMANIA: SplitRegionRule = {
  id: "australia-tasmania",
  iso2: "TS",
  iso3: "TAS",
  name: "Tasmania",
  isMember: (c) => c.y > 619,
};

// Ecuador: mainland split from the Galápagos Islands - mainland's own
// westernmost point sits at x=244.4, the Galápagos ring cluster sits at
// x<218.6, a clean gap (one small ring at x=246.6 stays with the
// mainland - within its own bounding box, a real nearshore feature, not
// Galápagos). No distinct ISO 3166-1 code of its own (part of Ecuador in
// that standard), so a synthetic one.
const ECUADOR_GALAPAGOS: SplitRegionRule = {
  id: "ecuador-galapagos",
  iso2: "GX",
  iso3: "GAL",
  name: "Galápagos Islands",
  isMember: (c) => c.x < 230,
};

// Portugal: mainland split into two real, separately-named Atlantic
// archipelagos, distinguished by position, not just excluded as one
// lump: Madeira is a single ring at y~403.6, notably further south than
// both mainland (y~379.8) and the Azores cluster (y~380-389) - y > 395
// isolates it cleanly. The Azores are seven rings clustered at
// x~382-399, y~380-389 - similar latitude to mainland but well west of
// it (mainland's own westernmost point is x=443.9) - y <= 395 && x < 420
// catches the whole cluster without also catching mainland. Neither has
// a distinct ISO 3166-1 code of its own (both autonomous regions of
// Portugal in that standard), so both get synthetic ones.
const PORTUGAL_MADEIRA: SplitRegionRule = {
  id: "portugal-madeira",
  iso2: "MI",
  iso3: "MAD",
  name: "Madeira",
  isMember: (c) => c.y > 395,
};
const PORTUGAL_AZORES: SplitRegionRule = {
  id: "portugal-azores",
  iso2: "AC",
  iso3: "AZO",
  name: "Azores",
  isMember: (c) => c.y <= 395 && c.x < 420,
};

// Russia: mainland split from Kaliningrad, the exclave separated from
// the rest of Russia by Lithuania, Poland, and Belarus - mainland's own
// westernmost point sits at x=545.1, Kaliningrad sits at x~528.6, a
// clean (if modest, matching the two countries' real modest separation)
// gap. No distinct ISO 3166-1 code of its own (a Russian federal subject,
// not a separate country), so a synthetic one.
const RUSSIA_KALININGRAD: SplitRegionRule = {
  id: "russia-kaliningrad",
  iso2: "KA",
  iso3: "KGD",
  name: "Kaliningrad",
  isMember: (c) => c.x < 545,
};

const COUNTRY_SPLITS: { iso3: string; regions: SplitRegionRule[] }[] = [
  { iso3: "USA", regions: [USA_ALASKA, USA_HAWAII] },
  { iso3: "FRA", regions: [FRANCE_GUIANA, FRANCE_MARTINIQUE, FRANCE_GUADELOUPE, FRANCE_MAYOTTE, FRANCE_REUNION] },
  { iso3: "ESP", regions: [SPAIN_CANARY_ISLANDS] },
  { iso3: "CHL", regions: [CHILE_EASTER_ISLAND] },
  { iso3: "NOR", regions: [NORWAY_SVALBARD] },
  { iso3: "AUS", regions: [AUSTRALIA_TASMANIA] },
  { iso3: "ECU", regions: [ECUADOR_GALAPAGOS] },
  { iso3: "PRT", regions: [PORTUGAL_MADEIRA, PORTUGAL_AZORES] },
  { iso3: "RUS", regions: [RUSSIA_KALININGRAD] },
];

// Splits a real registry entry into independently selectable
// CountryDefinition-shaped regions: everything not claimed by one of its
// split rules stays together as the mainland region, keeping the
// country's own real identity - it is still, conceptually, that country.
// Each rule's own matched rings become their own new region, under
// whichever identity the rule specifies (a real ISO 3166 code where one
// exists for the territory, a synthetic non-colliding one where it
// doesn't).
type CountrySplitResult = {
  mainRings: RingPoint[][];
  regions: { rule: SplitRegionRule; rings: RingPoint[][] }[];
};

// Ring classification happens exactly once per split country's own
// registry entry - both the selectable regions below and their focus
// definitions are derived from this single result, so the two can never
// drift apart from each other.
function classifyCountrySplit(base: CountryDefinition, regionRules: SplitRegionRule[]): CountrySplitResult {
  const rings = parsePathRings(base.svgPath);
  const mainRings: RingPoint[][] = [];
  const regionRingsById = new Map<string, RingPoint[][]>(regionRules.map((rule) => [rule.id, []]));
  for (const ring of rings) {
    const centroid = ringCentroidAndArea(ring)?.centroid ?? null;
    const matchedRule = centroid ? regionRules.find((rule) => rule.isMember(centroid)) : undefined;
    if (matchedRule) {
      regionRingsById.get(matchedRule.id)!.push(ring);
    } else {
      // Every ring not claimed by a split rule - the mainland, and every
      // other small real feature close enough to it - stays together.
      // Nothing is dropped.
      mainRings.push(ring);
    }
  }
  return { mainRings, regions: regionRules.map((rule) => ({ rule, rings: regionRingsById.get(rule.id)! })) };
}

function buildSplitRegionDefinition(base: CountryDefinition, rings: RingPoint[][]): CountryDefinition {
  const svgPath = ringsToPath(rings);
  return { ...base, svgPath, boundingBox: pathBoundingBox(svgPath) };
}

function splitRuleBase(rule: SplitRegionRule): CountryDefinition {
  return { id: rule.id, iso2: rule.iso2, iso3: rule.iso3, name: rule.name, svgPath: "", boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
}

const COUNTRY_SPLIT_RESULTS = new Map<string, CountrySplitResult>();
for (const { iso3, regions } of COUNTRY_SPLITS) {
  const base = COUNTRY_REGISTRY.find((country) => country.iso3 === iso3);
  if (base) COUNTRY_SPLIT_RESULTS.set(iso3, classifyCountrySplit(base, regions));
}

// A split country's own registry entry, replaced by its mainland plus
// each split region; every other country passes through unchanged. This
// is what the Operational Canvas's selection hit-zones render from, so
// Alaska, Hawaii, French Guiana, and the Canary Islands become their own
// clickable shapes on the map instead of only reachable as part of a
// click on their parent country.
export const OPERATIONAL_SELECTABLE_REGIONS: CountryDefinition[] = COUNTRY_REGISTRY.flatMap((country) => {
  const split = COUNTRY_SPLIT_RESULTS.get(country.iso3);
  if (!split) return [country];
  return [
    buildSplitRegionDefinition(country, split.mainRings),
    ...split.regions.map(({ rule, rings }) => buildSplitRegionDefinition(splitRuleBase(rule), rings)),
  ];
});

export const COUNTRY_FOCUS_REGISTRY: CountryFocusDefinition[] = COUNTRY_REGISTRY.flatMap((country) => {
  const split = COUNTRY_SPLIT_RESULTS.get(country.iso3);
  if (!split) return [buildGenericFocusDefinition(country)];
  return [
    buildRegionFocusDefinition(country, split.mainRings),
    ...split.regions.map(({ rule, rings }) => buildRegionFocusDefinition(splitRuleBase(rule), rings)),
  ];
});

export function getCountryFocusDefinition(iso3: string): CountryFocusDefinition | undefined {
  return COUNTRY_FOCUS_REGISTRY.find((country) => country.iso3 === iso3);
}
