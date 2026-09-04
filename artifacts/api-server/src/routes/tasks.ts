import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, tasksTable, venuesTable, usersTable, plansTable, taskAssignmentsTable, principalsTable } from "@workspace/db";
import { z } from "zod";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";

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
  roster: { id: number; name: string; role: string | null }[],
  alertReviewedByName: string | null = null,
) {
  return {
    id: row.id,
    taskNumber: taskNumber(row.id),
    companyId: row.companyId,
    venueId: row.venueId,
    venueName: venueName ?? null,
    officeId: row.officeId,
    assignedTo: row.assignedTo,
    assignedToName: roster.find((r) => r.id === row.assignedTo)?.name ?? null,
    assignedToIds: roster.map((r) => r.id),
    assignedToNames: roster.map((r) => r.name),
    // Team-lead/hierarchy designation - Following Roadmap Tier 2, item
    // 15. Parallel array alongside assignedToIds/Names (same index per
    // roster member) rather than restructuring those into objects,
    // since assignedToIds/Names are already consumed all over the
    // frontend and this keeps every existing consumer unaffected.
    assignedToRoles: roster.map((r) => r.role),
    assignedBy: row.assignedBy,
    assignedByName: assignedByName ?? null,
    title: row.title,
    dueDate: row.dueDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    status: row.status as "not_completed" | "in_progress" | "completed",
    completedAt: row.completedAt?.toISOString() ?? null,
    priority: row.priority as "low" | "medium" | "high" | "urgent",
    archived: row.archived,
    invoiced: row.invoiced,
    completionNote: row.completionNote ?? null,
    clientConfirmedAt: row.clientConfirmedAt?.toISOString() ?? null,
    quotationStatus: row.quotationStatus as "approved" | "awaiting_approval" | "denied",
    clientId: row.clientId,
    clientName: row.clientName,
    clientContact: row.clientContact,
    clientRequirements: row.clientRequirements,
    operatorsRequired: row.operatorsRequired,
    armedRequired: row.armedRequired,
    vehiclesRequired: row.vehiclesRequired,
    quotationLineItems: row.quotationLineItems,
    estimatedCost: row.estimatedCost,
    estimatedCostCurrency: row.estimatedCostCurrency,
    // Whether this task's Operational Plan checklist has been submitted
    // to the Manager (see POST /plans/:id/submit) - null if never
    // submitted, or no Plan exists yet at all.
    planSubmittedAt: planSubmittedAt ?? null,
    alertReviewedBucket: row.alertReviewedBucket ?? null,
    alertReviewedAt: row.alertReviewedAt?.toISOString() ?? null,
    alertReviewedByName: alertReviewedByName ?? null,
    // See checkins.ts's own schema comment - opt-in per task, null means
    // no scheduled check-in is expected.
    checkInIntervalMinutes: row.checkInIntervalMinutes,
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

  const map: Record<number, { id: number; name: string; role: string | null }[]> = {};
  for (const r of rows) {
    (map[r.taskId] ??= []).push({ id: r.operatorId, name: nameMap[r.operatorId] ?? "", role: r.role });
  }
  return map;
}

router.get("/tasks", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  const assignedTo = typeof req.query.assignedTo === "string" ? Number(req.query.assignedTo) : undefined;
  const includeArchived = req.query.includeArchived === "true";

  const rows = includeArchived
    ? await db.select().from(tasksTable).where(eq(tasksTable.companyId, companyId)).orderBy(desc(tasksTable.createdAt))
    : await db.select().from(tasksTable).where(and(eq(tasksTable.companyId, companyId), eq(tasksTable.archived, false))).orderBy(desc(tasksTable.createdAt));

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
  companyId: z.number().int().nullable().optional(),
  // Optional - a task can be created before a location is picked (see
  // Pending Details in the frontend's lib/task-bucket.ts).
  venueId: z.number().int().nullable().optional(),
  officeId: z.number().int().nullable().optional(),
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
  clientId: z.number().int().nullable().optional(),
  clientName: z.string().max(200).optional(),
  clientContact: z.string().max(200).optional(),
  clientRequirements: z.string().max(2000).optional(),
  operatorsRequired: z.number().int().min(0).optional(),
  armedRequired: z.boolean().optional(),
  vehiclesRequired: z.number().int().min(0).optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
  estimatedCostCurrency: z.string().min(1).max(10).optional(),
  checkInIntervalMinutes: z.number().int().min(1).nullable().optional(),
});

