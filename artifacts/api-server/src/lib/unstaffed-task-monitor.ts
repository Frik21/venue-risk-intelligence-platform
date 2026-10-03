import { eq, and, isNull, inArray } from "drizzle-orm";
import { db, tasksTable, taskAssignmentsTable } from "@workspace/db";
import { logger } from "./logger";
import { notifyManagement } from "./notifications";

// Automation pass, flagged as the highest-priority gap in this
// session's own audit: an approved, ready-to-run job with nobody on
// its roster is an operational risk, not just a time-saver, if it
// isn't caught until the last minute. Same setInterval-on-boot pattern
// as every other monitor in this app, but on a much shorter cycle (15
// minutes, not hourly) and a much shorter warning window (48 hours,
// not 30 days) - matching the real urgency difference between "a cert
// expires next month" and "a job starts in two days with no one
// assigned."
const UNSTAFFED_WARNING_HOURS = 48;
const SCAN_INTERVAL_MS = 15 * 60 * 1000;

function hoursUntil(dueDate: Date): number {
  return (dueDate.getTime() - Date.now()) / (60 * 60 * 1000);
}

export async function scanForUnstaffedTasks() {
  // Same definition as the frontend's own "pending_allocation" bucket
  // (lib/task-bucket.ts): quote approved, not completed/archived, no
  // CPO on the roster yet - the one bucket that actually means "ready
  // to run, just needs a body." A task still in Pending Details or
  // Quotation isn't staffable yet regardless of how close its date is.
  const candidates = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.archived, false),
        eq(tasksTable.quotationStatus, "approved"),
        isNull(tasksTable.unstaffedNotifiedAt),
      ),
    );

  const dueForCheck = candidates.filter((t) => t.status !== "completed" && t.dueDate != null && hoursUntil(t.dueDate) <= UNSTAFFED_WARNING_HOURS);
  if (dueForCheck.length === 0) return;

  const taskIds = dueForCheck.map((t) => t.id);
  const rosterRows = await db
    .select({ taskId: taskAssignmentsTable.taskId })
    .from(taskAssignmentsTable)
    .where(inArray(taskAssignmentsTable.taskId, taskIds));
  const staffedTaskIds = new Set(rosterRows.map((r) => r.taskId));

  const unstaffed = dueForCheck.filter((t) => !staffedTaskIds.has(t.id));
  if (unstaffed.length === 0) return;

  for (const task of unstaffed) {
    try {
      await db.update(tasksTable).set({ unstaffedNotifiedAt: new Date() }).where(eq(tasksTable.id, task.id));

      const hours = hoursUntil(task.dueDate!);
      await notifyManagement(
        task.companyId,
        "VenueGuard: Unstaffed task approaching",
        hours < 0
          ? `"${task.title}" was due to start ${Math.abs(Math.round(hours))} hour(s) ago and still has no CPO assigned. Check Operator Deployment.`
          : `"${task.title}" starts in ${Math.round(hours)} hour(s) and still has no CPO assigned. Check Operator Deployment.`,
      );
      logger.info({ taskId: task.id }, "Unstaffed task monitor: notification sent");
    } catch (err) {
      logger.error({ err, taskId: task.id }, "Unstaffed task monitor: scan failed for task");
    }
  }
}

export function startUnstaffedTaskMonitor() {
  scanForUnstaffedTasks().catch((err) => logger.error({ err }, "Unstaffed task monitor: initial scan failed"));
  setInterval(() => {
    scanForUnstaffedTasks().catch((err) => logger.error({ err }, "Unstaffed task monitor: interval scan failed"));
  }, SCAN_INTERVAL_MS);
}
