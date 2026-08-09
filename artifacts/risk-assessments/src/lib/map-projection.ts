// Projects real-world lat/lng into the same 1000x1000 "Operational
// Geometry" space every CountryDefinition.svgPath and
// CityDefinition.position already lives in - the exact Web Mercator
// formula from public/data/generate-country-registry.py and
// generate-city-registry.py, unchanged, so a point computed here lands
// in the same place a pre-generated city would (see the projection
// comment atop generate-city-registry.py for why any drift here would
// put a point outside its own country's coastline).
const MERCATOR_SEAM = 191.1;
const MERCATOR_LEFT_EDGE = MERCATOR_SEAM - 360;
const MERCATOR_LAT_LIMIT = 85.05112877980659;

function mercatorYFraction(latDeg: number): number {
  const latRad = (latDeg * Math.PI) / 180;
  return 0.5 - Math.asinh(Math.tan(latRad)) / (2 * Math.PI);
}

export function projectToOperationalGeometry(lng: number, lat: number): [number, number] {
  const xFrac = (lng - MERCATOR_LEFT_EDGE) / 360;
  const clampedLat = Math.max(-MERCATOR_LAT_LIMIT, Math.min(MERCATOR_LAT_LIMIT, lat));
  const yFrac = mercatorYFraction(clampedLat);
  return [xFrac * 1000, yFrac * 1000];
}
