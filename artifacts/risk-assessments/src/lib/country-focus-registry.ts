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

const FOCUS_SCALE_MIN = 1.04;
const FOCUS_SCALE_MAX = 1.35;
const FOCUS_SCALE_SPAN_FACTOR = 45;

function scaleFromSpan(span: number): number {
  if (span <= 0) return FOCUS_SCALE_MAX;
  return Math.min(FOCUS_SCALE_MAX, Math.max(FOCUS_SCALE_MIN, 1 + FOCUS_SCALE_SPAN_FACTOR / span));
}

// Hand-reviewed overrides for the Index 3.2 initial set. Focus points are
// each country's own largest-ring (mainland) polygon centroid rather than
// its overall bounding-box centre - the same generic formula the
// unconfigured default below uses would put the USA's focus point far out
// in the Pacific, since its stored bounding box is stretched to the
// Aleutian Islands near the antimeridian seam. Focus scale is likewise
// derived from the mainland ring's own span rather than that stretched
// bounding box. Computed once (see the analysis in the Index 3.2 commit),
// not recalculated at runtime.
const FOCUS_OVERRIDES: Record<string, { focusPoint: FocusPoint; defaultFocusScale: number }> = {
  AUS: { focusPoint: { x: 842.6, y: 574.9 }, defaultFocusScale: 1.35 },
  USA: { focusPoint: { x: 193.3, y: 378.1 }, defaultFocusScale: 1.28 },
  GBR: { focusPoint: { x: 462.0, y: 320.5 }, defaultFocusScale: 1.35 },
  JPN: { focusPoint: { x: 852.6, y: 390.3 }, defaultFocusScale: 1.35 },
  ZAF: { focusPoint: { x: 538.9, y: 584.6 }, defaultFocusScale: 1.35 },
  BRA: { focusPoint: { x: 321.8, y: 531.4 }, defaultFocusScale: 1.35 },
};

function buildFocusDefinition(country: CountryDefinition): CountryFocusDefinition {
  const override = FOCUS_OVERRIDES[country.iso3];
  if (override) {
    return {
      ...country,
      focusPoint: override.focusPoint,
      cameraTarget: OPERATIONAL_CANVAS_CENTER,
      defaultFocusScale: override.defaultFocusScale,
      isConfigured: true,
    };
  }

  // Sensible default for every country not yet hand-reviewed: the stored
  // bounding box's own centre and span. Good enough to be usable
  // everywhere immediately; not guaranteed accurate for countries whose
  // bounding box is skewed by remote territories (the exact problem the
  // overrides above exist to fix) - isConfigured: false flags exactly
  // which countries still need that same treatment.
  const { minX, minY, maxX, maxY } = country.boundingBox;
  const span = Math.max(maxX - minX, maxY - minY);
  return {
    ...country,
    focusPoint: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    cameraTarget: OPERATIONAL_CANVAS_CENTER,
    defaultFocusScale: scaleFromSpan(span),
    isConfigured: false,
  };
}

export const COUNTRY_FOCUS_REGISTRY: CountryFocusDefinition[] = COUNTRY_REGISTRY.map(buildFocusDefinition);

export function getCountryFocusDefinition(iso3: string): CountryFocusDefinition | undefined {
  return COUNTRY_FOCUS_REGISTRY.find((country) => country.iso3 === iso3);
}
