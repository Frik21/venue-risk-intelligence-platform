// Computes Personnel Cost (rate x hours, with overtime) per timesheet
// entry, so it can be summed however a caller needs - per task, per
// CPO, per period. The tricky part is overtime: it's determined by a
// CPO's TOTAL hours in a period (day or week), not any single entry,
// even though a CPO can log hours against several tasks in the same
// period. This allocates each period's overtime premium back across
// that period's entries proportionally by hours, so "which task caused
// the overtime" gets a defensible (not perfect - inherently ambiguous)
// answer instead of an arbitrary one.

export interface RateInfo {
  dayRate: number;
  nightRate: number;
}

export interface TimesheetEntryLike {
  id: number;
  userId: number;
  taskId: number | null;
  date: string; // YYYY-MM-DD
  dayHours: number;
  nightHours: number;
}

export interface OvertimeSettings {
  thresholdHours: number;
  period: "daily" | "weekly";
  multiplier: number;
}

export interface PersonnelCostLine {
  entryId: number;
  userId: number;
  taskId: number | null;
  date: string;
  hours: number;
  cost: number;
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function computePersonnelCosts(
  entries: TimesheetEntryLike[],
  rates: Record<number, RateInfo>,
  settings: OvertimeSettings,
): PersonnelCostLine[] {
  const groups = new Map<string, TimesheetEntryLike[]>();
  for (const e of entries) {
    const periodKey = settings.period === "weekly" ? isoWeekKey(e.date) : e.date;
    const key = `${e.userId}::${periodKey}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }

  const results: PersonnelCostLine[] = [];

  for (const groupEntries of groups.values()) {
    const userId = groupEntries[0].userId;
    const rate = rates[userId] ?? { dayRate: 0, nightRate: 0 };

    const totalHours = groupEntries.reduce((sum, e) => sum + e.dayHours + e.nightHours, 0);
    const baseCost = groupEntries.reduce((sum, e) => sum + e.dayHours * rate.dayRate + e.nightHours * rate.nightRate, 0);
    const otHours = Math.max(0, totalHours - settings.thresholdHours);
    const avgRate = totalHours > 0 ? baseCost / totalHours : 0;
    const otPremium = otHours * avgRate * (settings.multiplier - 1);
    const groupTotalCost = baseCost + otPremium;

    for (const e of groupEntries) {
      const hours = e.dayHours + e.nightHours;
      const share = totalHours > 0 ? hours / totalHours : 0;
      results.push({
        entryId: e.id,
        userId: e.userId,
        taskId: e.taskId,
        date: e.date,
        hours,
        cost: groupTotalCost * share,
      });
    }
  }

  return results;
}
