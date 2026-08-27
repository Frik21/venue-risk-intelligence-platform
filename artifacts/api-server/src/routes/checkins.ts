import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, checkinsTable, tasksTable, taskAssignmentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatCheckin(row: typeof checkinsTable.$inferSelect, taskTitle?: string | null, cpoName?: string | null, acknowledgedByName?: string | null) {
  return {
    id: row.id,
    taskId: row.taskId,
    taskTitle: taskTitle ?? null,
    cpoId: row.cpoId,
    cpoName: cpoName ?? null,
    type: row.type as "ok" | "panic" | "missed",
    latitude: row.latitude,
    longitude: row.longitude,
    locationLabel: row.locationLabel,
    triggeredAt: row.triggeredAt.toISOString(),
    acknowledgedBy: row.acknowledgedBy,
    acknowledgedByName: acknowledgedByName ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  };
}

// Company-wide, newest first - the Safety Alerts panel (pages/alerts/
// list.tsx) filters this down to unacknowledged panic/missed rows
// client-side, same pattern the rest of that page already uses for
// OSINT alerts. Operators Note also reads this (filtered to the
// session's own cpoId) to show "last checked in X ago" per task.
router.get("/checkins", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const rows = await db.select().from(checkinsTable).where(eq(checkinsTable.companyId, companyId)).orderBy(desc(checkinsTable.triggeredAt));
  const tasks = await db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.companyId, companyId));
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));

  const taskMap: Record<number, string> = {};
  for (const t of tasks) taskMap[t.id] = t.title;
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatCheckin(r, taskMap[r.taskId], userMap[r.cpoId], r.acknowledgedBy != null ? userMap[r.acknowledgedBy] : null)));
});

const CreateCheckinSchema = z.object({
  taskId: z.number().int(),
  type: z.enum(["ok", "panic"]),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locationLabel: z.string().optional(),
});

// The CPO's own trigger - a routine "ok" check-in or an emergency
// "panic" alert. cpoId always comes from the session, never the
// request body, matching this app's usual no-client-trust posture for
// anything security-relevant. Requires the CPO to actually be on the
// task's roster (task_assignments) - a real integrity check, not just
// a client-side courtesy, since this is the one signal a Manager's
// duty-of-care response depends on.
router.post("/checkins", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreateCheckinSchema.safeParse(req.body);
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
    .insert(checkinsTable)
    .values({
      companyId,
      taskId: parsed.data.taskId,
      cpoId,
      type: parsed.data.type,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      locationLabel: parsed.data.locationLabel ?? null,
    })
    .returning();

  const [taskRow] = await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, row.taskId));
  const [cpo] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, cpoId));
  res.status(201).json(formatCheckin(row, taskRow?.title ?? null, cpo?.name ?? null));
});

// Acknowledged by whoever on Command Desk actually saw and responded to
// it - acknowledgedBy always comes from the session, same reasoning as
// cpoId above.
router.patch("/checkins/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .update(checkinsTable)
    .set({ acknowledgedBy: req.user!.id, acknowledgedAt: new Date() })
    .where(eq(checkinsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Check-in not found" }); return; }

  const [taskRow] = await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, row.taskId));
  const [cpo] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.cpoId));
  const [ackUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user!.id));
  res.json(formatCheckin(row, taskRow?.title ?? null, cpo?.name ?? null, ackUser?.name ?? null));
});

export default router;
