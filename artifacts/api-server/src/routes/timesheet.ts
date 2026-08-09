import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, timesheetEntriesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function formatEntry(row: typeof timesheetEntriesTable.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    hoursWorked: row.hoursWorked,
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

  res.json(rows.map(formatEntry));
});

const TimesheetEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  hoursWorked: z.number().min(0).max(24),
  notes: z.string().max(2000).optional(),
});

// Upserts the entry for this operator+date - clicking an already-
// logged calendar day edits the same row instead of creating a
// second one, enforced by the table's (user_id, date) unique
// constraint.
router.post("/users/:userId/timesheet", async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = TimesheetEntrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [entry] = await db
    .insert(timesheetEntriesTable)
    .values({ userId, date: parsed.data.date, hoursWorked: parsed.data.hoursWorked, notes: parsed.data.notes ?? "" })
    .onConflictDoUpdate({
      target: [timesheetEntriesTable.userId, timesheetEntriesTable.date],
      set: { hoursWorked: parsed.data.hoursWorked, notes: parsed.data.notes ?? "" },
    })
    .returning();

  res.status(201).json(formatEntry(entry));
});

router.delete("/timesheet/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(timesheetEntriesTable).where(eq(timesheetEntriesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Timesheet entry not found" }); return; }

  res.status(204).end();
});

export default router;
