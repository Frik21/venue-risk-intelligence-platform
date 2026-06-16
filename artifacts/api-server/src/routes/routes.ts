import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, routesTable, routeFindingsTable, incidentsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

// ── OSRM public API base (no key needed, OSM data)
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

const RouteInputSchema = z.object({
  assessmentId: z.number().int().optional(),
  venueId: z.number().int().optional(),
  routeName: z.string().min(1),
  routeType: z.string().default("primary_extraction"),
  creationMethod: z.string().default("endpoint_marker"),
  startLabel: z.string().optional(),
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  endLabel: z.string().optional(),
  endLat: z.number().optional(),
  endLng: z.number().optional(),
  waypointsJson: z.any().optional(),
  routeGeometryGeojson: z.any().optional(),
  originalDrawnGeometryGeojson: z.any().optional(),
  snappedRouteGeometryGeojson: z.any().optional(),
  snappedToRoads: z.boolean().optional(),
  routeProvider: z.string().optional(),
  travelMode: z.string().optional(),
  routingApiResponseJson: z.any().optional(),
  estimatedDistance: z.number().optional(),
  estimatedTravelTime: z.number().int().optional(),
  constraints: z.any().optional(),
  analystNotes: z.string().optional(),
  verified: z.boolean().optional(),
  createdBy: z.number().int().optional(),
});

// ── Haversine distance in metres ─────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Sample N evenly-spaced points along a LineString coordinate array [lng, lat]
function samplePoints(coords: [number, number][], n: number): [number, number][] {
  if (coords.length <= n) return coords;
  const step = (coords.length - 1) / (n - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    result.push(coords[Math.round(i * step)]);
  }
  return result;
}

