import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, taskLocationPingsTable, tasksTable, taskAssignmentsTable } from "@workspace/db";
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
