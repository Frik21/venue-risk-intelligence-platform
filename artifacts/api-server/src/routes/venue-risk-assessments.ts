import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, venueRiskAssessmentsTable, tasksTable, venuesTable, usersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function formatAssessment(
  row: typeof venueRiskAssessmentsTable.$inferSelect,
  venueName?: string | null,
  operatorName?: string | null,
) {
  return {
    id: row.id,
    taskId: row.taskId,
    venueId: row.venueId,
    venueName: venueName ?? null,
    operatorId: row.operatorId,
    operatorName: operatorName ?? null,
    timezone: row.timezone,
    location: row.location,
    currentOperatingConditions: row.currentOperatingConditions,
    areaAdvisories: row.areaAdvisories,
    checkpoints: row.checkpoints,
    observedHazards: row.observedHazards,
    existingControls: row.existingControls,
    recommendedActions: row.recommendedActions,
    operatorNotes: row.operatorNotes,
    attachments: row.attachments,
    status: row.status as "draft" | "submitted",
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// A venue risk assessment exists implicitly the moment a CPO opens it for
// a given (task, venue) pair - lazily created on first fetch, same
// pattern as GET /tasks/:taskId/plan. Operator/date/time/timezone are
// captured automatically here; Location is typed in by the CPO.
router.get("/tasks/:taskId/venues/:venueId/risk-assessment", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  const venueId = Number(req.params.venueId);
  if (isNaN(taskId) || isNaN(venueId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, venueId));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  let [assessment] = await db
    .select()
    .from(venueRiskAssessmentsTable)
    .where(and(eq(venueRiskAssessmentsTable.taskId, taskId), eq(venueRiskAssessmentsTable.venueId, venueId)));

  if (!assessment) {
    const timezone = typeof req.query.timezone === "string" ? req.query.timezone : null;
    [assessment] = await db
      .insert(venueRiskAssessmentsTable)
      .values({ taskId, venueId, operatorId: task.assignedTo, timezone })
      .returning();
  }

  const [operator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, assessment.operatorId));
  res.json(formatAssessment(assessment, venue.name, operator?.name));
});

const AssessmentUpdateSchema = z.object({
  location: z.string().max(2000).optional(),
  currentOperatingConditions: z.string().max(2000).optional(),
  areaAdvisories: z.string().max(2000).optional(),
  checkpoints: z.string().max(2000).optional(),
  observedHazards: z.string().max(2000).optional(),
  existingControls: z.string().max(2000).optional(),
  recommendedActions: z.string().max(2000).optional(),
  operatorNotes: z.string().max(2000).optional(),
  attachments: z.string().max(2000).optional(),
});

router.patch("/risk-assessments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = AssessmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(venueRiskAssessmentsTable)
    .set(parsed.data)
    .where(eq(venueRiskAssessmentsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Risk assessment not found" }); return; }

  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, updated.venueId));
  const [operator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, updated.operatorId));
  res.json(formatAssessment(updated, venue?.name, operator?.name));
});

// Submitting doesn't require every field filled in - same "no
// gatekeeping that wasn't asked for" reasoning as POST /plans/:id/submit.
router.post("/risk-assessments/:id/submit", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(venueRiskAssessmentsTable)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(venueRiskAssessmentsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Risk assessment not found" }); return; }

  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, updated.venueId));
  const [operator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, updated.operatorId));
  res.json(formatAssessment(updated, venue?.name, operator?.name));
});

export default router;
