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

async function fetchOsrmRoutes(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  alternatives: boolean,
): Promise<OsrmRoute[]> {
  const coordStr = `${startLng},${startLat};${endLng},${endLat}`;
  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson&steps=false${alternatives ? "&alternatives=true" : ""}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) {
    throw new Error(`OSRM returned HTTP ${resp.status}`);
  }
  const data: any = await resp.json();
  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new Error(`OSRM routing failed: ${data.message ?? data.code}`);
  }

  return data.routes.map((route: any) => ({
    geometry: route.geometry,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
  }));
}

export async function fetchOsrmRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<OsrmRoute> {
  const [route] = await fetchOsrmRoutes(startLat, startLng, endLat, endLng, false);
  return route;
}

// Backs Operators Note's "Ask" chatbot's "alternative route" intent -
// OSRM's own alternate-route option (per direct product direction),
// not a second routing engine. OSRM's own ordering puts its default/
// fastest route first (index 0, the same one already stored as a
// task's primary route), so everything after that is a real
// alternative to it.
export async function fetchOsrmRouteAlternatives(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<OsrmRoute[]> {
  const routes = await fetchOsrmRoutes(startLat, startLng, endLat, endLng, true);
  return routes.slice(1);
}
