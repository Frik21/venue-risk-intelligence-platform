import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, fieldIncidentReportsTable, tasksTable, taskAssignmentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatReport(
  row: typeof fieldIncidentReportsTable.$inferSelect,
  taskTitle?: string | null,
  cpoName?: string | null,
  reviewedByName?: string | null,
) {
  return {
    id: row.id,
    taskId: row.taskId ?? null,
    taskTitle: row.taskId != null ? (taskTitle ?? null) : null,
    cpoId: row.cpoId,
    cpoName: cpoName ?? null,
    severity: row.severity as "low" | "medium" | "high",
    summary: row.summary,
    latitude: row.latitude,
    longitude: row.longitude,
    locationLabel: row.locationLabel,
    occurredAt: row.occurredAt.toISOString(),
    reviewedBy: row.reviewedBy,
    reviewedByName: reviewedByName ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

// Company-wide, newest first - the Field Incident Reports panel
// (pages/alerts/list.tsx) filters this down to unreviewed rows
// client-side, same pattern already used for Safety Alerts/checkins.
router.get("/field-incident-reports", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const rows = await db
    .select()
    .from(fieldIncidentReportsTable)
    .where(eq(fieldIncidentReportsTable.companyId, companyId))
    .orderBy(desc(fieldIncidentReportsTable.occurredAt));
  const tasks = await db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.companyId, companyId));
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));

  const taskMap: Record<number, string> = {};
  for (const t of tasks) taskMap[t.id] = t.title;
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(
    rows.map((r) =>
      formatReport(r, r.taskId != null ? taskMap[r.taskId] : null, userMap[r.cpoId], r.reviewedBy != null ? userMap[r.reviewedBy] : null),
    ),
  );
});

const CreateReportSchema = z.object({
  // Optional - same reasoning as checkins.taskId: an incident isn't only
  // reportable during a formally in_progress task.
  taskId: z.number().int().optional(),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  summary: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locationLabel: z.string().optional(),
});

// The CPO's own field-filed report. cpoId always comes from the
// session, never the request body - same no-client-trust posture as
// checkins. Submitted through the frontend's offline queue
// (lib/offline-queue.ts), so this may arrive well after occurredAt if
// the CPO was in a dead zone when they filed it.
router.post("/field-incident-reports", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreateReportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const cpoId = req.user!.id;
  if (parsed.data.taskId != null) {
    const [task] = await db.select({ id: tasksTable.id }).from(tasksTable).where(and(eq(tasksTable.id, parsed.data.taskId), eq(tasksTable.companyId, companyId)));
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    const [onRoster] = await db
      .select({ id: taskAssignmentsTable.id })
      .from(taskAssignmentsTable)
      .where(and(eq(taskAssignmentsTable.taskId, parsed.data.taskId), eq(taskAssignmentsTable.operatorId, cpoId)));
    if (!onRoster) { res.status(403).json({ error: "You are not assigned to this task" }); return; }
  }

  const [row] = await db
    .insert(fieldIncidentReportsTable)
    .values({
      companyId,
      taskId: parsed.data.taskId ?? null,
      cpoId,
      severity: parsed.data.severity,
      summary: parsed.data.summary,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      locationLabel: parsed.data.locationLabel ?? null,
    })
    .returning();

  const [taskRow] = row.taskId != null ? await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, row.taskId)) : [undefined];
  const [cpo] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, cpoId));
  res.status(201).json(formatReport(row, taskRow?.title ?? null, cpo?.name ?? null));
});

// Reviewed by whoever on Command Desk saw and actioned it -
// reviewedBy always comes from the session, same reasoning as cpoId.
router.patch("/field-incident-reports/:id", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .update(fieldIncidentReportsTable)
    .set({ reviewedBy: req.user!.id, reviewedAt: new Date() })
    .where(and(eq(fieldIncidentReportsTable.id, id), eq(fieldIncidentReportsTable.companyId, companyId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Report not found" }); return; }

  const [taskRow] = row.taskId != null ? await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, row.taskId)) : [undefined];
  const [cpo] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.cpoId));
  const [reviewer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user!.id));
  res.json(formatReport(row, taskRow?.title ?? null, cpo?.name ?? null, reviewer?.name ?? null));
});

export default router;
