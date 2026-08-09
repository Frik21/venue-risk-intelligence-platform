// Route geometry, distance and static (no-traffic) duration via OSRM
// (router.project-osrm.org) - free, no key, the exact same public demo
// server and response shape the existing Routes feature already uses
// for its "snap to roads" action (routes.ts) - called directly here
// for a simple two-point start -> end route instead of snapping a
// pre-drawn path.
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export interface OsrmRoute {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceMeters: number;
  durationSeconds: number;
}

export async function fetchOsrmRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<OsrmRoute> {
  const coordStr = `${startLng},${startLat};${endLng},${endLat}`;
  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson&steps=false`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) {
    throw new Error(`OSRM returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new Error(`OSRM routing failed: ${data.message ?? data.code}`);
  }

  const route = data.routes[0];
  return {
    geometry: route.geometry,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
  };
}
