// Nearest hospitals/police stations along a route corridor, for Route
// Planning's "Calculate Route" action - automates the Task Planning
// checklist's "Closest hospitals identified"/"Closest police stations
// identified" items for whichever route the CPO is actually taking.
// Source: Overpass API (overpass-api.de), the standard free/no-key
// query engine over OpenStreetMap data - same OSM ecosystem as Photon
// (search) and OSRM (routing), which this app already depends on.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// How far off the route a hospital/police station can be and still
// count as "along the way" - not a hard search radius, just a filter
// applied after Overpass returns candidates in the route's bounding box.
const CORRIDOR_BUFFER_METERS = 5000;
const MAX_RESULTS_PER_CATEGORY = 3;
// Route geometry can be thousands of points for a long drive; checking
// every candidate against every point would be wasteful, so the route
// is downsampled to this many points before distance checks.
const MAX_ROUTE_SAMPLE_POINTS = 80;

export interface NearbyService {
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
}

export interface NearbyServices {
  hospitals: NearbyService[];
  policeStations: NearbyService[];
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function sampleRoute(routeCoords: [number, number][], maxPoints: number): [number, number][] {
  if (routeCoords.length <= maxPoints) return routeCoords;
  const step = routeCoords.length / maxPoints;
  const sampled: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) sampled.push(routeCoords[Math.floor(i * step)]);
  return sampled;
}

// Nearest distance from a point to any sampled route vertex - an
// approximation of distance-to-route (not a true point-to-segment
// projection), which is precise enough at road/city scales for
// deciding whether something counts as "along the way."
function distanceToRoute(lat: number, lng: number, sampledRoute: [number, number][]): number {
  let min = Infinity;
  for (const [routeLng, routeLat] of sampledRoute) {
    const d = haversineMeters(lat, lng, routeLat, routeLng);
    if (d < min) min = d;
  }
  return min;
}

// routeCoords is [lng, lat][] - OSRM/GeoJSON coordinate order, matching
// what fetchOsrmRoute (route-calculation.ts) returns.
export async function fetchNearbyServices(routeCoords: [number, number][]): Promise<NearbyServices> {
  if (routeCoords.length === 0) return { hospitals: [], policeStations: [] };

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of routeCoords) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  const padDeg = (CORRIDOR_BUFFER_METERS / 111000) * 1.2;
  minLat -= padDeg;
  maxLat += padDeg;
  minLng -= padDeg;
  maxLng += padDeg;

  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
  const query = `[out:json][timeout:20];(node["amenity"="hospital"](${bbox});way["amenity"="hospital"](${bbox});node["amenity"="police"](${bbox});way["amenity"="police"](${bbox}););out center;`;

  const resp = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`Overpass API returned HTTP ${resp.status}`);
  const data: any = await resp.json();

  const sampledRoute = sampleRoute(routeCoords, MAX_ROUTE_SAMPLE_POINTS);
  const hospitals: NearbyService[] = [];
  const policeStations: NearbyService[] = [];

  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    const distanceMeters = Math.round(distanceToRoute(lat, lng, sampledRoute));
    if (distanceMeters > CORRIDOR_BUFFER_METERS) continue;

    const amenity = el.tags?.amenity;
    const name = el.tags?.name?.trim() || (amenity === "hospital" ? "Unnamed hospital" : "Unnamed police station");
    const entry: NearbyService = { name, lat, lng, distanceMeters };

    if (amenity === "hospital") hospitals.push(entry);
    else if (amenity === "police") policeStations.push(entry);
  }

  hospitals.sort((a, b) => a.distanceMeters - b.distanceMeters);
  policeStations.sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    hospitals: hospitals.slice(0, MAX_RESULTS_PER_CATEGORY),
    policeStations: policeStations.slice(0, MAX_RESULTS_PER_CATEGORY),
  };
}
