import { eq, and, desc } from "drizzle-orm";
import { db, tasksTable, taskAssignmentsTable, checkinsTable } from "@workspace/db";
import { logger } from "./logger";

// Background scan for overdue scheduled check-ins - same setInterval
// pattern as lib/gdelt-monitor.ts's checkAllRunningVenues, applied to
// personnel safety instead of venue intelligence. For every in_progress
// task with tasks.checkInIntervalMinutes set, and every CPO on that
// task's roster, finds their most recent check-in (any type) for that
// task and raises a "missed" check-in if the gap has grown past the
// task's own interval. Deliberately doesn't re-raise once a "missed"
// row already exists for the current gap (checked by looking at the
// most recent row's own type) - avoids spamming a new "missed" alert
// every scan cycle while a real one already sits unacknowledged; the
// CPO checking in again (a new "ok") or Command Desk acknowledging it
// starts the clock over.
const SCAN_INTERVAL_MS = 5 * 60 * 1000;

async function scanForMissedCheckins() {
  const tasks = await db
    .select({ id: tasksTable.id, companyId: tasksTable.companyId, checkInIntervalMinutes: tasksTable.checkInIntervalMinutes })
    .from(tasksTable)
    .where(and(eq(tasksTable.status, "in_progress"), eq(tasksTable.archived, false)));

  const scheduled = tasks.filter((t): t is typeof t & { checkInIntervalMinutes: number } => t.checkInIntervalMinutes != null);
  if (scheduled.length === 0) return;

  for (const task of scheduled) {
    const roster = await db
      .select({ operatorId: taskAssignmentsTable.operatorId })
      .from(taskAssignmentsTable)
      .where(eq(taskAssignmentsTable.taskId, task.id));

    for (const { operatorId } of roster) {
      try {
        const [lastCheckin] = await db
          .select()
          .from(checkinsTable)
          .where(and(eq(checkinsTable.taskId, task.id), eq(checkinsTable.cpoId, operatorId)))
          .orderBy(desc(checkinsTable.triggeredAt))
          .limit(1);

        if (lastCheckin?.type === "missed") continue;

        const sinceLast = lastCheckin ? Date.now() - lastCheckin.triggeredAt.getTime() : Infinity;
        const overdueMs = task.checkInIntervalMinutes * 60 * 1000;
        if (sinceLast < overdueMs) continue;

        await db.insert(checkinsTable).values({ companyId: task.companyId, taskId: task.id, cpoId: operatorId, type: "missed" });
        logger.info({ taskId: task.id, operatorId }, "Check-in monitor: missed check-in raised");
      } catch (err) {
        logger.error({ err, taskId: task.id, operatorId }, "Check-in monitor: scan failed for operator");
      }
    }
  }
}

// Starts the recurring scan - runs once immediately, then every
// SCAN_INTERVAL_MS for as long as this server process is up. No
// external cron here, matching the GDELT monitor's own limitation.
export function startCheckinMonitor() {
  scanForMissedCheckins().catch((err) => logger.error({ err }, "Check-in monitor: initial scan failed"));
  setInterval(() => {
    scanForMissedCheckins().catch((err) => logger.error({ err }, "Check-in monitor: interval scan failed"));
  }, SCAN_INTERVAL_MS);
}
