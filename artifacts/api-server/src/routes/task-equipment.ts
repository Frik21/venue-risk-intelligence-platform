import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { db, taskEquipmentTable, tasksTable, taskAssignmentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatItem(
  row: typeof taskEquipmentTable.$inferSelect,
  addedByName: string | null,
  issuedToName: string | null,
) {
  return {
    id: row.id,
    taskId: row.taskId,
    addedBy: row.addedBy,
    addedByName,
    itemName: row.itemName,
    serialNumber: row.serialNumber,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    issuedTo: row.issuedTo,
    issuedToName,
    returnedAt: row.returnedAt?.toISOString() ?? null,
    needsMaintenance: row.needsMaintenance,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

// Scoped to one task, oldest-added-first - the same "what's on this
// job" shape as GET /after-action-reports, not company-wide.
router.get("/task-equipment", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const taskId = Number(req.query.taskId);
  if (isNaN(taskId)) { res.status(400).json({ error: "taskId query param is required" }); return; }

  const rows = await db
    .select()
    .from(taskEquipmentTable)
    .where(and(eq(taskEquipmentTable.companyId, companyId), eq(taskEquipmentTable.taskId, taskId)))
    .orderBy(asc(taskEquipmentTable.createdAt));
  if (rows.length === 0) { res.json([]); return; }

  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatItem(r, userMap[r.addedBy] ?? null, r.issuedTo != null ? userMap[r.issuedTo] ?? null : null)));
});

const CreateItemSchema = z.object({
  taskId: z.number().int(),
  itemName: z.string().min(1),
  serialNumber: z.string().optional(),
});

// Either a Manager or the CPO on the task can add an item (confirmed
// via AskUserQuestion) - addedBy always comes from the session. The
// roster check only applies to a CPO caller, same as the rest of this
// app's Management-side looseness - a Manager isn't on task_assignments
// at all, so there's nothing to check for that role.
router.post("/task-equipment", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreateItemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const addedBy = req.user!.id;
  const [task] = await db.select({ id: tasksTable.id }).from(tasksTable).where(and(eq(tasksTable.id, parsed.data.taskId), eq(tasksTable.companyId, companyId)));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  if (req.user!.role === "cpo") {
    const [onRoster] = await db
      .select({ id: taskAssignmentsTable.id })
      .from(taskAssignmentsTable)
      .where(and(eq(taskAssignmentsTable.taskId, parsed.data.taskId), eq(taskAssignmentsTable.operatorId, addedBy)));
    if (!onRoster) { res.status(403).json({ error: "You are not assigned to this task" }); return; }
  }

  const [row] = await db
    .insert(taskEquipmentTable)
    .values({
      companyId,
      taskId: parsed.data.taskId,
      addedBy,
      itemName: parsed.data.itemName,
      serialNumber: parsed.data.serialNumber ?? null,
    })
    .returning();

  const [addedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, addedBy));
  res.status(201).json(formatItem(row, addedByUser?.name ?? null, null));
});

async function loadItemWithNames(id: number, companyId: number) {
  const [row] = await db.select().from(taskEquipmentTable).where(and(eq(taskEquipmentTable.id, id), eq(taskEquipmentTable.companyId, companyId)));
  if (!row) return null;
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;
  return formatItem(row, userMap[row.addedBy] ?? null, row.issuedTo != null ? userMap[row.issuedTo] ?? null : null);
}

// Marked issued by whoever physically has it now - issuedTo/issuedAt
// always come from the session, same no-client-trust posture as
// cpoId/reviewedBy elsewhere.
router.patch("/task-equipment/:id/issue", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .update(taskEquipmentTable)
    .set({ issuedAt: new Date(), issuedTo: req.user!.id })
    .where(and(eq(taskEquipmentTable.id, id), eq(taskEquipmentTable.companyId, companyId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Equipment item not found" }); return; }

  res.json(await loadItemWithNames(row.id, companyId));
});

const ReturnItemSchema = z.object({
  needsMaintenance: z.boolean().optional(),
  notes: z.string().optional(),
});

router.patch("/task-equipment/:id/return", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ReturnItemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .update(taskEquipmentTable)
    .set({
      returnedAt: new Date(),
      needsMaintenance: parsed.data.needsMaintenance ?? false,
      notes: parsed.data.notes ?? null,
    })
    .where(and(eq(taskEquipmentTable.id, id), eq(taskEquipmentTable.companyId, companyId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Equipment item not found" }); return; }

  res.json(await loadItemWithNames(row.id, companyId));
});

// Removing an item added by mistake - no extra ownership check beyond
// company scope, same as DELETE /expenses/:id.
router.delete("/task-equipment/:id", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(taskEquipmentTable)
    .where(and(eq(taskEquipmentTable.id, id), eq(taskEquipmentTable.companyId, companyId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Equipment item not found" }); return; }

  res.status(204).end();
});

export default router;