async function setRoster(taskId: number, companyId: number, assignees: { operatorId: number; role?: string | null }[]) {
  await db.delete(taskAssignmentsTable).where(eq(taskAssignmentsTable.taskId, taskId));
  const seen = new Set<number>();
  const unique = assignees.filter((a) => (seen.has(a.operatorId) ? false : (seen.add(a.operatorId), true)));
  if (unique.length) {
    await db.insert(taskAssignmentsTable).values(unique.map((a) => ({ companyId, taskId, operatorId: a.operatorId, role: a.role ?? null })));
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
  const companyId = await resolveCompanyId(req.user!.companyId);

  const [task] = await db
    .insert(tasksTable)
    .values({
      companyId,
      venueId: parsed.data.venueId ?? null,
      officeId: parsed.data.officeId ?? null,
      assignedTo: assigneeIds[0] ?? null,
      assignedBy: parsed.data.assignedBy,
      title: parsed.data.title ?? "",
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      priority: parsed.data.priority ?? "medium",
      quotationStatus: parsed.data.quotationStatus ?? "awaiting_approval",
      clientId: parsed.data.clientId ?? null,
      clientName: parsed.data.clientName ?? "",
      clientContact: parsed.data.clientContact ?? "",
      clientRequirements: parsed.data.clientRequirements ?? "",
      operatorsRequired: parsed.data.operatorsRequired ?? Math.max(assigneeIds.length, 1),
      armedRequired: parsed.data.armedRequired ?? false,
      vehiclesRequired: parsed.data.vehiclesRequired ?? 0,
      estimatedCost: parsed.data.estimatedCost ?? null,
      estimatedCostCurrency: parsed.data.estimatedCostCurrency ?? "ZAR",
      checkInIntervalMinutes: parsed.data.checkInIntervalMinutes ?? null,
    })
    .returning();

  await setRoster(task.id, task.companyId, assigneeIds.map((operatorId) => ({ operatorId })));

  const ctx = await loadTaskContext(task);
  res.status(201).json(formatTask(task, ctx.venueName, ctx.assignedByName, null, ctx.roster, ctx.alertReviewedByName));
});

