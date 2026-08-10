import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, tasksTable, venuesTable, usersTable, plansTable, taskAssignmentsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const QUOTATION_STATUSES = ["approved", "awaiting_approval", "denied"] as const;

function taskNumber(id: number) {
  return `T-${String(id).padStart(4, "0")}`;
}

function formatTask(
  row: typeof tasksTable.$inferSelect,
  venueName: string | null,
  assignedByName: string | null,
  planSubmittedAt: string | null,
  roster: { id: number; name: string }[],
  alertReviewedByName: string | null = null,
) {
  return {
    id: row.id,
    taskNumber: taskNumber(row.id),
    venueId: row.venueId,
    venueName: venueName ?? null,
    assignedTo: row.assignedTo,
    assignedToName: roster.find((r) => r.id === row.assignedTo)?.name ?? null,
    assignedToIds: roster.map((r) => r.id),
    assignedToNames: roster.map((r) => r.name),
    assignedBy: row.assignedBy,
    assignedByName: assignedByName ?? null,
    title: row.title,
    dueDate: row.dueDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    status: row.status as "not_completed" | "in_progress" | "completed",
    priority: row.priority as "low" | "medium" | "high" | "urgent",
    archived: row.archived,
    completionNote: row.completionNote ?? null,
    clientConfirmedAt: row.clientConfirmedAt?.toISOString() ?? null,
    quotationStatus: row.quotationStatus as "approved" | "awaiting_approval" | "denied",
    clientName: row.clientName,
    clientContact: row.clientContact,
    clientRequirements: row.clientRequirements,
    operatorsRequired: row.operatorsRequired,
    vehiclesRequired: row.vehiclesRequired,
    estimatedCost: row.estimatedCost,
    estimatedCostCurrency: row.estimatedCostCurrency,
    // Whether this task's Operational Plan checklist has been submitted
    // to the Manager (see POST /plans/:id/submit) - null if never
    // submitted, or no Plan exists yet at all.
    planSubmittedAt: planSubmittedAt ?? null,
    alertReviewedBucket: row.alertReviewedBucket ?? null,
    alertReviewedAt: row.alertReviewedAt?.toISOString() ?? null,
    alertReviewedByName: alertReviewedByName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function rosterMap(taskIds: number[]) {
  const rows = taskIds.length
    ? await db.select().from(taskAssignmentsTable).where(inArray(taskAssignmentsTable.taskId, taskIds))
    : [];
  const operatorIds = [...new Set(rows.map((r) => r.operatorId))];
  const users = operatorIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, operatorIds))
    : [];
  const nameMap: Record<number, string> = {};
  for (const u of users) nameMap[u.id] = u.name;

  const map: Record<number, { id: number; name: string }[]> = {};
  for (const r of rows) {
    (map[r.taskId] ??= []).push({ id: r.operatorId, name: nameMap[r.operatorId] ?? "" });
  }
  return map;
}

router.get("/tasks", async (req, res): Promise<void> => {
  const assignedTo = typeof req.query.assignedTo === "string" ? Number(req.query.assignedTo) : undefined;
  const includeArchived = req.query.includeArchived === "true";

  const rows = includeArchived
    ? await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt))
    : await db.select().from(tasksTable).where(eq(tasksTable.archived, false)).orderBy(desc(tasksTable.createdAt));

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name }).from(venuesTable);
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const plans = await db.select({ taskId: plansTable.taskId, submittedAt: plansTable.submittedAt }).from(plansTable);
  const rosters = await rosterMap(rows.map((r) => r.id));

  const venueMap: Record<number, string> = {};
  for (const v of venues) venueMap[v.id] = v.name;
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;
  const planSubmittedMap: Record<number, string | null> = {};
  for (const p of plans) planSubmittedMap[p.taskId] = p.submittedAt?.toISOString() ?? null;

  // A CPO's own task list needs to include tasks where they're any
  // member of the roster, not just the primary assignee.
  const filtered = assignedTo !== undefined
    ? rows.filter((r) => r.assignedTo === assignedTo || (rosters[r.id] ?? []).some((m) => m.id === assignedTo))
    : rows;

  res.json(
    filtered.map((r) =>
      formatTask(
        r,
        (r.venueId != null ? venueMap[r.venueId] : undefined) ?? null,
        userMap[r.assignedBy] ?? null,
        planSubmittedMap[r.id] ?? null,
        rosters[r.id] ?? [],
        (r.alertReviewedBy != null ? userMap[r.alertReviewedBy] : undefined) ?? null,
      ),
    ),
  );
});