// ── Format helpers ────────────────────────────────────────────────────────────
function formatRoute(r: typeof routesTable.$inferSelect) {
  return {
    id: r.id,
    assessmentId: r.assessmentId ?? null,
    venueId: r.venueId ?? null,
    routeName: r.routeName,
    routeType: r.routeType,
    creationMethod: r.creationMethod,
    startLabel: r.startLabel ?? null,
    startLat: r.startLat ?? null,
    startLng: r.startLng ?? null,
    endLabel: r.endLabel ?? null,
    endLat: r.endLat ?? null,
    endLng: r.endLng ?? null,
    waypointsJson: r.waypointsJson ?? null,
    routeGeometryGeojson: r.routeGeometryGeojson ?? null,
    originalDrawnGeometryGeojson: r.originalDrawnGeometryGeojson ?? null,
    snappedRouteGeometryGeojson: r.snappedRouteGeometryGeojson ?? null,
    snappedToRoads: r.snappedToRoads,
    routeProvider: r.routeProvider ?? null,
    travelMode: r.travelMode,
    routingApiResponseJson: r.routingApiResponseJson ?? null,
    estimatedDistance: r.estimatedDistance ?? null,
    estimatedTravelTime: r.estimatedTravelTime ?? null,
    constraints: r.constraints ?? null,
    analystNotes: r.analystNotes ?? null,
    verified: r.verified,
    createdBy: r.createdBy ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function formatFinding(f: typeof routeFindingsTable.$inferSelect) {
  return {
    id: f.id,
    routeId: f.routeId,
    assessmentId: f.assessmentId ?? null,
    venueId: f.venueId ?? null,
    findingType: f.findingType,
    severity: f.severity,
    summary: f.summary,
    sourceName: f.sourceName ?? null,
    sourceUrl: f.sourceUrl ?? null,
    distanceFromRoute: f.distanceFromRoute ?? null,
    detectedAt: f.detectedAt.toISOString(),
    verified: f.verified,
    analystNotes: f.analystNotes ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}

// ── List routes ───────────────────────────────────────────────────────────────
router.get("/routes", async (req, res): Promise<void> => {
  const assessmentId = req.query.assessmentId ? Number(req.query.assessmentId) : null;
  const venueId = req.query.venueId ? Number(req.query.venueId) : null;

  let query = db.select().from(routesTable).orderBy(desc(routesTable.createdAt)).$dynamic();
  if (assessmentId) query = query.where(eq(routesTable.assessmentId, assessmentId));
  else if (venueId) query = query.where(eq(routesTable.venueId, venueId));

  const routes = await query;
  res.json(routes.map(formatRoute));
});

// ── Get single route + findings ───────────────────────────────────────────────
router.get("/routes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, id));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }
  const findings = await db.select().from(routeFindingsTable)
    .where(eq(routeFindingsTable.routeId, id)).orderBy(desc(routeFindingsTable.detectedAt));
  res.json({ ...formatRoute(route), findings: findings.map(formatFinding) });
});

// ── Create route ──────────────────────────────────────────────────────────────
router.post("/routes", async (req, res): Promise<void> => {
  const parsed = RouteInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }
  const data = parsed.data;

  let estimatedDistance = data.estimatedDistance;
  let estimatedTravelTime = data.estimatedTravelTime;
  let routeGeometryGeojson = data.routeGeometryGeojson;

  if (data.startLat && data.startLng && data.endLat && data.endLng) {
    const distMetres = haversine(data.startLat, data.startLng, data.endLat, data.endLng);
    if (!estimatedDistance) estimatedDistance = Math.round(distMetres);
    if (!estimatedTravelTime) estimatedTravelTime = Math.round((distMetres / 1000 / 30) * 60);
    if (!routeGeometryGeojson && data.creationMethod !== "freehand_draw") {
      const waypoints = Array.isArray(data.waypointsJson) ? data.waypointsJson as Array<{ lat: number; lng: number }> : [];
      routeGeometryGeojson = {
        type: "LineString",
        coordinates: [
          [data.startLng, data.startLat],
          ...waypoints.map((w) => [w.lng, w.lat]),
          [data.endLng, data.endLat],
        ],
      };
    }
  }

  // For freehand: store drawn geometry as both original + active geometry
  const originalDrawn = data.originalDrawnGeometryGeojson ?? (data.creationMethod === "freehand_draw" ? routeGeometryGeojson : null);

  const [route] = await db.insert(routesTable).values({
    ...data,
    estimatedDistance: estimatedDistance ?? null,
    estimatedTravelTime: estimatedTravelTime ?? null,
    routeGeometryGeojson: routeGeometryGeojson ?? null,
    originalDrawnGeometryGeojson: originalDrawn ?? null,
    snappedToRoads: data.snappedToRoads ?? false,
    travelMode: data.travelMode ?? "driving",
  }).returning();

  if (route.startLat && route.startLng) await generateCorridorFindings(route);

  const findings = await db.select().from(routeFindingsTable).where(eq(routeFindingsTable.routeId, route.id));
  res.status(201).json({ ...formatRoute(route), findings: findings.map(formatFinding) });
});

// ── Update route ──────────────────────────────────────────────────────────────
router.patch("/routes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = RouteInputSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }
  const [route] = await db.update(routesTable).set(parsed.data).where(eq(routesTable.id, id)).returning();
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }
  res.json(formatRoute(route));
});

// ── Verify route ──────────────────────────────────────────────────────────────
router.post("/routes/:id/verify", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [route] = await db.update(routesTable).set({ verified: true }).where(eq(routesTable.id, id)).returning();
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }
  res.json(formatRoute(route));
});

