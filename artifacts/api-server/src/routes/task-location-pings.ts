import { Router, type IRouter } from "express";
import { eq, and, asc, desc, gte } from "drizzle-orm";
import { db, taskLocationPingsTable, tasksTable, taskAssignmentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatPing(row: typeof taskLocationPingsTable.$inferSelect) {
  return {
    id: row.id,
    taskId: row.taskId,
    cpoId: row.cpoId,
    latitude: row.latitude,
    longitude: row.longitude,
    capturedAt: row.capturedAt.toISOString(),
  };
}

// GPS breadcrumb trail - Following Roadmap Tier 3, item 33. Task-scoped
// (unlike checkins' company-wide GET) since the one real consumer -
// a trail map on a specific Task - is always asking "what's this
// job's own route," same reasoning as after-action-reports.ts's own
// task-scoped GET.
router.get("/task-location-pings", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const taskId = Number(req.query.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "taskId query param required" }); return; }

  const rows = await db
    .select()
    .from(taskLocationPingsTable)
    .where(and(eq(taskLocationPingsTable.companyId, companyId), eq(taskLocationPingsTable.taskId, taskId)))
    .orderBy(asc(taskLocationPingsTable.capturedAt));

  res.json(rows.map(formatPing));
});

// Company-wide live map - the GSOC console's own real-time view (new
// GSOC role, see routes/companies.ts's BASE_SEATS_BY_ROLE), unlike the
// task-scoped GET above which only ever answers "what's this one job's
// route." Open to any Management-side session, same looseness every
// other role dashboard's underlying data already has - no permission
// boundary, just a different default landing page.
//
// Only a ping from the last 30 minutes counts as "live" - a breadcrumb
// is passive telemetry from Operators Note's own 5-minute timer (see
// dashboard.tsx), so a CPO whose last ping is older than that has
// either gone off the clock or lost connectivity; showing their old
// position as if it were current would be actively misleading on a
// console whose whole job is situational awareness right now, not a
// historical record (the per-task Route Trail panel is that).
const LIVE_MAP_WINDOW_MINUTES = 30;

router.get("/task-location-pings/live-map", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const cutoff = new Date(Date.now() - LIVE_MAP_WINDOW_MINUTES * 60 * 1000);

  const rows = await db
    .select({
      cpoId: taskLocationPingsTable.cpoId,
      cpoName: usersTable.name,
      taskId: taskLocationPingsTable.taskId,
      taskTitle: tasksTable.title,
      latitude: taskLocationPingsTable.latitude,
      longitude: taskLocationPingsTable.longitude,
      capturedAt: taskLocationPingsTable.capturedAt,
    })
    .from(taskLocationPingsTable)
    .innerJoin(usersTable, eq(usersTable.id, taskLocationPingsTable.cpoId))
    .innerJoin(tasksTable, eq(tasksTable.id, taskLocationPingsTable.taskId))
    .where(and(eq(taskLocationPingsTable.companyId, companyId), gte(taskLocationPingsTable.capturedAt, cutoff)))
    .orderBy(desc(taskLocationPingsTable.capturedAt));

  // Latest ping per CPO, grouped in JS rather than a window function -
  // same convention routes/companies.ts's buildCompanyRows already uses
  // for "one row per entity out of many candidate rows."
  const latestByCpo = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByCpo.has(row.cpoId)) latestByCpo.set(row.cpoId, row);
  }

  res.json(
    [...latestByCpo.values()].map((r) => ({
      cpoId: r.cpoId,
      cpoName: r.cpoName,
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      latitude: r.latitude,
      longitude: r.longitude,
      capturedAt: r.capturedAt.toISOString(),
    })),
  );
});

const CreatePingSchema = z.object({
  taskId: z.number().int(),
  latitude: z.number(),
  longitude: z.number(),
});

// The CPO's own periodic ping, fired automatically (not a button) by
// Operators Note every few minutes while a task is in_progress - see
// dashboard.tsx's breadcrumb timer. cpoId always from the session, and
// the roster check is the real integrity gate (same posture as
// checkins.ts's own taskId-present branch) - this is duty-of-care data
// a Manager might lean on, not just a UI nicety.
router.post("/task-location-pings", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreatePingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const cpoId = req.user!.id;
  const [task] = await db.select({ id: tasksTable.id }).from(tasksTable).where(and(eq(tasksTable.id, parsed.data.taskId), eq(tasksTable.companyId, companyId)));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const [onRoster] = await db
    .select({ id: taskAssignmentsTable.id })
    .from(taskAssignmentsTable)
    .where(and(eq(taskAssignmentsTable.taskId, parsed.data.taskId), eq(taskAssignmentsTable.operatorId, cpoId)));
  if (!onRoster) { res.status(403).json({ error: "You are not assigned to this task" }); return; }

  const [row] = await db
    .insert(taskLocationPingsTable)
    .values({ companyId, taskId: parsed.data.taskId, cpoId, latitude: parsed.data.latitude, longitude: parsed.data.longitude })
    .returning();

  res.status(201).json(formatPing(row));
});

export default router;
