import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, officesTable, clientsTable, tasksTable, quotesTable } from "@workspace/db";
import app from "../app";
import { resetDb, createCompany, createUser, sessionCookie } from "./helpers";

// Platform Maturity Roadmap, Tier 4, item 10 - real, removable sample
// rows. Verifies the full load -> see it tagged -> remove -> gone
// round trip against a real Postgres.
describe("sample data", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("loads a tagged Office/Client/Task/Quote and reports they exist", async () => {
    const company = await createCompany();
    const { user } = await createUser(company.id, "manager");
    const cookie = await sessionCookie(user.id);

    const before = await request(app).get("/api/sample-data").set("Cookie", cookie);
    expect(before.body.exists).toBe(false);

    const loadRes = await request(app).post("/api/sample-data/load").set("Cookie", cookie);
    expect(loadRes.status).toBe(201);

    const after = await request(app).get("/api/sample-data").set("Cookie", cookie);
    expect(after.body.exists).toBe(true);

    const [office] = await db.select().from(officesTable).where(eq(officesTable.companyId, company.id));
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.companyId, company.id));
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.companyId, company.id));
    const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.companyId, company.id));
    expect(office.name).toMatch(/^\[Sample\]/);
    expect(client.name).toMatch(/^\[Sample\]/);
    expect(task.title).toMatch(/^\[Sample\]/);
    expect(quote.title).toMatch(/^\[Sample\]/);
  });

  it("removes exactly the rows it created, and only those", async () => {
    const company = await createCompany();
    const { user } = await createUser(company.id, "manager");
    const cookie = await sessionCookie(user.id);

    // A real client the company added themselves - must survive.
    const [realClient] = await db.insert(clientsTable).values({ companyId: company.id, name: "A Real Client" }).returning();

    await request(app).post("/api/sample-data/load").set("Cookie", cookie);
    const removeRes = await request(app).delete("/api/sample-data").set("Cookie", cookie);
    expect(removeRes.status).toBe(204);

    const remainingClients = await db.select().from(clientsTable).where(eq(clientsTable.companyId, company.id));
    expect(remainingClients).toHaveLength(1);
    expect(remainingClients[0].id).toBe(realClient.id);

    const remainingOffices = await db.select().from(officesTable).where(eq(officesTable.companyId, company.id));
    const remainingTasks = await db.select().from(tasksTable).where(eq(tasksTable.companyId, company.id));
    const remainingQuotes = await db.select().from(quotesTable).where(eq(quotesTable.companyId, company.id));
    expect(remainingOffices).toHaveLength(0);
    expect(remainingTasks).toHaveLength(0);
    expect(remainingQuotes).toHaveLength(0);

    const status = await request(app).get("/api/sample-data").set("Cookie", cookie);
    expect(status.body.exists).toBe(false);
  });
});
