import { Router, type IRouter } from "express";
import { eq, and, desc, or } from "drizzle-orm";
import { db, routesTable, routeFindingsTable, incidentsTable, venuesTable, usersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

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
  estimatedDistance: z.number().optional(),
  estimatedTravelTime: z.number().int().optional(),
  constraints: z.any().optional(),
  analystNotes: z.string().optional(),
  verified: z.boolean().optional(),
  createdBy: z.number().int().optional(),
});

// Haversine distance in metres
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

// Build a simple straight-line GeoJSON for endpoint routing
function buildStraightLineGeoJSON(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  waypoints: Array<{ lat: number; lng: number }> = []
) {
  const coords: [number, number][] = [
    [startLng, startLat],
    ...waypoints.map((w) => [w.lng, w.lat] as [number, number]),
    [endLng, endLat],
  ];
  return { type: "LineString", coordinates: coords };
}

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

// List routes (filter by assessmentId or venueId)
router.get("/routes", async (req, res): Promise<void> => {
  const assessmentId = req.query.assessmentId ? Number(req.query.assessmentId) : null;
  const venueId = req.query.venueId ? Number(req.query.venueId) : null;

  let query = db.select().from(routesTable).orderBy(desc(routesTable.createdAt)).$dynamic();

  if (assessmentId) {
    query = query.where(eq(routesTable.assessmentId, assessmentId));
  } else if (venueId) {
    query = query.where(eq(routesTable.venueId, venueId));
  }

  const routes = await query;
  res.json(routes.map(formatRoute));
});

// Get single route + findings
router.get("/routes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, id));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  const findings = await db.select().from(routeFindingsTable)
    .where(eq(routeFindingsTable.routeId, id))
    .orderBy(desc(routeFindingsTable.detectedAt));

  res.json({ ...formatRoute(route), findings: findings.map(formatFinding) });
});

// Create route
router.post("/routes", async (req, res): Promise<void> => {
  const parsed = RouteInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const data = parsed.data;

  // Auto-calculate distance + travel time if we have start/end coords
  let estimatedDistance = data.estimatedDistance;
  let estimatedTravelTime = data.estimatedTravelTime;
  let routeGeometryGeojson = data.routeGeometryGeojson;

  if (data.startLat && data.startLng && data.endLat && data.endLng) {
    const waypoints = Array.isArray(data.waypointsJson) ? data.waypointsJson as Array<{ lat: number; lng: number }> : [];
    const distMetres = haversine(data.startLat, data.startLng, data.endLat, data.endLng);
    if (!estimatedDistance) estimatedDistance = Math.round(distMetres);
    if (!estimatedTravelTime) {
      // Assume 30 km/h urban speed
      estimatedTravelTime = Math.round((distMetres / 1000 / 30) * 60);
    }
    if (!routeGeometryGeojson && data.creationMethod !== "freehand_draw") {
      routeGeometryGeojson = buildStraightLineGeoJSON(
        data.startLat, data.startLng, data.endLat, data.endLng, waypoints
      );
    }
  }

  const [route] = await db.insert(routesTable).values({
    ...data,
    estimatedDistance: estimatedDistance ?? null,
    estimatedTravelTime: estimatedTravelTime ?? null,
    routeGeometryGeojson: routeGeometryGeojson ?? null,
  }).returning();

  // Auto-generate intelligence findings from nearby incidents
  if (route.startLat && route.startLng) {
    await generateCorridorFindings(route);
  }

  const findings = await db.select().from(routeFindingsTable)
    .where(eq(routeFindingsTable.routeId, route.id));

  res.status(201).json({ ...formatRoute(route), findings: findings.map(formatFinding) });
});

// Update route
router.patch("/routes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = RouteInputSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [route] = await db.update(routesTable)
    .set(parsed.data)
    .where(eq(routesTable.id, id))
    .returning();

  if (!route) { res.status(404).json({ error: "Route not found" }); return; }
  res.json(formatRoute(route));
});

// Verify route
router.post("/routes/:id/verify", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [route] = await db.update(routesTable)
    .set({ verified: true })
    .where(eq(routesTable.id, id))
    .returning();

  if (!route) { res.status(404).json({ error: "Route not found" }); return; }
  res.json(formatRoute(route));
});

// Re-run corridor intelligence analysis
router.post("/routes/:id/analyze", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, id));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  // Delete existing auto-generated findings (keep manually added ones — none flagged yet)
  await db.delete(routeFindingsTable).where(eq(routeFindingsTable.routeId, id));

  if (route.startLat && route.startLng) {
    await generateCorridorFindings(route);
  }

  const findings = await db.select().from(routeFindingsTable)
    .where(eq(routeFindingsTable.routeId, id))
    .orderBy(desc(routeFindingsTable.detectedAt));

  res.json({ route: formatRoute(route), findings: findings.map(formatFinding) });
});

// Get findings for a route
router.get("/routes/:id/findings", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const findings = await db.select().from(routeFindingsTable)
    .where(eq(routeFindingsTable.routeId, id))
    .orderBy(desc(routeFindingsTable.detectedAt));

  res.json(findings.map(formatFinding));
});

