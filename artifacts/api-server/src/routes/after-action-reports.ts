import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, afterActionReportsTable, tasksTable, taskAssignmentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatReport(
  row: typeof afterActionReportsTable.$inferSelect,
  taskTitle: string | null,
  cpoName: string | null,
  reviewedByName: string | null,
) {
  return {
    id: row.id,
    taskId: row.taskId,
    taskTitle,
    cpoId: row.cpoId,
    cpoName,
    summary: row.summary,
    incidentsEncountered: row.incidentsEncountered,
    routeDeviations: row.routeDeviations,
    clientFeedback: row.clientFeedback,
    recommendations: row.recommendations,
    submittedAt: row.submittedAt.toISOString(),
    reviewedBy: row.reviewedBy,
    reviewedByName,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

// Scoped to one task - the Task detail panel (pages/tasks/list.tsx)
// this backs is always asking "what's been filed against this job,"
// unlike field-incident-reports' company-wide GET.
router.get("/after-action-reports", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const taskId = Number(req.query.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "taskId query param is required" }); return; }

  const rows = await db
    .select()
    .from(afterActionReportsTable)
    .where(and(eq(afterActionReportsTable.companyId, companyId), eq(afterActionReportsTable.taskId, taskId)))
    .orderBy(desc(afterActionReportsTable.submittedAt));
  if (rows.length === 0) { res.json([]); return; }

  const [task] = await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, taskId));
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatReport(r, task?.title ?? null, userMap[r.cpoId] ?? null, r.reviewedBy != null ? userMap[r.reviewedBy] ?? null : null)));
});

const CreateReportSchema = z.object({
  taskId: z.number().int(),
  summary: z.string().min(1),
  incidentsEncountered: z.string().optional(),
  routeDeviations: z.string().optional(),
  clientFeedback: z.string().optional(),
  recommendations: z.string().optional(),
});

// The CPO's own report. cpoId always comes from the session, never the
// request body - same no-client-trust posture as checkins/field
// incident reports. taskId is required (unlike those two) and the
// roster check always runs, since an AAR is inherently about a
// specific job the CPO actually worked.
router.post("/after-action-reports", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreateReportSchema.safeParse(req.body);
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
    .insert(afterActionReportsTable)
    .values({
      companyId,
      taskId: parsed.data.taskId,
      cpoId,
      summary: parsed.data.summary,
      incidentsEncountered: parsed.data.incidentsEncountered ?? null,
      routeDeviations: parsed.data.routeDeviations ?? null,
      clientFeedback: parsed.data.clientFeedback ?? null,
      recommendations: parsed.data.recommendations ?? null,
    })
    .returning();

  const [taskRow] = await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, row.taskId));
  const [cpo] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, cpoId));
  res.status(201).json(formatReport(row, taskRow?.title ?? null, cpo?.name ?? null, null));
});

// Reviewed by whoever on Command Desk saw it - reviewedBy always comes
// from the session, same reasoning as cpoId above.
router.patch("/after-action-reports/:id", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .update(afterActionReportsTable)
    .set({ reviewedBy: req.user!.id, reviewedAt: new Date() })
    .where(and(eq(afterActionReportsTable.id, id), eq(afterActionReportsTable.companyId, companyId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Report not found" }); return; }

  const [taskRow] = await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, row.taskId));
  const [cpo] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.cpoId));
  const [reviewer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user!.id));
  res.json(formatReport(row, taskRow?.title ?? null, cpo?.name ?? null, reviewer?.name ?? null));
});

export default router;
