import { Router, type IRouter } from "express";
import { db, timesheetEntriesTable, usersTable, tasksTable, companySettingsTable } from "@workspace/db";
import { computePersonnelCosts } from "../lib/personnel-cost";

const router: IRouter = Router();

// One line per APPROVED timesheet entry, with its allocated share of
// that period's personnel cost (rate x hours, including any overtime
// premium - see lib/personnel-cost.ts) - powers Costs' Personnel Costs
// section. A CPO's logged hours don't count toward costing until a
// Manager approves them (Tasks page), per direct product direction -
// unapproved entries are excluded here entirely, including from the
// overtime-threshold calculation (overtime is worked out among
// whatever's been approved so far, not the CPO's full unreviewed log).
// Deliberately not pre-aggregated server-side so the frontend can
// group by task, by CPO, or by period as needed.
router.get("/personnel-costs", async (_req, res): Promise<void> => {
  const entries = (await db.select().from(timesheetEntriesTable)).filter((e) => e.approved);
  const users = await db.select().from(usersTable);
  const [settingsRow] = await db.select().from(companySettingsTable).limit(1);
  const settings = settingsRow ?? { overtimeThresholdHours: 8, overtimeThresholdPeriod: "daily" as const, overtimeMultiplier: 1.5 };

  const rates: Record<number, { dayRate: number; nightRate: number }> = {};
  const userMap: Record<number, string> = {};
  for (const u of users) {
    userMap[u.id] = u.name;
    rates[u.id] = { dayRate: u.dayRate ?? 0, nightRate: u.nightRate ?? 0 };
  }

  const taskIds = [...new Set(entries.map((e) => e.taskId).filter((id): id is number => id !== null))];
  const tasks = taskIds.length
    ? await db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable)
    : [];
  const taskMap: Record<number, string> = {};
  for (const t of tasks) taskMap[t.id] = t.title;

  const lines = computePersonnelCosts(
    entries.map((e) => ({ id: e.id, userId: e.userId, taskId: e.taskId, date: e.date, dayHours: e.dayHours, nightHours: e.nightHours })),
    rates,
    {
      thresholdHours: settings.overtimeThresholdHours,
      period: settings.overtimeThresholdPeriod as "daily" | "weekly",
      multiplier: settings.overtimeMultiplier,
    },
  );

  res.json(
    lines.map((l) => ({
      ...l,
      userName: userMap[l.userId] ?? null,
      taskTitle: l.taskId !== null ? (taskMap[l.taskId] ?? null) : null,
    })),
  );
});

export default router;
