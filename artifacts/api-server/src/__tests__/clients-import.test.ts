import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import app from "../app";
import { resetDb, createCompany, createUser, sessionCookie } from "./helpers";

// Bulk CSV import (automation pass) - POST /clients/import. The one
// behavior that actually matters here: a bad row must not block every
// other good row in the same file, and the caller must be told
// exactly which rows failed and why, not just a bare count.
describe("clients bulk import", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("imports valid rows, reports errors for invalid ones by row number, and scopes everything to the caller's own company", async () => {
    const company = await createCompany();
    const { user: manager } = await createUser(company.id, "manager");
    const cookie = await sessionCookie(manager.id);

    const res = await request(app)
      .post("/api/clients/import")
      .set("Cookie", cookie)
      .send({
        rows: [
          { name: "Acme Corp", email: "acme@example.com", dayRate: "2500", nightRate: "3500" },
          { name: "", email: "noname@example.com" }, // invalid: name required
          // A rate column with a stray non-numeric value (real spreadsheets have
          // these) must not reject an otherwise-valid row - it should import
          // with that one field left blank, not rejected outright.
          { name: "Beta Inc", dayRate: "not-a-number" },
          { name: "Gamma LLC" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors.map((e: { row: number }) => e.row)).toEqual([2]);

    const rows = await db.select().from(clientsTable).where(eq(clientsTable.companyId, company.id));
    expect(rows).toHaveLength(3);
    const acme = rows.find((r) => r.name === "Acme Corp");
    expect(acme?.dayRate).toBe(2500);
    expect(acme?.nightRate).toBe(3500);
    const beta = rows.find((r) => r.name === "Beta Inc");
    expect(beta?.dayRate).toBeNull();
    expect(rows.some((r) => r.name === "Gamma LLC")).toBe(true);

    // A second company's import must never land in the first company's data.
    const otherCompany = await createCompany({ name: "Other Co" });
    const { user: otherManager } = await createUser(otherCompany.id, "manager");
    const otherCookie = await sessionCookie(otherManager.id);
    await request(app).post("/api/clients/import").set("Cookie", otherCookie).send({ rows: [{ name: "Other Co's Client" }] });

    const stillOnlyThree = await db.select().from(clientsTable).where(eq(clientsTable.companyId, company.id));
    expect(stillOnlyThree).toHaveLength(3);
  });
});
