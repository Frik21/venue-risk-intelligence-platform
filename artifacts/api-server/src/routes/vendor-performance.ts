import { Router, type IRouter } from "express";
import { eq, and, asc, desc } from "drizzle-orm";
import { db, taskVendorsTable, vendorPerformanceReviewsTable, vendorsTable, tasksTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatAssignment(row: typeof taskVendorsTable.$inferSelect, vendorName: string | null, addedByName: string | null) {
  return {
    id: row.id,
    taskId: row.taskId,
    vendorId: row.vendorId,
    vendorName,
    addedBy: row.addedBy,
    addedByName,
    createdAt: row.createdAt.toISOString(),
  };
}

// Task<->Vendor assignment - which vendors were actually used on a
// given task, the real link a performance review is reviewing (see
// schema/task-vendors.ts). Task-scoped, same "what's on this job"
// shape as GET /task-equipment, not company-wide.
router.get("/task-vendors", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const taskId = Number(req.query.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "taskId query param is required" }); return; }

  const rows = await db
    .select()
    .from(taskVendorsTable)
    .where(and(eq(taskVendorsTable.companyId, companyId), eq(taskVendorsTable.taskId, taskId)))
    .orderBy(asc(taskVendorsTable.createdAt));
  if (rows.length === 0) { res.json([]); return; }

  const vendorIds = [...new Set(rows.map((r) => r.vendorId))];
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.companyId, companyId));
  const vendorMap: Record<number, string> = {};
  for (const v of vendors) if (vendorIds.includes(v.id)) vendorMap[v.id] = v.name;

  const userIds = [...new Set(rows.map((r) => r.addedBy))];
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const userMap: Record<number, string> = {};
  for (const u of users) if (userIds.includes(u.id)) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatAssignment(r, vendorMap[r.vendorId] ?? null, userMap[r.addedBy] ?? null)));
});

const CreateAssignmentSchema = z.object({
  taskId: z.number().int(),
  vendorId: z.number().int(),
});

router.post("/task-vendors", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreateAssignmentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [task] = await db.select({ id: tasksTable.id }).from(tasksTable).where(and(eq(tasksTable.id, parsed.data.taskId), eq(tasksTable.companyId, companyId)));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const [vendor] = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(and(eq(vendorsTable.id, parsed.data.vendorId), eq(vendorsTable.companyId, companyId)));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const addedBy = req.user!.id;
  const [existing] = await db
    .select({ id: taskVendorsTable.id })
    .from(taskVendorsTable)
    .where(and(eq(taskVendorsTable.taskId, parsed.data.taskId), eq(taskVendorsTable.vendorId, parsed.data.vendorId)));
  if (existing) { res.status(409).json({ error: "This vendor is already assigned to this task" }); return; }

  const [row] = await db
    .insert(taskVendorsTable)
    .values({ companyId, taskId: parsed.data.taskId, vendorId: parsed.data.vendorId, addedBy })
    .returning();

  const [addedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, addedBy));
  res.status(201).json(formatAssignment(row, vendor.name, addedByUser?.name ?? null));
});

router.delete("/task-vendors/:id", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(taskVendorsTable)
    .where(and(eq(taskVendorsTable.id, id), eq(taskVendorsTable.companyId, companyId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Assignment not found" }); return; }
  res.status(204).end();
});

function formatReview(
  row: typeof vendorPerformanceReviewsTable.$inferSelect,
  vendorName: string | null,
  taskTitle: string | null,
  reviewedByName: string | null,
) {
  return {
    id: row.id,
    vendorId: row.vendorId,
    vendorName,
    taskId: row.taskId,
    taskTitle,
    rating: row.rating,
    notes: row.notes,
    reviewedBy: row.reviewedBy,
    reviewedByName,
    reviewedAt: row.reviewedAt.toISOString(),
  };
}

// Company-wide by default (needed for the Vendors list page's own
// running-average column, across every vendor at once) - pass
// ?vendorId= or ?taskId= to scope to one vendor's track record or one
// task's own reviews, same optional-filter shape used elsewhere in
// this app (e.g. GET /travel-logistics's ?destinationCountry=).
router.get("/vendor-performance-reviews", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const conditions = [eq(vendorPerformanceReviewsTable.companyId, companyId)];
  if (req.query.vendorId != null) {
    const vendorId = Number(req.query.vendorId);
    if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendorId" }); return; }
    conditions.push(eq(vendorPerformanceReviewsTable.vendorId, vendorId));
  }
  if (req.query.taskId != null) {
    const taskId = Number(req.query.taskId);
    if (isNaN(taskId)) { res.status(400).json({ error: "Invalid taskId" }); return; }
    conditions.push(eq(vendorPerformanceReviewsTable.taskId, taskId));
  }

  const rows = await db
    .select()
    .from(vendorPerformanceReviewsTable)
    .where(and(...conditions))
    .orderBy(desc(vendorPerformanceReviewsTable.reviewedAt));
  if (rows.length === 0) { res.json([]); return; }

  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.companyId, companyId));
  const vendorMap: Record<number, string> = {};
  for (const v of vendors) vendorMap[v.id] = v.name;

  const taskIds = [...new Set(rows.map((r) => r.taskId))];
  const tasks = await db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.companyId, companyId));
  const taskMap: Record<number, string> = {};
  for (const t of tasks) if (taskIds.includes(t.id)) taskMap[t.id] = t.title;

  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatReview(r, vendorMap[r.vendorId] ?? null, taskMap[r.taskId] ?? null, userMap[r.reviewedBy] ?? null)));
});

const CreateReviewSchema = z.object({
  taskId: z.number().int(),
  vendorId: z.number().int(),
  rating: z.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
});

// Always reviews a real task_vendors assignment - 404s if the vendor
// was never actually assigned to this task, so a review can't be
// fabricated against an engagement that never happened.
router.post("/vendor-performance-reviews", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreateReviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [assignment] = await db
    .select({ id: taskVendorsTable.id })
    .from(taskVendorsTable)
    .where(and(
      eq(taskVendorsTable.companyId, companyId),
      eq(taskVendorsTable.taskId, parsed.data.taskId),
      eq(taskVendorsTable.vendorId, parsed.data.vendorId),
    ));
  if (!assignment) { res.status(404).json({ error: "This vendor is not assigned to this task" }); return; }

  const reviewedBy = req.user!.id;
  const [row] = await db
    .insert(vendorPerformanceReviewsTable)
    .values({
      companyId,
      taskId: parsed.data.taskId,
      vendorId: parsed.data.vendorId,
      rating: parsed.data.rating,
      notes: parsed.data.notes ?? "",
      reviewedBy,
    })
    .returning();

  const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, parsed.data.vendorId));
  const [task] = await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, parsed.data.taskId));
  const [reviewedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, reviewedBy));

  res.status(201).json(formatReview(row, vendor?.name ?? null, task?.title ?? null, reviewedByUser?.name ?? null));
});

export default router;
