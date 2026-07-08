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
  // false means focusPoint/defaultFocusScale were derived generically from
  // the stored bounding box, not reviewed - per the ticket's own "mark
  // these defaults clearly so they can be refined later" instruction.
  isConfigured: boolean;
};

// Every country currently finishes its Country Focus animation at the
// Operational Canvas's centre (Index 3.1) - there is no per-country
// camera-target behaviour built yet, so this is the same sensible default
// for configured and unconfigured countries alike, not a placeholder pretending
// otherwise.
const OPERATIONAL_CANVAS_CENTER: CameraTarget = { x: 500, y: 500 };

// Country Focus Normalisation Engine (Index 3.3): every country - large or
// small - targets the same visual footprint on the Operational Canvas, so
// Russia does not dwarf Syria once both are focused. Scale is derived
// uniformly from each country's own stored bounding box (never hardcoded
// per country) by finding its largest dimension - width or height - and
// scaling that dimension to the target canvas fraction. Since both axes
// share the same target fraction in this square 1000x1000 space, the
// larger of the country's own width/height is always the binding
// constraint, which is what keeps the scale-up uniform (no distortion) -
// the same single multiplier is applied to both axes. Clamped so the
// formula can't blow up a sliver country or shrink a huge one to nothing.
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

// Hand-reviewed focus-point overrides for the Index 3.2 initial set - each
// country's own largest-ring (mainland) polygon centroid rather than its
// overall bounding-box centre, since the generic default below would put
// the USA's focus point far out in the Pacific (its stored bounding box is
// stretched to the Aleutian Islands near the antimeridian seam). Only
// focusPoint is hand-reviewed here - defaultFocusScale always comes from
// the uniform formula above, per Index 3.3's own "do not hardcode
// country-specific scale values" instruction, even for these six.
const FOCUS_OVERRIDES: Record<string, { focusPoint: FocusPoint }> = {
  AUS: { focusPoint: { x: 842.6, y: 574.9 } },
  USA: { focusPoint: { x: 193.3, y: 378.1 } },
  GBR: { focusPoint: { x: 462.0, y: 320.5 } },
  JPN: { focusPoint: { x: 852.6, y: 390.3 } },
  ZAF: { focusPoint: { x: 538.9, y: 584.6 } },
  BRA: { focusPoint: { x: 321.8, y: 531.4 } },
};

function buildFocusDefinition(country: CountryDefinition): CountryFocusDefinition {
  const override = FOCUS_OVERRIDES[country.iso3];
  const defaultFocusScale = computeDefaultFocusScale(country.boundingBox);
  if (override) {
    return {
      ...country,
      focusPoint: override.focusPoint,
      cameraTarget: OPERATIONAL_CANVAS_CENTER,
      defaultFocusScale,
      isConfigured: true,
    };
  }

  // Sensible default for every country not yet hand-reviewed: the stored
  // bounding box's own centre. Good enough to be usable everywhere
  // immediately; not guaranteed accurate for countries whose bounding box
  // is skewed by remote territories (the exact problem the focus-point
  // overrides above exist to fix) - isConfigured: false flags exactly
  // which countries still need that same treatment.
  const { minX, minY, maxX, maxY } = country.boundingBox;
  return {
    ...country,
    focusPoint: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    cameraTarget: OPERATIONAL_CANVAS_CENTER,
    defaultFocusScale,
    isConfigured: false,
  };
}

export const COUNTRY_FOCUS_REGISTRY: CountryFocusDefinition[] = COUNTRY_REGISTRY.map(buildFocusDefinition);

export function getCountryFocusDefinition(iso3: string): CountryFocusDefinition | undefined {
  return COUNTRY_FOCUS_REGISTRY.find((country) => country.iso3 === iso3);
}
