import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, expensesTable, tasksTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const EXPENSE_CATEGORIES = ["fuel", "accommodation", "food", "parking", "tolls", "equipment", "other"] as const;

function formatExpense(row: typeof expensesTable.$inferSelect) {
  return {
    id: row.id,
    taskId: row.taskId,
    operatorId: row.operatorId,
    category: row.category as (typeof EXPENSE_CATEGORIES)[number],
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    incurredOn: row.incurredOn,
    receiptFilename: row.receiptFilename ?? null,
    receiptDataUrl: row.receiptDataUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// All expenses logged against a task, most recently incurred first.
router.get("/tasks/:taskId/expenses", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.taskId, taskId))
    .orderBy(desc(expensesTable.incurredOn));

  res.json(rows.map(formatExpense));
});

// Adds a blank expense row to a task - the operator fills it in and
// saves via PATCH, same "create empty, then edit" flow as
// task-routes.ts/venue-risk-assessments.ts.
router.post("/tasks/:taskId/expenses", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const today = new Date().toISOString().slice(0, 10);
  const [expense] = await db
    .insert(expensesTable)
    .values({ taskId, operatorId: task.assignedTo, incurredOn: today })
    .returning();

  res.status(201).json(formatExpense(expense));
});

const ExpenseUpdateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().min(1).max(10).optional(),
  description: z.string().max(2000).optional(),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "incurredOn must be YYYY-MM-DD").optional(),
  receiptFilename: z.string().max(500).nullable().optional(),
  receiptDataUrl: z.string().nullable().optional(),
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ExpenseUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(expensesTable)
    .set(parsed.data)
    .where(eq(expensesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(formatExpense(updated));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(expensesTable).where(eq(expensesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Expense not found" }); return; }

  res.status(204).end();
});

export default router;
