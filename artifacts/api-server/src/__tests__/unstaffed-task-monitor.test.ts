import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, tasksTable, taskAssignmentsTable } from "@workspace/db";
import { scanForUnstaffedTasks } from "../lib/unstaffed-task-monitor";
import { resetDb, createCompany, createUser } from "./helpers";

// Automation pass, flagged as the highest-priority gap found in this
// session's audit of what's still manual: an approved, ready-to-run
// job with nobody assigned is an operational risk, not a convenience.
// Verifies the exact definition this monitor depends on - approved
// quote + no roster + due inside the 48h window - and that staffing a
// task, or it not being ready to staff yet, correctly suppresses it.
function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function seedTask(companyId: number, managerId: number, overrides: Partial<typeof tasksTable.$inferInsert> = {}) {
  const [task] = await db
    .insert(tasksTable)
    .values({ companyId, title: "Test Task", assignedBy: managerId, quotationStatus: "approved", ...overrides })
    .returning();
  return task;
}

describe("unstaffed task monitor", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("notifies an approved, unstaffed task due soon (and overdue), but not a staffed one, a far-out one, or an unapproved one", async () => {
    const company = await createCompany();
    const { user: manager } = await createUser(company.id, "manager");
    const { user: cpo } = await createUser(company.id, "cpo");

    const unstaffedSoon = await seedTask(company.id, manager.id, { dueDate: hoursFromNow(24) });
    const overdueUnstaffed = await seedTask(company.id, manager.id, { dueDate: hoursFromNow(-5) });
    const staffed = await seedTask(company.id, manager.id, { dueDate: hoursFromNow(24) });
    await db.insert(taskAssignmentsTable).values({ companyId: company.id, taskId: staffed.id, operatorId: cpo.id });
    const farOut = await seedTask(company.id, manager.id, { dueDate: hoursFromNow(200) });
    const notApproved = await seedTask(company.id, manager.id, { dueDate: hoursFromNow(24), quotationStatus: "awaiting_approval" });

    await scanForUnstaffedTasks();

    const [unstaffedSoonRow] = await db.select().from(tasksTable).where(eq(tasksTable.id, unstaffedSoon.id));
    const [overdueRow] = await db.select().from(tasksTable).where(eq(tasksTable.id, overdueUnstaffed.id));
    const [staffedRow] = await db.select().from(tasksTable).where(eq(tasksTable.id, staffed.id));
    const [farOutRow] = await db.select().from(tasksTable).where(eq(tasksTable.id, farOut.id));
    const [notApprovedRow] = await db.select().from(tasksTable).where(eq(tasksTable.id, notApproved.id));

    expect(unstaffedSoonRow.unstaffedNotifiedAt).not.toBeNull();
    expect(overdueRow.unstaffedNotifiedAt).not.toBeNull();
    expect(staffedRow.unstaffedNotifiedAt).toBeNull();
    expect(farOutRow.unstaffedNotifiedAt).toBeNull();
    expect(notApprovedRow.unstaffedNotifiedAt).toBeNull();

    // A second scan must not re-touch what it already notified.
    const firstStamp = unstaffedSoonRow.unstaffedNotifiedAt!.getTime();
    await scanForUnstaffedTasks();
    const [again] = await db.select().from(tasksTable).where(eq(tasksTable.id, unstaffedSoon.id));
    expect(again.unstaffedNotifiedAt!.getTime()).toBe(firstStamp);
  });
});
