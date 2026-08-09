import { Router, type IRouter } from "express";
import { eq, max } from "drizzle-orm";
import { db, taskRoutesTable, tasksTable } from "@workspace/db";
import { z } from "zod";
import { fetchOsrmRoute } from "../lib/route-calculation";
import { fetchTrafficAwareRoute, TrafficNotConfiguredError } from "../lib/traffic";

const router: IRouter = Router();

function formatRoute(row: typeof taskRoutesTable.$inferSelect) {
  return {
    id: row.id,
    taskId: row.taskId,
    slotIndex: row.slotIndex,
    startLabel: row.startLabel,
    startLat: row.startLat,
    startLng: row.startLng,
    endLabel: row.endLabel,
    endLat: row.endLat,
    endLng: row.endLng,
    routeGeometryGeojson: row.routeGeometryGeojson,
    distanceMeters: row.distanceMeters,
    staticTravelTimeSeconds: row.staticTravelTimeSeconds,
    liveTravelTimeSeconds: row.liveTravelTimeSeconds,
    trafficDelaySeconds: row.trafficDelaySeconds,
    trafficCheckedAt: row.trafficCheckedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/tasks/:taskId/routes", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(taskRoutesTable)
    .where(eq(taskRoutesTable.taskId, taskId))
    .orderBy(taskRoutesTable.slotIndex);

  res.json(rows.map(formatRoute));
});

// Adds another route slot to a task (e.g. primary, then alternative) -
// starts empty; start/end are set via PATCH once the CPO picks them.
router.post("/tasks/:taskId/routes", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [task] = await db.select({ id: tasksTable.id }).from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const [{ highest }] = await db
    .select({ highest: max(taskRoutesTable.slotIndex) })
    .from(taskRoutesTable)
    .where(eq(taskRoutesTable.taskId, taskId));
  const nextSlot = (highest ?? 0) + 1;

  const [route] = await db.insert(taskRoutesTable).values({ taskId, slotIndex: nextSlot }).returning();
  res.status(201).json(formatRoute(route));
});

const RouteUpdateSchema = z.object({
  startLabel: z.string().max(500).optional(),
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  endLabel: z.string().max(500).optional(),
  endLat: z.number().optional(),
  endLng: z.number().optional(),
});

router.patch("/task-routes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = RouteUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(taskRoutesTable)
    .set(parsed.data)
    .where(eq(taskRoutesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Route not found" }); return; }
  res.json(formatRoute(updated));
});

// Computes geometry/distance/static duration via OSRM (free, always
// attempted) and live-traffic ETA via TomTom (only if configured) - a
// missing/failing traffic check doesn't block getting the route itself,
// it just leaves the traffic fields as they were.
router.post("/task-routes/:id/calculate", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [route] = await db.select().from(taskRoutesTable).where(eq(taskRoutesTable.id, id));
  if (!route) { res.status(404).json({ error: "Route not found" }); return; }

  if (route.startLat == null || route.startLng == null || route.endLat == null || route.endLng == null) {
    res.status(422).json({ error: "Set both a start and end point before calculating this route" });
    return;
  }

  let osrm;
  try {
    osrm = await fetchOsrmRoute(route.startLat, route.startLng, route.endLat, route.endLng);
  } catch (err) {
    console.error(`OSRM route calculation failed for route ${id}:`, err);
    res.status(502).json({ error: "Route calculation failed" });
    return;
  }

  let liveTravelTimeSeconds = route.liveTravelTimeSeconds;
  let trafficDelaySeconds = route.trafficDelaySeconds;
  let trafficCheckedAt = route.trafficCheckedAt;
  try {
    const traffic = await fetchTrafficAwareRoute(route.startLat, route.startLng, route.endLat, route.endLng);
    liveTravelTimeSeconds = traffic.liveTravelTimeSeconds;
    trafficDelaySeconds = traffic.trafficDelaySeconds;
    trafficCheckedAt = new Date();
  } catch (err) {
    if (!(err instanceof TrafficNotConfiguredError)) {
      console.error(`Traffic-aware ETA failed for route ${id}:`, err);
    }
  }

  const [updated] = await db
    .update(taskRoutesTable)
    .set({
      routeGeometryGeojson: osrm.geometry,
      distanceMeters: osrm.distanceMeters,
      staticTravelTimeSeconds: osrm.durationSeconds,
      liveTravelTimeSeconds,
      trafficDelaySeconds,
      trafficCheckedAt,
    })
    .where(eq(taskRoutesTable.id, id))
    .returning();

  res.json(formatRoute(updated));
});

export default router;