const TaskInputSchema = z.object({
  // Optional - a task can be created before a location is picked (see
  // Pending Details in the frontend's lib/task-bucket.ts).
  venueId: z.number().int().nullable().optional(),
  // The actual roster of CPOs assigned, if any decided yet - can be
  // empty ("unassigned", Task Assignment Board) or several (a request
  // for multiple operators). First entry becomes the legacy primary
  // assignedTo.
  assigneeIds: z.array(z.number().int()).optional(),
  assignedBy: z.number().int(),
  // Optional for the same reason as venueId - required to create per
  // the UI (client name/contact/requirements + assigned by), title/
  // location/dates/cost all fill in later.
  title: z.string().trim().max(200).optional(),
  dueDate: z.string().optional(),
  endDate: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  quotationStatus: z.enum(QUOTATION_STATUSES).optional(),
  clientName: z.string().max(200).optional(),
  clientContact: z.string().max(200).optional(),
  clientRequirements: z.string().max(2000).optional(),
  operatorsRequired: z.number().int().min(0).optional(),
  vehiclesRequired: z.number().int().min(0).optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
  estimatedCostCurrency: z.string().min(1).max(10).optional(),
});

async function setRoster(taskId: number, assigneeIds: number[]) {
  await db.delete(taskAssignmentsTable).where(eq(taskAssignmentsTable.taskId, taskId));
  const unique = [...new Set(assigneeIds)];
  if (unique.length) {
    await db.insert(taskAssignmentsTable).values(unique.map((operatorId) => ({ taskId, operatorId })));
  }
}

async function loadTaskContext(task: typeof tasksTable.$inferSelect) {
  const venue = task.venueId != null
    ? (await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, task.venueId)))[0]
    : undefined;
  const [assignedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.assignedBy));
  const [alertReviewedByUser] = task.alertReviewedBy != null
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, task.alertReviewedBy))
    : [undefined];
  const roster = (await rosterMap([task.id]))[task.id] ?? [];
  return {
    venueName: venue?.name ?? null,
    assignedByName: assignedByUser?.name ?? null,
    alertReviewedByName: alertReviewedByUser?.name ?? null,
    roster,
  };
}

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = TaskInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.venueId != null) {
    const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, parsed.data.venueId));
    if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }
  }

  const assigneeIds = parsed.data.assigneeIds ?? [];

  const [task] = await db
    .insert(tasksTable)
    .values({
      venueId: parsed.data.venueId ?? null,
      assignedTo: assigneeIds[0] ?? null,
      assignedBy: parsed.data.assignedBy,
      title: parsed.data.title ?? "",
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      priority: parsed.data.priority ?? "medium",
      quotationStatus: parsed.data.quotationStatus ?? "awaiting_approval",
      clientName: parsed.data.clientName ?? "",
      clientContact: parsed.data.clientContact ?? "",
      clientRequirements: parsed.data.clientRequirements ?? "",
      operatorsRequired: parsed.data.operatorsRequired ?? Math.max(assigneeIds.length, 1),
      vehiclesRequired: parsed.data.vehiclesRequired ?? 0,
      estimatedCost: parsed.data.estimatedCost ?? null,
      estimatedCostCurrency: parsed.data.estimatedCostCurrency ?? "ZAR",
    })
    .returning();

  await setRoster(task.id, assigneeIds);

  const ctx = await loadTaskContext(task);
  res.status(201).json(formatTask(task, ctx.venueName, ctx.assignedByName, null, ctx.roster, ctx.alertReviewedByName));
});