// General task edit - covers status updates (the original purpose of
// this route), plus editing any other field, reassigning the CPO
// roster, changing priority, and archiving/cancelling (archived=true).
const TaskUpdateSchema = z.object({
  venueId: z.number().int().nullable().optional(),
  officeId: z.number().int().nullable().optional(),
  assigneeIds: z.array(z.number().int()).optional(),
  // Team-lead/hierarchy designation per roster member - Following
  // Roadmap Tier 2, item 15. Keyed by operatorId (as a string, since
  // JSON object keys always are) - only meaningful alongside
  // assigneeIds, applied 1:1 by id when rebuilding the roster below.
  // An id with no entry here (or not sent at all) gets role: null.
  assigneeRoles: z.record(z.string(), z.string().nullable()).optional(),
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
  invoiced: z.boolean().optional(),
  completionNote: z.string().max(500).optional(),
  // Manager-set client confirmation - see clientConfirmedAt in
  // schema/tasks.ts. true stamps the current time, false clears it.
  clientConfirmed: z.boolean().optional(),
  clientId: z.number().int().nullable().optional(),
  clientName: z.string().max(200).optional(),
  clientContact: z.string().max(200).optional(),
  clientRequirements: z.string().max(2000).optional(),
  operatorsRequired: z.number().int().min(0).optional(),
  armedRequired: z.boolean().optional(),
  vehiclesRequired: z.number().int().min(0).optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
  estimatedCostCurrency: z.string().min(1).max(10).optional(),
  // Manual quotation line items built on the Quotations page - see
  // quotationLineItems in schema/tasks.ts.
  quotationLineItems: z.array(z.object({ description: z.string().max(200), amount: z.number() })).optional(),
  // Marks the task reviewed on the Alerts page for its current bucket
  // (see alertReviewedBucket in schema/tasks.ts) - pass the bucket name
  // to mark reviewed, or null to clear it. alertReviewedBy is who did it.
  alertReviewedBucket: z.string().nullable().optional(),
  alertReviewedBy: z.number().int().nullable().optional(),
  checkInIntervalMinutes: z.number().int().min(1).nullable().optional(),
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = TaskUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing || existing.companyId !== req.user!.companyId) { res.status(404).json({ error: "Task not found" }); return; }

  const { dueDate, endDate, assigneeIds, assigneeRoles, assignedTo, clientConfirmed, alertReviewedBucket, alertReviewedBy, ...rest } = parsed.data;
  const nextRosterIds = assigneeIds ?? (assignedTo !== undefined ? (assignedTo !== null ? [assignedTo] : []) : undefined);
  const nextRoster = nextRosterIds?.map((operatorId) => ({ operatorId, role: assigneeRoles?.[String(operatorId)] ?? null }));

  // Stamped the first time status moves into "completed" - never
  // cleared if the task is later edited back to another status, same
  // reasoning as sentAt/decidedAt on quotesTable.
  const completedAtStamp =
    rest.status === "completed" && existing.status !== "completed" ? { completedAt: new Date() } : {};

  const [task] = await db
    .update(tasksTable)
    .set({
      ...rest,
      ...completedAtStamp,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...(nextRoster !== undefined ? { assignedTo: nextRoster[0]?.operatorId ?? null } : {}),
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
  if (nextRoster !== undefined) await setRoster(task.id, task.companyId, nextRoster);

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
      companyId: source.companyId,
      venueId: source.venueId,
      officeId: source.officeId,
      assignedTo: source.assignedTo,
      assignedBy: source.assignedBy,
      title: `${source.title} (Copy)`,
      priority: source.priority,
      clientId: source.clientId,
      clientName: source.clientName,
      clientContact: source.clientContact,
      clientRequirements: source.clientRequirements,
      operatorsRequired: source.operatorsRequired,
      armedRequired: source.armedRequired,
      vehiclesRequired: source.vehiclesRequired,
      estimatedCost: source.estimatedCost,
      estimatedCostCurrency: source.estimatedCostCurrency,
      checkInIntervalMinutes: source.checkInIntervalMinutes,
    })
    .returning();

  await setRoster(task.id, task.companyId, sourceRoster.map((r) => ({ operatorId: r.id, role: r.role })));

  const ctx = await loadTaskContext(task);
  res.status(201).json(formatTask(task, ctx.venueName, ctx.assignedByName, null, ctx.roster));
});

// The protection profile a CPO sees for their task - Following Roadmap
// Tier 2, item 8. Surfaces automatically once assigned, no separate
// reveal step (per direct product direction). Read-only and scoped
// through the task rather than exposing the Management-only Clients
// CRM routes to a CPO session - a CPO on the roster can see the
// principals tied to their own task's client, nothing more. A
// Management-side caller (any role but cpo) skips the roster check,
// same trust level they already have everywhere else in this app.
router.get("/tasks/:id/principals", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const taskId = Number(req.params.id);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [task] = await db.select().from(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.companyId, companyId)));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  if (req.user!.role === "cpo") {
    const [onRoster] = await db
      .select({ id: taskAssignmentsTable.id })
      .from(taskAssignmentsTable)
      .where(and(eq(taskAssignmentsTable.taskId, taskId), eq(taskAssignmentsTable.operatorId, req.user!.id)));
    if (!onRoster) { res.status(403).json({ error: "You are not assigned to this task" }); return; }
  }

  if (task.clientId == null) { res.json([]); return; }

  const rows = await db.select().from(principalsTable).where(eq(principalsTable.clientId, task.clientId));
  res.json(
    rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      name: r.name,
      relationship: r.relationship,
      medicalInfo: r.medicalInfo,
      knownThreats: r.knownThreats,
      routineNotes: r.routineNotes,
      familyNotes: r.familyNotes,
    })),
  );
});

export default router;
