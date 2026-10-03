import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, tasksTable, clientsTable, feedbackRequestsTable } from "@workspace/db";
import app from "../app";
import { resetDb, createCompany, createUser, sessionCookie } from "./helpers";

// Automation pass - a Task moving into "completed" should generate a
// feedback request automatically, closing the quality circle without
// a Manager having to remember to click "Request Feedback" by hand.
// Verifies the one thing that actually matters here: the request row
// reliably exists after the transition, exactly once per genuine
// transition (not duplicated on a no-op re-save), and that a task
// with no linked Client record doesn't crash the status update it
// rides along on.
describe("auto feedback request on task completion", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates exactly one feedback request on the real transition into completed, never duplicates it, and never blocks a task with no linked client", async () => {
    const company = await createCompany();
    const { user: manager } = await createUser(company.id, "manager");
    const cookie = await sessionCookie(manager.id);

    const [client] = await db.insert(clientsTable).values({ companyId: company.id, name: "Acme Corp", email: "acme@example.com" }).returning();
    const [taskWithClient] = await db.insert(tasksTable).values({ companyId: company.id, title: "Task With Client", assignedBy: manager.id, clientId: client.id }).returning();
    const [taskNoClient] = await db.insert(tasksTable).values({ companyId: company.id, title: "Task With No Client", assignedBy: manager.id }).returning();

    const res1 = await request(app).patch(`/api/tasks/${taskWithClient.id}`).set("Cookie", cookie).send({ status: "completed" });
    expect(res1.status).toBe(200);

    const requestsForClientTask = await db.select().from(feedbackRequestsTable).where(eq(feedbackRequestsTable.taskId, taskWithClient.id));
    expect(requestsForClientTask).toHaveLength(1);
    expect(requestsForClientTask[0].requestedBy).toBe(manager.id);

    // Re-saving an already-completed task (e.g. editing some other
    // field) must not generate a second request.
    await request(app).patch(`/api/tasks/${taskWithClient.id}`).set("Cookie", cookie).send({ status: "completed", priority: "high" });
    const stillOne = await db.select().from(feedbackRequestsTable).where(eq(feedbackRequestsTable.taskId, taskWithClient.id));
    expect(stillOne).toHaveLength(1);

    // No linked client - still generates the request row (reachable to
    // copy/send by hand later), and critically doesn't crash the
    // status update itself.
    const res2 = await request(app).patch(`/api/tasks/${taskNoClient.id}`).set("Cookie", cookie).send({ status: "completed" });
    expect(res2.status).toBe(200);
    const requestsForNoClientTask = await db.select().from(feedbackRequestsTable).where(eq(feedbackRequestsTable.taskId, taskNoClient.id));
    expect(requestsForNoClientTask).toHaveLength(1);
  });
});