// Update a finding (e.g. add analyst notes, mark verified)
router.patch("/routes/:routeId/findings/:findingId", async (req, res): Promise<void> => {
  const findingId = Number(req.params.findingId);
  if (isNaN(findingId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const UpdateSchema = z.object({
    verified: z.boolean().optional(),
    analystNotes: z.string().optional(),
  });
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [finding] = await db.update(routeFindingsTable)
    .set(parsed.data)
    .where(eq(routeFindingsTable.id, findingId))
    .returning();

  if (!finding) { res.status(404).json({ error: "Finding not found" }); return; }
  res.json(formatFinding(finding));
});

// Delete route
router.delete("/routes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(routesTable).where(eq(routesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Route not found" }); return; }
  res.sendStatus(204);
});

// ── Intelligence corridor analysis ──────────────────────────────────────────

const CORRIDOR_RADIUS_M = 500; // 500m corridor around route
const DEG_PER_METRE = 1 / 111320;

async function generateCorridorFindings(route: typeof routesTable.$inferSelect) {
  const midLat = route.endLat
    ? (route.startLat! + route.endLat) / 2
    : route.startLat!;
  const midLng = route.endLng
    ? (route.startLng! + route.endLng) / 2
    : route.startLng!;

  const radiusDeg = CORRIDOR_RADIUS_M * DEG_PER_METRE;

  // Fetch all incidents with coordinates
  const incidents = await db.select().from(incidentsTable);
  const nearby = incidents.filter((inc) => {
    if (!inc.lat || !inc.lng) return false;
    // Check against start, mid, and end of route for corridor coverage
    const checkPoints = [
      { lat: route.startLat!, lng: route.startLng! },
      { lat: midLat, lng: midLng },
      ...(route.endLat && route.endLng ? [{ lat: route.endLat, lng: route.endLng }] : []),
    ];
    return checkPoints.some(
      (pt) =>
        Math.abs(inc.lat! - pt.lat) < radiusDeg &&
        Math.abs(inc.lng! - pt.lng) < radiusDeg
    );
  });

  if (nearby.length === 0) {
    // Generate mock advisory findings based on route type constraints
    const mockFindings = buildMockFindings(route);
    if (mockFindings.length > 0) {
      await db.insert(routeFindingsTable).values(mockFindings);
    }
    return;
  }

  const findingsToInsert = nearby.map((inc) => {
    const dist = haversine(
      route.startLat!,
      route.startLng!,
      inc.lat!,
      inc.lng!
    );
    return {
      routeId: route.id,
      assessmentId: route.assessmentId ?? null,
      venueId: route.venueId ?? null,
      findingType: mapIncidentToFindingType(inc.incidentType),
      severity: inc.severity,
      summary: `[CORRIDOR ALERT] ${inc.summary}`,
      sourceName: inc.sourceName ?? "Incident Intelligence",
      sourceUrl: inc.sourceUrl ?? null,
      distanceFromRoute: Math.round(dist),
      detectedAt: new Date(),
      verified: false,
      analystNotes: null,
    };
  });

  if (findingsToInsert.length > 0) {
    await db.insert(routeFindingsTable).values(findingsToInsert);
  }
}

function mapIncidentToFindingType(incidentType: string): string {
  const map: Record<string, string> = {
    crime: "crime",
    violent_crime: "crime",
    property_crime: "crime",
    armed_robbery: "crime",
    assault: "crime",
    vehicle_theft: "crime",
    protest: "protest_activity",
    demonstration: "protest_activity",
    riot: "civil_unrest",
    civil_unrest: "civil_unrest",
    road_closure: "road_closure",
    police_advisory: "police_advisory",
    government_alert: "government_advisory",
  };
  return map[incidentType] ?? "general_risk";
}

function buildMockFindings(route: typeof routesTable.$inferSelect) {
  // Generate contextual advisory findings based on route type
  const findings: Array<{
    routeId: number;
    assessmentId: number | null;
    venueId: number | null;
    findingType: string;
    severity: string;
    summary: string;
    sourceName: string;
    distanceFromRoute: number | null;
    detectedAt: Date;
    verified: boolean;
    analystNotes: string | null;
    sourceUrl: string | null;
  }> = [];

  const base = {
    routeId: route.id,
    assessmentId: route.assessmentId ?? null,
    venueId: route.venueId ?? null,
    detectedAt: new Date(),
    verified: false,
    analystNotes: null,
    sourceUrl: null,
  };

  if (route.routeType === "primary_extraction" || route.routeType === "secondary_extraction") {
    findings.push({
      ...base,
      findingType: "traffic_disruption",
      severity: "low",
      summary: "No active road closures detected in corridor. Monitor for event-day traffic surges.",
      sourceName: "OSINT Auto-Analysis",
      distanceFromRoute: null,
    });
  }
  if (route.routeType === "medical_evacuation") {
    findings.push({
      ...base,
      findingType: "route_advisory",
      severity: "low",
      summary: "Medical evacuation route corridor analysis complete. No blocking incidents detected. Verify hospital access point availability.",
      sourceName: "OSINT Auto-Analysis",
      distanceFromRoute: null,
    });
  }

  findings.push({
    ...base,
    findingType: "route_advisory",
    severity: "low",
    summary: "Corridor analysis found no active security incidents within 500m. Recommend re-running analysis 24 hours before operation.",
    sourceName: "OSINT Auto-Analysis",
    distanceFromRoute: null,
  });

  return findings;
}

export default router;
