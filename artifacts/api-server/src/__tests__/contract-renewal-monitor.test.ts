import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, contractsTable, clientsTable } from "@workspace/db";
import { scanForRenewingContracts } from "../lib/contract-renewal-monitor";
import { resetDb, createCompany } from "./helpers";

// Automation pass - the contract-renewal reminder monitor. Verifies
// the three things that would make this either spam someone or go
// silently useless: only a contract inside the 30-day window (or
// already overdue) gets notified, a cancelled/not-yet-due contract
// never does, and a contract already notified once doesn't get
// notified again on the next scan.
async function seedContract(companyId: number, clientId: number, overrides: Partial<typeof contractsTable.$inferInsert> = {}) {
  const [contract] = await db
    .insert(contractsTable)
    .values({
      companyId,
      clientId,
      title: "Test Retainer",
      recurringAmount: 1000,
      startDate: "2026-01-01",
      renewalDate: "2026-01-01",
      ...overrides,
    })
    .returning();
  return contract;
}

describe("contract renewal monitor", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("notifies once for a contract inside the 30-day window, skips a far-out or cancelled one, and doesn't re-notify", async () => {
    const company = await createCompany();
    const [client] = await db.insert(clientsTable).values({ companyId: company.id, name: "Test Client" }).returning();

    const inWindow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const farOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const overdue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const due = await seedContract(company.id, client.id, { renewalDate: inWindow, status: "active" });
    const notDue = await seedContract(company.id, client.id, { renewalDate: farOut, status: "active" });
    const cancelled = await seedContract(company.id, client.id, { renewalDate: overdue, status: "cancelled" });
    const alreadyNotified = await seedContract(company.id, client.id, {
      renewalDate: inWindow,
      status: "active",
      renewalNotifiedAt: new Date(),
    });

    await scanForRenewingContracts();

    const [dueRow] = await db.select().from(contractsTable).where(eq(contractsTable.id, due.id));
    const [notDueRow] = await db.select().from(contractsTable).where(eq(contractsTable.id, notDue.id));
    const [cancelledRow] = await db.select().from(contractsTable).where(eq(contractsTable.id, cancelled.id));
    const [alreadyNotifiedRow] = await db.select().from(contractsTable).where(eq(contractsTable.id, alreadyNotified.id));

    expect(dueRow.renewalNotifiedAt).not.toBeNull();
    expect(notDueRow.renewalNotifiedAt).toBeNull();
    expect(cancelledRow.renewalNotifiedAt).toBeNull();
    // Was already stamped before the scan ran - confirms the scan's own
    // isNull() filter actually excludes it rather than re-stamping.
    expect(alreadyNotifiedRow.renewalNotifiedAt).not.toBeNull();

    // A second scan must not touch the one it just notified - the real
    // "doesn't spam every scan cycle" guarantee.
    const firstStamp = dueRow.renewalNotifiedAt!.getTime();
    await scanForRenewingContracts();
    const [dueRowAgain] = await db.select().from(contractsTable).where(eq(contractsTable.id, due.id));
    expect(dueRowAgain.renewalNotifiedAt!.getTime()).toBe(firstStamp);
  });
});
