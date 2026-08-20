import { Router, type IRouter } from "express";
import { eq, isNull, and, asc } from "drizzle-orm";
import { db, timesheetEntriesTable, usersTable, companySettingsTable, payRunsTable } from "@workspace/db";
import { z } from "zod";
import { computePersonnelCosts } from "../lib/personnel-cost";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

const PAY_RUN_STATUSES = ["pending", "paid"] as const;

function formatPayRun(row: typeof payRunsTable.$inferSelect, userName: string | null) {
  return {
    id: row.id,
    userId: row.userId,
    userName,
    totalHours: row.totalHours,
    totalAmount: row.totalAmount,
    status: row.status as (typeof PAY_RUN_STATUSES)[number],
    paidAt: row.paidAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOvertimeSettings(companyId: number) {
  const [settingsRow] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, companyId));
  return settingsRow ?? { overtimeThresholdHours: 8, overtimeThresholdPeriod: "daily" as const, overtimeMultiplier: 1.5 };
}

// Approved, not-yet-paid-out hours per operator - what a Pay Run gets
// created from. Same cost math as Personnel Costs (routes/personnel-
// costs.ts): rate x hours with overtime allocated back proportionally
// - just grouped straight to a per-operator total here instead of
// per-entry, since that's all a Pay Run needs. Excludes entries
// already folded into a Pay Run (payRunId set) so the same hours can
// never be paid out twice.
router.get("/payroll/pending", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  const entries = (await db.select().from(timesheetEntriesTable).where(eq(timesheetEntriesTable.companyId, companyId)))
    .filter((e) => e.approved && e.payRunId == null);
  const users = await db.select().from(usersTable).where(eq(usersTable.companyId, companyId));
  const settings = await loadOvertimeSettings(companyId);

  const rates: Record<number, { dayRate: number; nightRate: number }> = {};
  const userMap: Record<number, string> = {};
  for (const u of users) {
    userMap[u.id] = u.name;
    rates[u.id] = { dayRate: u.dayRate ?? 0, nightRate: u.nightRate ?? 0 };
  }

  const lines = computePersonnelCosts(
    entries.map((e) => ({ id: e.id, userId: e.userId, taskId: e.taskId, date: e.date, dayHours: e.dayHours, nightHours: e.nightHours })),
    rates,
    {
      thresholdHours: settings.overtimeThresholdHours,
      period: settings.overtimeThresholdPeriod as "daily" | "weekly",
      multiplier: settings.overtimeMultiplier,
    },
  );

  const byUser = new Map<number, { totalHours: number; totalAmount: number }>();
  for (const l of lines) {
    const acc = byUser.get(l.userId) ?? { totalHours: 0, totalAmount: 0 };
    acc.totalHours += l.hours;
    acc.totalAmount += l.cost;
    byUser.set(l.userId, acc);
  }

  res.json(
    [...byUser.entries()]
      .filter(([, v]) => v.totalHours > 0)
      .map(([userId, v]) => ({
        userId,
        userName: userMap[userId] ?? null,
        totalHours: v.totalHours,
        totalAmount: v.totalAmount,
      })),
  );
});

router.get("/payroll/runs", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  const rows = await db.select().from(payRunsTable).where(eq(payRunsTable.companyId, companyId)).orderBy(payRunsTable.createdAt);
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.reverse().map((r) => formatPayRun(r, userMap[r.userId] ?? null)));
});

const CreatePayRunSchema = z.object({
  userId: z.number().int(),
  createdBy: z.number().int().nullable().optional(),
});

// Locks in whatever's currently pending for this operator into a new
// Pay Run - snapshots the total, then stamps every entry it covers
// with this run's id so they drop out of /payroll/pending immediately.
router.post("/payroll/runs", async (req, res): Promise<void> => {
  const parsed = CreatePayRunSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await resolveCompanyId(req.user!.companyId);
  const { userId } = parsed.data;
  const pendingEntries = (await db.select().from(timesheetEntriesTable).where(eq(timesheetEntriesTable.companyId, companyId)))
    .filter((e) => e.userId === userId && e.approved && e.payRunId == null);

  if (pendingEntries.length === 0) {
    res.status(400).json({ error: "No pending hours to pay out for this operator" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.companyId !== companyId) { res.status(404).json({ error: "Operator not found" }); return; }

  const settings = await loadOvertimeSettings(companyId);
  const lines = computePersonnelCosts(
    pendingEntries.map((e) => ({ id: e.id, userId: e.userId, taskId: e.taskId, date: e.date, dayHours: e.dayHours, nightHours: e.nightHours })),
    { [userId]: { dayRate: user.dayRate ?? 0, nightRate: user.nightRate ?? 0 } },
    {
      thresholdHours: settings.overtimeThresholdHours,
      period: settings.overtimeThresholdPeriod as "daily" | "weekly",
      multiplier: settings.overtimeMultiplier,
    },
  );
  const totalHours = lines.reduce((sum, l) => sum + l.hours, 0);
  const totalAmount = lines.reduce((sum, l) => sum + l.cost, 0);

  const [payRun] = await db
    .insert(payRunsTable)
    .values({ companyId, userId, totalHours, totalAmount, createdBy: parsed.data.createdBy ?? null })
    .returning();

  await db
    .update(timesheetEntriesTable)
    .set({ payRunId: payRun.id })
    .where(and(eq(timesheetEntriesTable.userId, userId), eq(timesheetEntriesTable.approved, true), isNull(timesheetEntriesTable.payRunId)));

  res.status(201).json(formatPayRun(payRun, user.name));
});

const UpdatePayRunSchema = z.object({
  status: z.enum(PAY_RUN_STATUSES),
});

router.patch("/payroll/runs/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdatePayRunSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(payRunsTable).where(eq(payRunsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Pay run not found" }); return; }

  const [payRun] = await db
    .update(payRunsTable)
    .set({
      status: parsed.data.status,
      paidAt: parsed.data.status === "paid" && !existing.paidAt ? new Date() : existing.paidAt,
    })
    .where(eq(payRunsTable.id, id))
    .returning();

  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, payRun.userId));
  res.json(formatPayRun(payRun, user?.name ?? null));
});

// Un-does the run - the underlying entries fall back to pending
// (onDelete: "set null" on timesheet_entries.pay_run_id) rather than
// staying stuck as "already paid" with no record of it.
router.delete("/payroll/runs/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(payRunsTable).where(eq(payRunsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Pay run not found" }); return; }
  res.status(204).end();
});

export default router;
