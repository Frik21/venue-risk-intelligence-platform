import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, tasksTable, venuesTable, usersTable, plansTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

function taskNumber(id: number) {
  return `T-${String(id).padStart(4, "0")}`;
}

function formatTask(
  row: typeof tasksTable.$inferSelect,
  venueName?: string | null,
  assignedToName?: string | null,
  assignedByName?: string | null,
  planSubmittedAt?: string | null,
) {
  return {
    id: row.id,
    taskNumber: taskNumber(row.id),
    venueId: row.venueId,
    venueName: venueName ?? null,
    assignedTo: row.assignedTo,
    assignedToName: assignedToName ?? null,
    assignedBy: row.assignedBy,
    assignedByName: assignedByName ?? null,
    title: row.title,
    dueDate: row.dueDate?.toISOString() ?? null,
    status: row.status as "not_completed" | "in_progress" | "completed",
    priority: row.priority as "low" | "medium" | "high" | "urgent",
    archived: row.archived,
    completionNote: row.completionNote ?? null,
    // Whether this task's Operational Plan checklist has been submitted
    // to the Manager (see POST /plans/:id/submit) - null if never
    // submitted, or no Plan exists yet at all.
    planSubmittedAt: planSubmittedAt ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/tasks", async (req, res): Promise<void> => {
  const assignedTo = typeof req.query.assignedTo === "string" ? Number(req.query.assignedTo) : undefined;
  const includeArchived = req.query.includeArchived === "true";

  const conditions = [
    assignedTo !== undefined ? eq(tasksTable.assignedTo, assignedTo) : undefined,
    includeArchived ? undefined : eq(tasksTable.archived, false),
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const rows = await db
    .select()
    .from(tasksTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tasksTable.createdAt));

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name }).from(venuesTable);
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const plans = await db.select({ taskId: plansTable.taskId, submittedAt: plansTable.submittedAt }).from(plansTable);

  const venueMap: Record<number, string> = {};
  for (const v of venues) venueMap[v.id] = v.name;
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;
  const planSubmittedMap: Record<number, string | null> = {};
  for (const p of plans) planSubmittedMap[p.taskId] = p.submittedAt?.toISOString() ?? null;

  res.json(
    rows.map((r) =>
      formatTask(
        r,
        venueMap[r.venueId],
        r.assignedTo !== null ? userMap[r.assignedTo] : null,
        userMap[r.assignedBy],
        planSubmittedMap[r.id],
      ),
    ),
  );
});

const TaskInputSchema = z.object({
  venueId: z.number().int(),
  // Nullable/optional so a Manager can create a task before deciding
  // who covers it (Task Assignment Board's "unassigned tasks") -
  // assigned later via PATCH.
  assignedTo: z.number().int().nullable().optional(),
  assignedBy: z.number().int(),
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
});

async function loadTaskNames(task: typeof tasksTable.$inferSelect) {
  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, task.venueId));
  const [assignedToUser] = task.assignedTo !== null
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedTo))
    : [undefined];
  const [assignedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedBy));
  return { venueName: venue?.name, assignedToName: assignedToUser?.name, assignedByName: assignedByUser?.name };
}

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = TaskInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, parsed.data.venueId));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  const [task] = await db
    .insert(tasksTable)
    .values({
      venueId: parsed.data.venueId,
      assignedTo: parsed.data.assignedTo ?? null,
      assignedBy: parsed.data.assignedBy,
      title: parsed.data.title,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      priority: parsed.data.priority ?? "medium",
    })
    .returning();

  const names = await loadTaskNames(task);
  res.status(201).json(formatTask(task, names.venueName, names.assignedToName, names.assignedByName));
});

// General task edit - covers status updates (the original purpose of
// this route), plus editing any other field, assigning/reassigning a
// CPO, changing priority, and archiving/cancelling (archived=true).
const TaskUpdateSchema = z.object({
  venueId: z.number().int().optional(),
  assignedTo: z.number().int().nullable().optional(),
  assignedBy: z.number().int().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["not_completed", "in_progress", "completed"]).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  archived: z.boolean().optional(),
  completionNote: z.string().max(500).optional(),
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = TaskUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { dueDate, ...rest } = parsed.data;
  const [task] = await db
    .update(tasksTable)
    .set({ ...rest, ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}) })
    .where(eq(tasksTable.id, id))
    .returning();

  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const names = await loadTaskNames(task);
  res.json(formatTask(task, names.venueName, names.assignedToName, names.assignedByName));
});

// Duplicate - same venue/assignee/assignedBy/priority, title suffixed
// "(Copy)", no due date carried over (it's almost always wrong to
// reuse the exact same date for a repeat task) and never inherits
// status/completion/plan/assessment data from the original.
router.post("/tasks/:id/duplicate", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [source] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!source) { res.status(404).json({ error: "Task not found" }); return; }

  const [task] = await db
    .insert(tasksTable)
    .values({
      venueId: source.venueId,
      assignedTo: source.assignedTo,
      assignedBy: source.assignedBy,
      title: `${source.title} (Copy)`,
      priority: source.priority,
    })
    .returning();

  const names = await loadTaskNames(task);
  res.status(201).json(formatTask(task, names.venueName, names.assignedToName, names.assignedByName));
});

export default router;
