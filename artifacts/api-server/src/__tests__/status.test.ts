import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { resetDb, createCompany, createUser, sessionCookie } from "./helpers";

// Platform Maturity Roadmap, Tier 5, item 11 - the public status page's
// backend. GET /status is entirely unauthenticated (no Cookie set on
// any request below) - the whole point is being checkable during a
// real outage, which includes one that's taken out auth itself.
// Posting/editing/deleting an incident is Owner-only.
describe("public status page", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("reports operational with no incidents when none have been posted", async () => {
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.operational).toBe(true);
    expect(res.body.incidents).toEqual([]);
  });

  it("rejects an incident post with no session", async () => {
    const res = await request(app).post("/api/status/incidents").send({ title: "Outage", message: "Investigating." });
    expect(res.status).toBe(401);
  });

  it("rejects an incident post from a non-admin (Manager) session", async () => {
    const company = await createCompany();
    const { user } = await createUser(company.id, "manager");
    const cookie = await sessionCookie(user.id);

    const res = await request(app)
      .post("/api/status/incidents")
      .set("Cookie", cookie)
      .send({ title: "Outage", message: "Investigating." });
    expect(res.status).toBe(403);
  });

  it("lets the Owner (admin) post, update, and delete an incident, visible on the public GET throughout", async () => {
    const { user: owner } = await createUser(null, "admin");
    const cookie = await sessionCookie(owner.id);

    const createRes = await request(app)
      .post("/api/status/incidents")
      .set("Cookie", cookie)
      .send({ title: "Slow page loads", message: "We're looking into it." });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("investigating");
    const incidentId = createRes.body.id;

    const afterCreate = await request(app).get("/api/status");
    expect(afterCreate.body.operational).toBe(true);
    expect(afterCreate.body.incidents).toHaveLength(1);
    expect(afterCreate.body.incidents[0].title).toBe("Slow page loads");

    const updateRes = await request(app)
      .patch(`/api/status/incidents/${incidentId}`)
      .set("Cookie", cookie)
      .send({ status: "resolved" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe("resolved");

    const afterUpdate = await request(app).get("/api/status");
    expect(afterUpdate.body.incidents[0].status).toBe("resolved");

    const deleteRes = await request(app).delete(`/api/status/incidents/${incidentId}`).set("Cookie", cookie);
    expect(deleteRes.status).toBe(204);

    const afterDelete = await request(app).get("/api/status");
    expect(afterDelete.body.incidents).toEqual([]);
  });
});