// General task edit - covers status updates (the original purpose of
// this route), plus editing any other field, reassigning the CPO
// roster, changing priority, and archiving/cancelling (archived=true).
const TaskUpdateSchema = z.object({
  venueId: z.number().int().nullable().optional(),
  assigneeIds: z.array(z.number().int()).optional(),
  // Legacy single-assignee convenience - equivalent to assigneeIds:
  // [id] (or [] when null). Ignored if assigneeIds is also given.
  assignedTo: z.number().int().nullable().optional(),
  assignedBy: z.number().int().optional(),
  title: z.string().trim().max(200).optional(),
  dueDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  status: z.enum(["not_completed", "in_progress", "completed"]).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  quotationStatus: z.enum(QUOTATION_STATUSES).optional(),
  archived: z.boolean().optional(),
  completionNote: z.string().max(500).optional(),
  // Manager-set client confirmation - see clientConfirmedAt in
  // schema/tasks.ts. true stamps the current time, false clears it.
  clientConfirmed: z.boolean().optional(),
  clientName: z.string().max(200).optional(),
  clientContact: z.string().max(200).optional(),
  clientRequirements: z.string().max(2000).optional(),
  operatorsRequired: z.number().int().min(0).optional(),
  vehiclesRequired: z.number().int().min(0).optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
  estimatedCostCurrency: z.string().min(1).max(10).optional(),
  // Marks the task reviewed on the Alerts page for its current bucket
  // (see alertReviewedBucket in schema/tasks.ts) - pass the bucket name
  // to mark reviewed, or null to clear it. alertReviewedBy is who did it.
  alertReviewedBucket: z.string().nullable().optional(),
  alertReviewedBy: z.number().int().nullable().optional(),
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = TaskUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { dueDate, endDate, assigneeIds, assignedTo, clientConfirmed, alertReviewedBucket, alertReviewedBy, ...rest } = parsed.data;
  const nextRoster = assigneeIds ?? (assignedTo !== undefined ? (assignedTo !== null ? [assignedTo] : []) : undefined);

  const [task] = await db
    .update(tasksTable)
    .set({
      ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...(nextRoster !== undefined ? { assignedTo: nextRoster[0] ?? null } : {}),
      ...(clientConfirmed !== undefined ? { clientConfirmedAt: clientConfirmed ? new Date() : null } : {}),
      ...(alertReviewedBucket !== undefined
        ? {
            alertReviewedBucket,
            alertReviewedBy: alertReviewedBucket ? (alertReviewedBy ?? null) : null,
            alertReviewedAt: alertReviewedBucket ? new Date() : null,
          }
        : {}),
    })
    .where(eq(tasksTable.id, id))
    .returning();

  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (nextRoster !== undefined) await setRoster(task.id, nextRoster);

  const ctx = await loadTaskContext(task);
  const [plan] = await db.select({ submittedAt: plansTable.submittedAt }).from(plansTable).where(eq(plansTable.taskId, task.id));
  res.json(formatTask(task, ctx.venueName, ctx.assignedByName, plan?.submittedAt?.toISOString() ?? null, ctx.roster, ctx.alertReviewedByName));
});

// Duplicate - same venue/roster/assignedBy/priority/client details,
// title suffixed "(Copy)", no due date carried over (it's almost
// always wrong to reuse the exact same date for a repeat task) and
// never inherits status/completion/plan/assessment data from the original.
router.post("/tasks/:id/duplicate", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [source] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!source) { res.status(404).json({ error: "Task not found" }); return; }
  const sourceRoster = (await rosterMap([id]))[id] ?? [];

  const [task] = await db
    .insert(tasksTable)
    .values({
      venueId: source.venueId,
      assignedTo: source.assignedTo,
      assignedBy: source.assignedBy,
      title: `${source.title} (Copy)`,
      priority: source.priority,
      clientName: source.clientName,
      clientContact: source.clientContact,
      clientRequirements: source.clientRequirements,
      operatorsRequired: source.operatorsRequired,
      vehiclesRequired: source.vehiclesRequired,
      estimatedCost: source.estimatedCost,
      estimatedCostCurrency: source.estimatedCostCurrency,
    })
    .returning();

  await setRoster(task.id, sourceRoster.map((r) => r.id));

  const ctx = await loadTaskContext(task);
  res.status(201).json(formatTask(task, ctx.venueName, ctx.assignedByName, null, ctx.roster));
});

export default router;
