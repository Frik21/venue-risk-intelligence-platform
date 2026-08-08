import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, plansTable, tasksTable } from "@workspace/db";
import { z } from "zod";
import { PLAN_CHECKLIST_ITEMS } from "../lib/plan-checklist";

const router: IRouter = Router();

function formatPlan(row: typeof plansTable.$inferSelect) {
  const stored = (row.checklist as Record<string, boolean>) ?? {};
  const checklist = PLAN_CHECKLIST_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    checked: stored[item.key] === true,
  }));
  return {
    id: row.id,
    taskId: row.taskId,
    checklist,
    checkedCount: checklist.filter((c) => c.checked).length,
    totalCount: checklist.length,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// A Plan exists implicitly the moment its Task does - lazily created on
// first fetch (same pattern osint.ts already uses for OSINT_TEMPLATES)
// rather than requiring a separate "create plan" step a CPO would have
// to remember to do.
router.get("/tasks/:taskId/plan", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid task id" }); return; }

  const [task] = await db.select({ id: tasksTable.id }).from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  let [plan] = await db.select().from(plansTable).where(eq(plansTable.taskId, taskId));
  if (!plan) {
    [plan] = await db.insert(plansTable).values({ taskId, checklist: {} }).returning();
  }

  res.json(formatPlan(plan));
});

const ChecklistUpdateSchema = z.object({
  key: z.string(),
  checked: z.boolean(),
});

router.patch("/plans/:id/checklist", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ChecklistUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (!PLAN_CHECKLIST_ITEMS.some((item) => item.key === parsed.data.key)) {
    res.status(400).json({ error: `Unknown checklist item "${parsed.data.key}"` });
    return;
  }

  const [existing] = await db.select().from(plansTable).where(eq(plansTable.id, id));
  if (!existing) { res.status(404).json({ error: "Plan not found" }); return; }

  const nextChecklist = { ...(existing.checklist as Record<string, boolean>), [parsed.data.key]: parsed.data.checked };

  const [updated] = await db
    .update(plansTable)
    .set({ checklist: nextChecklist })
    .where(eq(plansTable.id, id))
    .returning();

  res.json(formatPlan(updated));
});

// Submitting doesn't require every item checked - a CPO may need to
// submit a partially-complete checklist (e.g. to flag what's still
// outstanding), and gatekeeping that wasn't asked for. Re-submitting
// just moves the timestamp forward; there's no separate "unsubmit."
router.post("/plans/:id/submit", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(plansTable)
    .set({ submittedAt: new Date() })
    .where(eq(plansTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Plan not found" }); return; }

  res.json(formatPlan(updated));
});

export default router;
