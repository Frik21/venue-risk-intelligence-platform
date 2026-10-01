import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { resetDb, createCompany, createUser, sessionCookie } from "./helpers";

// Platform Maturity Roadmap, Tier 3, item 7 - checkSeatAvailable()
// (routes/companies.ts) is the one shared rule both real
// user-creation paths check before inserting. BASE_SEATS_BY_ROLE.manager
// is 8 - these tests fill that base exactly, then prove the 9th is
// rejected and a 10th seat purchased (additionalManagerSeats) opens
// the door back up.
describe("seat-limit enforcement", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("allows creating a Manager up to the base seat count (8)", async () => {
    const company = await createCompany();
    const { user: hr } = await createUser(company.id, "human_resources");
    const cookie = await sessionCookie(hr.id);

    for (let i = 0; i < 8; i++) {
      await createUser(company.id, "manager", { email: `existing-manager-${i}@test.local` });
    }

    const res = await request(app)
      .post("/api/users")
      .set("Cookie", cookie)
      .send({ name: "One More Manager", email: "one-more@test.local", role: "manager" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Seat limit reached/);
  });

  it("allows a 9th Manager once an additional seat has been bought", async () => {
    const company = await createCompany({ additionalManagerSeats: 1 });
    const { user: hr } = await createUser(company.id, "human_resources");
    const cookie = await sessionCookie(hr.id);

    for (let i = 0; i < 8; i++) {
      await createUser(company.id, "manager", { email: `existing-manager-${i}@test.local` });
    }

    const res = await request(app)
      .post("/api/users")
      .set("Cookie", cookie)
      .send({ name: "The Extra Seat", email: "extra-seat@test.local", role: "manager" });
    expect(res.status).toBe(201);
  });

  it("doesn't count a deactivated Manager against the seat limit", async () => {
    const company = await createCompany();
    const { user: hr } = await createUser(company.id, "human_resources");
    const cookie = await sessionCookie(hr.id);

    for (let i = 0; i < 7; i++) {
      await createUser(company.id, "manager", { email: `existing-manager-${i}@test.local` });
    }
    // An 8th, but deactivated - shouldn't occupy a seat.
    await createUser(company.id, "manager", { email: "deactivated-manager@test.local", active: false });

    const res = await request(app)
      .post("/api/users")
      .set("Cookie", cookie)
      .send({ name: "Still Room", email: "still-room@test.local", role: "manager" });
    expect(res.status).toBe(201);
  });
});
