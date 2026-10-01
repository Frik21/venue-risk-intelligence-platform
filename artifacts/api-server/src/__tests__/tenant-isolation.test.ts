import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, clientsTable, principalsTable } from "@workspace/db";
import app from "../app";
import { resetDb, createCompany, createUser, sessionCookie } from "./helpers";

// Platform Maturity Roadmap, Tier 3, item 7 - a real test for the
// tenant-isolation gap found and fixed while building item 4 (audit
// logging on Principal access): all four of clients.ts's principal
// endpoints had no companyId check at all, so any authenticated
// session could read/write another company's principals by guessing
// an id. These tests prove that fix, and would have caught the
// original bug had they existed first.
describe("tenant isolation - clients.ts principals", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const companyA = await createCompany({ name: "Company A" });
    const companyB = await createCompany({ name: "Company B" });
    const { user: userA } = await createUser(companyA.id, "manager");
    const cookieA = await sessionCookie(userA.id);

    const [clientB] = await db.insert(clientsTable).values({ companyId: companyB.id, name: "Company B's Client" }).returning();
    const [principalB] = await db
      .insert(principalsTable)
      .values({ companyId: companyB.id, clientId: clientB.id, name: "Company B's Principal", medicalInfo: "secret" })
      .returning();

    return { companyA, companyB, cookieA, clientB, principalB };
  }

  it("never returns another company's principals from GET /clients/:id/principals", async () => {
    const { cookieA, clientB } = await setup();

    const res = await request(app).get(`/api/clients/${clientB.id}/principals`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("refuses to create a principal under another company's client", async () => {
    const { cookieA, clientB } = await setup();

    const res = await request(app)
      .post(`/api/clients/${clientB.id}/principals`)
      .set("Cookie", cookieA)
      .send({ name: "Injected Principal" });
    expect(res.status).toBe(404);
  });

  it("refuses to update another company's principal", async () => {
    const { cookieA, clientB, principalB } = await setup();

    const res = await request(app)
      .patch(`/api/clients/${clientB.id}/principals/${principalB.id}`)
      .set("Cookie", cookieA)
      .send({ medicalInfo: "tampered" });
    expect(res.status).toBe(404);

    const [stillUnchanged] = await db.select().from(principalsTable).where(eq(principalsTable.id, principalB.id));
    expect(stillUnchanged.medicalInfo).toBe("secret");
  });

  it("refuses to delete another company's principal", async () => {
    const { cookieA, clientB, principalB } = await setup();

    const res = await request(app).delete(`/api/clients/${clientB.id}/principals/${principalB.id}`).set("Cookie", cookieA);
    expect(res.status).toBe(404);

    const [stillExists] = await db.select().from(principalsTable).where(eq(principalsTable.id, principalB.id));
    expect(stillExists).toBeDefined();
  });
});
