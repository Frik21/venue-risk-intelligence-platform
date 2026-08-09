import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, timesheetEntriesTable, tasksTable, usersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function formatEntry(row: typeof timesheetEntriesTable.$inferSelect, taskTitle?: string | null, userName?: string | null) {
  return {
    id: row.id,
    userId: row.userId,
    userName: userName ?? null,
    taskId: row.taskId,
    taskTitle: taskTitle ?? null,
    date: row.date,
    hoursWorked: row.hoursWorked,
    dayHours: row.dayHours,
    nightHours: row.nightHours,
    notes: row.notes,
    approved: row.approved,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
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

// Every CPO's logged hours for this task, most recent first - powers
// the Manager's review/approve action on the Tasks page. A task can
// have several CPOs (the roster), each logging their own hours.
router.get("/tasks/:taskId/timesheet-entries", async (req, res): Promise<void> => {
  const taskId = Number(req.params.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(timesheetEntriesTable)
    .where(eq(timesheetEntriesTable.taskId, taskId))
    .orderBy(desc(timesheetEntriesTable.date));

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatEntry(r, null, userMap[r.userId] ?? null)));
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
// Editing an entry (whether or not it was already approved) resets
// approved to false - a correction always needs re-review.
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
      set: {
        hoursWorked, dayHours: parsed.data.dayHours, nightHours: parsed.data.nightHours, notes: parsed.data.notes ?? "",
        approved: false, approvedBy: null, approvedAt: null,
      },
    })
    .returning();

  res.status(201).json(formatEntry(entry, task.title));
});

const ApproveSchema = z.object({
  approvedBy: z.number().int(),
});

// Manager review/approve - only approved entries count toward
// Personnel Costs (see routes/personnel-costs.ts), per direct product
// direction: the CPO logs hours, but a Manager has to add them to the
// costing.
router.post("/timesheet/:id/approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ApproveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [entry] = await db
    .update(timesheetEntriesTable)
    .set({ approved: true, approvedBy: parsed.data.approvedBy, approvedAt: new Date() })
    .where(eq(timesheetEntriesTable.id, id))
    .returning();

  if (!entry) { res.status(404).json({ error: "Timesheet entry not found" }); return; }
  res.json(formatEntry(entry));
});

router.delete("/timesheet/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(timesheetEntriesTable).where(eq(timesheetEntriesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Timesheet entry not found" }); return; }

  res.status(204).end();
});

export default router;
