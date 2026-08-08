import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tasksTable, venuesTable, usersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function formatTask(
  row: typeof tasksTable.$inferSelect,
  venueName?: string | null,
  assignedToName?: string | null,
  assignedByName?: string | null,
) {
  return {
    id: row.id,
    venueId: row.venueId,
    venueName: venueName ?? null,
    assignedTo: row.assignedTo,
    assignedToName: assignedToName ?? null,
    assignedBy: row.assignedBy,
    assignedByName: assignedByName ?? null,
    title: row.title,
    dueDate: row.dueDate?.toISOString() ?? null,
    status: row.status as "not_completed" | "in_progress" | "completed",
    completionNote: row.completionNote ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/tasks", async (req, res): Promise<void> => {
  const assignedTo = typeof req.query.assignedTo === "string" ? Number(req.query.assignedTo) : undefined;

  const rows = assignedTo
    ? await db.select().from(tasksTable).where(eq(tasksTable.assignedTo, assignedTo)).orderBy(desc(tasksTable.createdAt))
    : await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt));

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name }).from(venuesTable);
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

  const venueMap: Record<number, string> = {};
  for (const v of venues) venueMap[v.id] = v.name;
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatTask(r, venueMap[r.venueId], userMap[r.assignedTo], userMap[r.assignedBy])));
});

const TaskInputSchema = z.object({
  venueId: z.number().int(),
  assignedTo: z.number().int(),
  assignedBy: z.number().int(),
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().optional(),
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = TaskInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, parsed.data.venueId));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  const [task] = await db
    .insert(tasksTable)
    .values({
      venueId: parsed.data.venueId,
      assignedTo: parsed.data.assignedTo,
      assignedBy: parsed.data.assignedBy,
      title: parsed.data.title,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    })
    .returning();

  const [assignedToUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedTo));
  const [assignedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedBy));

  res.status(201).json(formatTask(task, venue.name, assignedToUser?.name, assignedByUser?.name));
});

const TaskStatusSchema = z.object({
  status: z.enum(["not_completed", "in_progress", "completed"]),
  completionNote: z.string().max(500).optional(),
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = TaskStatusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [task] = await db
    .update(tasksTable)
    .set(parsed.data)
    .where(eq(tasksTable.id, id))
    .returning();

  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, task.venueId));
  const [assignedToUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedTo));
  const [assignedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedBy));

  res.json(formatTask(task, venue?.name, assignedToUser?.name, assignedByUser?.name));
});

export default router;