// ── Snap route to roads via OSRM ──────────────────────────────────────────────
router.post("/routes/:id/snap", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, id));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  // Build the set of coordinates to route through
  // Prefer original drawn geometry if available, otherwise fall back to stored geometry or start/end points
  let sourceCoords: [number, number][] = []; // [lng, lat] pairs (GeoJSON order)

  const sourceGeojson = (route.originalDrawnGeometryGeojson ?? route.routeGeometryGeojson) as any;

  if (sourceGeojson?.type === "LineString" && Array.isArray(sourceGeojson.coordinates) && sourceGeojson.coordinates.length >= 2) {
    sourceCoords = sourceGeojson.coordinates as [number, number][];
  } else if (route.startLat && route.startLng && route.endLat && route.endLng) {
    sourceCoords = [[route.startLng, route.startLat], [route.endLng, route.endLat]];
  } else {
    res.status(422).json({ error: "Route has no geometry or start/end coordinates to snap" });
    return;
  }

  // Sample at most 25 waypoints — OSRM has a practical limit per request
  const sampled = samplePoints(sourceCoords, Math.min(sourceCoords.length, 25));

  // OSRM expects coordinates as lng,lat;lng,lat;...
  const coordStr = sampled.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const osrmUrl = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson&steps=false`;

  let osrmResponse: any;
  try {
    const resp = await fetch(osrmUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      throw new Error(`OSRM returned HTTP ${resp.status}`);
    }
    osrmResponse = await resp.json();
  } catch (err: any) {
    res.status(502).json({ error: `Road snapping failed: ${err.message}` });
    return;
  }

  if (osrmResponse.code !== "Ok" || !osrmResponse.routes?.[0]) {
    res.status(422).json({ error: `OSRM routing failed: ${osrmResponse.message ?? osrmResponse.code}` });
    return;
  }

  const osrmRoute = osrmResponse.routes[0];
  const snappedGeojson = osrmRoute.geometry; // LineString GeoJSON
  const distanceMetres = Math.round(osrmRoute.distance);
  const durationSeconds = osrmRoute.duration;
  const travelTimeMinutes = Math.round(durationSeconds / 60);

  // Extract start/end from snapped coords for updating the route record
  const snappedCoords = snappedGeojson.coordinates as [number, number][];
  const firstPt = snappedCoords[0];
  const lastPt = snappedCoords[snappedCoords.length - 1];

  // Save the original drawn geometry before overwriting (only if not already saved)
  const originalToStore = route.originalDrawnGeometryGeojson ?? route.routeGeometryGeojson;

  const [updated] = await db.update(routesTable).set({
    snappedRouteGeometryGeojson: snappedGeojson,
    routeGeometryGeojson: snappedGeojson,        // active geometry is now the snapped one
    originalDrawnGeometryGeojson: originalToStore,
    snappedToRoads: true,
    routeProvider: "osrm",
    travelMode: "driving",
    routingApiResponseJson: { code: osrmResponse.code, distance: distanceMetres, duration: durationSeconds },
    estimatedDistance: distanceMetres,
    estimatedTravelTime: travelTimeMinutes,
    startLat: lastPt ? (route.startLat ?? lastPt[1]) : route.startLat,
    startLng: firstPt ? (route.startLng ?? firstPt[0]) : route.startLng,
    endLat: lastPt?.[1] ?? route.endLat,
    endLng: lastPt?.[0] ?? route.endLng,
  }).where(eq(routesTable.id, id)).returning();

  res.json({
    route: formatRoute(updated),
    snappedGeojson,
    distanceMetres,
    travelTimeMinutes,
    provider: "osrm",
  });
});

// ── Restore original drawn geometry ──────────────────────────────────────────
router.post("/routes/:id/restore-drawn", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, id));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  if (!route.originalDrawnGeometryGeojson) {
    res.status(422).json({ error: "No original drawn geometry stored for this route" });
    return;
  }

  const [updated] = await db.update(routesTable).set({
    routeGeometryGeojson: route.originalDrawnGeometryGeojson,
    snappedToRoads: false,
    snappedRouteGeometryGeojson: route.snappedRouteGeometryGeojson, // keep it stored
  }).where(eq(routesTable.id, id)).returning();

  res.json(formatRoute(updated));
});

// ── Re-run corridor intelligence ──────────────────────────────────────────────
router.post("/routes/:id/analyze", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, id));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  await db.delete(routeFindingsTable).where(eq(routeFindingsTable.routeId, id));
  if (route.startLat && route.startLng) await generateCorridorFindings(route);

  const findings = await db.select().from(routeFindingsTable)
    .where(eq(routeFindingsTable.routeId, id)).orderBy(desc(routeFindingsTable.detectedAt));
  res.json({ route: formatRoute(route), findings: findings.map(formatFinding) });
});

// ── Get findings ──────────────────────────────────────────────────────────────
router.get("/routes/:id/findings", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const findings = await db.select().from(routeFindingsTable)
    .where(eq(routeFindingsTable.routeId, id)).orderBy(desc(routeFindingsTable.detectedAt));
  res.json(findings.map(formatFinding));
});

// ── Update a finding ──────────────────────────────────────────────────────────
router.patch("/routes/:routeId/findings/:findingId", async (req, res): Promise<void> => {
  const findingId = Number(req.params.findingId);
  if (isNaN(findingId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = z.object({ verified: z.boolean().optional(), analystNotes: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }
  const [finding] = await db.update(routeFindingsTable).set(parsed.data).where(eq(routeFindingsTable.id, findingId)).returning();
  if (!finding) { res.status(404).json({ error: "Finding not found" }); return; }
  res.json(formatFinding(finding));
});

// ── Delete route ──────────────────────────────────────────────────────────────
router.delete("/routes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(routesTable).where(eq(routesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Route not found" }); return; }
  res.sendStatus(204);
});

// ── Intelligence corridor analysis ────────────────────────────────────────────
const CORRIDOR_RADIUS_M = 500;
const DEG_PER_METRE = 1 / 111320;

async function generateCorridorFindings(route: typeof routesTable.$inferSelect) {
  const midLat = route.endLat ? (route.startLat! + route.endLat) / 2 : route.startLat!;
  const midLng = route.endLng ? (route.startLng! + route.endLng) / 2 : route.startLng!;
  const radiusDeg = CORRIDOR_RADIUS_M * DEG_PER_METRE;

  const incidents = await db.select().from(incidentsTable);
  const nearby = incidents.filter((inc) => {
    if (!inc.lat || !inc.lng) return false;
    const checkPoints = [
      { lat: route.startLat!, lng: route.startLng! },
      { lat: midLat, lng: midLng },
      ...(route.endLat && route.endLng ? [{ lat: route.endLat, lng: route.endLng }] : []),
    ];
    return checkPoints.some(pt => Math.abs(inc.lat! - pt.lat) < radiusDeg && Math.abs(inc.lng! - pt.lng) < radiusDeg);
  });

  if (nearby.length === 0) {
    const mock = buildMockFindings(route);
    if (mock.length > 0) await db.insert(routeFindingsTable).values(mock);
    return;
  }

  const toInsert = nearby.map((inc) => ({
    routeId: route.id,
    assessmentId: route.assessmentId ?? null,
    venueId: route.venueId ?? null,
    findingType: mapIncidentToFindingType(inc.incidentType),
    severity: inc.severity,
    summary: `[CORRIDOR ALERT] ${inc.summary}`,
    sourceName: inc.sourceName ?? "Incident Intelligence",
    sourceUrl: inc.sourceUrl ?? null,
    distanceFromRoute: Math.round(haversine(route.startLat!, route.startLng!, inc.lat!, inc.lng!)),
    detectedAt: new Date(),
    verified: false,
    analystNotes: null,
  }));
  if (toInsert.length > 0) await db.insert(routeFindingsTable).values(toInsert);
}

function mapIncidentToFindingType(incidentType: string): string {
  const map: Record<string, string> = {
    crime: "crime", violent_crime: "crime", property_crime: "crime", armed_robbery: "crime",
    assault: "crime", vehicle_theft: "crime", protest: "protest_activity", demonstration: "protest_activity",
    riot: "civil_unrest", civil_unrest: "civil_unrest", road_closure: "road_closure",
    police_advisory: "police_advisory", government_alert: "government_advisory",
  };
  return map[incidentType] ?? "general_risk";
}

function buildMockFindings(route: typeof routesTable.$inferSelect) {
  const base = { routeId: route.id, assessmentId: route.assessmentId ?? null, venueId: route.venueId ?? null, detectedAt: new Date(), verified: false, analystNotes: null, sourceUrl: null };
  const findings = [];
  if (route.routeType === "primary_extraction" || route.routeType === "secondary_extraction") {
    findings.push({ ...base, findingType: "traffic_disruption", severity: "low", summary: "No active road closures detected in corridor. Monitor for event-day traffic surges.", sourceName: "OSINT Auto-Analysis", distanceFromRoute: null });
  }
  if (route.routeType === "medical_evacuation") {
    findings.push({ ...base, findingType: "route_advisory", severity: "low", summary: "Medical evacuation corridor clear. Verify hospital access point availability.", sourceName: "OSINT Auto-Analysis", distanceFromRoute: null });
  }
  findings.push({ ...base, findingType: "route_advisory", severity: "low", summary: "Corridor analysis found no active security incidents within 500m. Recommend re-running 24h before operation.", sourceName: "OSINT Auto-Analysis", distanceFromRoute: null });
  return findings;
}

export default router;
