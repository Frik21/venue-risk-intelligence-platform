import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, timesheetEntriesTable, tasksTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function formatEntry(row: typeof timesheetEntriesTable.$inferSelect, taskTitle?: string | null) {
  return {
    id: row.id,
    userId: row.userId,
    taskId: row.taskId,
    taskTitle: taskTitle ?? null,
    date: row.date,
    hoursWorked: row.hoursWorked,
    dayHours: row.dayHours,
    nightHours: row.nightHours,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Every logged day for this operator - Profile > Timesheet fetches
// once and works with the full list client-side (small, personal
// dataset), same pattern as Tasks/Venues elsewhere in this app.
router.get("/users/:userId/timesheet", async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(timesheetEntriesTable)
    .where(eq(timesheetEntriesTable.userId, userId))
    .orderBy(timesheetEntriesTable.date);

  const taskIds = [...new Set(rows.map((r) => r.taskId).filter((id): id is number => id !== null))];
  const tasks = taskIds.length
    ? await db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable)
    : [];
  const taskMap: Record<number, string> = {};
  for (const t of tasks) taskMap[t.id] = t.title;

  res.json(rows.map((r) => formatEntry(r, r.taskId !== null ? (taskMap[r.taskId] ?? null) : null)));
});

const TimesheetEntrySchema = z.object({
  taskId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  dayHours: z.number().min(0).max(24),
  nightHours: z.number().min(0).max(24),
  notes: z.string().max(2000).optional(),
});

// Upserts the entry for this operator+date+task - clicking an
// already-logged calendar day/task combination edits the same row
// instead of creating a second one, enforced by the table's
// (user_id, date, task_id) unique constraint. A CPO logging hours
// against two different tasks on the same day gets two rows.
router.post("/users/:userId/timesheet", async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = TimesheetEntrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [task] = await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, parsed.data.taskId));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const hoursWorked = parsed.data.dayHours + parsed.data.nightHours;
  const [entry] = await db
    .insert(timesheetEntriesTable)
    .values({
      userId,
      taskId: parsed.data.taskId,
      date: parsed.data.date,
      hoursWorked,
      dayHours: parsed.data.dayHours,
      nightHours: parsed.data.nightHours,
      notes: parsed.data.notes ?? "",
    })
    .onConflictDoUpdate({
      target: [timesheetEntriesTable.userId, timesheetEntriesTable.date, timesheetEntriesTable.taskId],
      set: { hoursWorked, dayHours: parsed.data.dayHours, nightHours: parsed.data.nightHours, notes: parsed.data.notes ?? "" },
    })
    .returning();

  res.status(201).json(formatEntry(entry, task.title));
});

router.delete("/timesheet/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(timesheetEntriesTable).where(eq(timesheetEntriesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Timesheet entry not found" }); return; }

  res.status(204).end();
});

export default router;
