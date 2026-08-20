import { Router, type IRouter } from "express";
import { eq, and, max, desc, or, ne } from "drizzle-orm";
import { db, venueRiskAssessmentsTable, tasksTable, usersTable, venuesTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatAssessment(row: typeof venueRiskAssessmentsTable.$inferSelect, operatorName?: string | null) {
  return {
    id: row.id,
    taskId: row.taskId,
    slotIndex: row.slotIndex,
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

async function withOperatorName(row: typeof venueRiskAssessmentsTable.$inferSelect) {
  const [operator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.operatorId));
  return formatAssessment(row, operator?.name);
}

// Global feed of CPO field notes across every task - powers the
// Management Dashboard's "Area Advisories" / "Current Operating
// Conditions" items, which have no destination of their own (the
// per-task list route below only covers one task at a time). Only
// rows where the CPO actually wrote something into one of those two
// fields are returned - an empty default("") value isn't a real note.
router.get("/venue-risk-assessments", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  const rows = await db
    .select()
    .from(venueRiskAssessmentsTable)
    .where(and(
      eq(venueRiskAssessmentsTable.companyId, companyId),
      or(ne(venueRiskAssessmentsTable.areaAdvisories, ""), ne(venueRiskAssessmentsTable.currentOperatingConditions, "")),
    ))
    .orderBy(desc(venueRiskAssessmentsTable.updatedAt))
    .limit(30);

  const taskIds = [...new Set(rows.map((r) => r.taskId))];
  const tasks = taskIds.length
    ? await db.select({ id: tasksTable.id, title: tasksTable.title, venueId: tasksTable.venueId }).from(tasksTable)
    : [];
  const taskMap: Record<number, { title: string; venueId: number | null }> = {};
  for (const t of tasks) taskMap[t.id] = { title: t.title, venueId: t.venueId };

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city }).from(venuesTable);
  const venueMap: Record<number, { name: string; city: string }> = {};
  for (const v of venues) venueMap[v.id] = { name: v.name, city: v.city };

  const operators = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const operatorMap: Record<number, string> = {};
  for (const o of operators) operatorMap[o.id] = o.name;

  res.json(
    rows.map((r) => {
      const task = taskMap[r.taskId];
      const venue = task?.venueId != null ? venueMap[task.venueId] : undefined;
      return {
        id: r.id,
        taskId: r.taskId,
        taskTitle: task?.title ?? null,
        venueName: venue?.name ?? null,
        venueCity: venue?.city ?? null,
        operatorName: operatorMap[r.operatorId] ?? null,
        location: r.location,
        currentOperatingConditions: r.currentOperatingConditions,
        areaAdvisories: r.areaAdvisories,
        updatedAt: r.updatedAt.toISOString(),
      };
    }),
  );
});

// All the risk assessment slots for a task, ordered 1, 2, 3...
router.get("/tasks/:taskId/risk-assessments", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(venueRiskAssessmentsTable)
    .where(eq(venueRiskAssessmentsTable.taskId, taskId))
    .orderBy(venueRiskAssessmentsTable.slotIndex);

  const operators = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const operatorMap: Record<number, string> = {};
  for (const o of operators) operatorMap[o.id] = o.name;

  res.json(rows.map((r) => formatAssessment(r, operatorMap[r.operatorId])));
});

// Adds another assessment slot to a task - lets a CPO cover several
// physical locations under one task without a real venue record
// existing for each one (Location is typed in by the CPO on the
// assessment itself).
router.post("/tasks/:taskId/risk-assessments", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.assignedTo === null) { res.status(400).json({ error: "Task has no assigned CPO yet" }); return; }

  const [{ highest }] = await db
    .select({ highest: max(venueRiskAssessmentsTable.slotIndex) })
    .from(venueRiskAssessmentsTable)
    .where(eq(venueRiskAssessmentsTable.taskId, taskId));
  const nextSlot = (highest ?? 0) + 1;

  const timezone = typeof req.body?.timezone === "string" ? req.body.timezone : null;
  const [assessment] = await db
    .insert(venueRiskAssessmentsTable)
    .values({ companyId: task.companyId, taskId, slotIndex: nextSlot, operatorId: task.assignedTo, timezone })
    .returning();

  res.status(201).json(await withOperatorName(assessment));
});

router.get("/risk-assessments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [assessment] = await db.select().from(venueRiskAssessmentsTable).where(eq(venueRiskAssessmentsTable.id, id));
  if (!assessment) { res.status(404).json({ error: "Risk assessment not found" }); return; }

  res.json(await withOperatorName(assessment));
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

  res.json(await withOperatorName(updated));
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

  res.json(await withOperatorName(updated));
});

export default router;
