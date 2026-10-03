import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { db, tasksTable, taskAssignmentsTable, taskLocationPingsTable } from "@workspace/db";
import app from "../app";
import { resetDb, createCompany, createUser, sessionCookie } from "./helpers";

// GSOC Dashboard's Live Operator Map - GET /task-location-pings/live-map.
// Verifies the three things that would make this misleading on a
// console whose whole job is "where is everyone right now": stale
// pings (outside the 30-minute window) must not show as live, a CPO
// with multiple pings must only show their most recent one, and one
// company can never see another company's operators.
async function seedTask(companyId: number, managerId: number) {
  const [task] = await db.insert(tasksTable).values({ companyId, title: "Test Task", assignedBy: managerId }).returning();
  return task;
}

async function assignRoster(companyId: number, taskId: number, operatorId: number) {
  await db.insert(taskAssignmentsTable).values({ companyId, taskId, operatorId });
}

async function insertPing(companyId: number, taskId: number, cpoId: number, capturedAt: Date, lat = -33.9, lng = 18.4) {
  await db.insert(taskLocationPingsTable).values({ companyId, taskId, cpoId, latitude: lat, longitude: lng, capturedAt });
}

describe("GSOC live operator map", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("shows only the most recent ping per CPO, excludes pings older than 30 minutes, and never leaks another company's data", async () => {
    const company = await createCompany();
    const { user: manager } = await createUser(company.id, "manager");
    const cookie = await sessionCookie(manager.id);

    const { user: freshCpo } = await createUser(company.id, "cpo");
    const { user: staleCpo } = await createUser(company.id, "cpo");
    const task = await seedTask(company.id, manager.id);
    await assignRoster(company.id, task.id, freshCpo.id);
    await assignRoster(company.id, task.id, staleCpo.id);

    // freshCpo: an older ping, then a newer one - the live map must
    // return only the newer coordinates.
    await insertPing(company.id, task.id, freshCpo.id, new Date(Date.now() - 10 * 60 * 1000), -1, -1);
    await insertPing(company.id, task.id, freshCpo.id, new Date(Date.now() - 2 * 60 * 1000), -33.9249, 18.4241);

    // staleCpo: a 45-minute-old ping - outside the 30-minute window,
    // must not appear at all.
    await insertPing(company.id, task.id, staleCpo.id, new Date(Date.now() - 45 * 60 * 1000));

    // A second company's own CPO/task/ping - must never appear here.
    const otherCompany = await createCompany({ name: "Other Co" });
    const { user: otherManager } = await createUser(otherCompany.id, "manager");
    const { user: otherCpo } = await createUser(otherCompany.id, "cpo");
    const otherTask = await seedTask(otherCompany.id, otherManager.id);
    await assignRoster(otherCompany.id, otherTask.id, otherCpo.id);
    await insertPing(otherCompany.id, otherTask.id, otherCpo.id, new Date());

    const res = await request(app).get("/api/task-location-pings/live-map").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].cpoId).toBe(freshCpo.id);
    expect(res.body[0].latitude).toBeCloseTo(-33.9249);
    expect(res.body[0].longitude).toBeCloseTo(18.4241);
    expect(res.body[0].taskId).toBe(task.id);
  });
});
