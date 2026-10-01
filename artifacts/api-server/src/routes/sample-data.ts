import { Router, type IRouter } from "express";
import { eq, and, inArray, count } from "drizzle-orm";
import { db, officesTable, clientsTable, tasksTable, quotesTable, sampleDataRecordsTable } from "@workspace/db";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

// A "Load sample data" button for a brand-new company - Platform
// Maturity Roadmap, Tier 4, item 10. Scoped via AskUserQuestion to
// real, removable rows rather than a separate frontend-only demo
// mode - lets someone click around the actual app with real data, not
// a second code path to maintain. Every row's name is prefixed
// "[Sample]" so it's visibly tagged wherever it shows up in any
// existing list (no page needed a code change to render it
// differently), and `sample_data_records` tracks exactly which rows
// got created so "Remove sample data" can delete precisely those, not
// anything the company has added for real since.
router.get("/sample-data", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const [row] = await db
    .select({ value: count() })
    .from(sampleDataRecordsTable)
    .where(eq(sampleDataRecordsTable.companyId, companyId));
  res.json({ exists: (row?.value ?? 0) > 0 });
});

router.post("/sample-data/load", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const [office] = await db
    .insert(officesTable)
    .values({ companyId, name: "[Sample] Downtown Office", city: "Cape Town", country: "South Africa" })
    .returning();

  const [client] = await db
    .insert(clientsTable)
    .values({
      companyId,
      name: "[Sample] Acme Ventures",
      industry: "Corporate",
      primaryContactName: "Jane Doe",
      primaryContactRole: "Head of Security",
      email: "jane.doe@example.com",
      phone: "+27 21 555 0100",
      officeId: office.id,
    })
    .returning();

  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [task] = await db
    .insert(tasksTable)
    .values({
      companyId,
      officeId: office.id,
      clientId: client.id,
      assignedBy: req.user!.id,
      title: "[Sample] Executive Protection Detail",
      clientName: client.name,
      clientContact: "Jane Doe",
      clientRequirements: "Close protection for a 3-day executive visit.",
      dueDate,
      priority: "high",
      operatorsRequired: 2,
      armedRequired: true,
    })
    .returning();

  const [quote] = await db
    .insert(quotesTable)
    .values({
      companyId,
      officeId: office.id,
      taskId: task.id,
      clientId: client.id,
      assignedBy: req.user!.id,
      title: "[Sample] Executive Protection Detail - Quote",
      clientName: client.name,
      clientContact: "Jane Doe",
      status: "draft",
      currency: "ZAR",
    })
    .returning();

  await db.insert(sampleDataRecordsTable).values([
    { companyId, tableName: "offices", recordId: office.id },
    { companyId, tableName: "clients", recordId: client.id },
    { companyId, tableName: "tasks", recordId: task.id },
    { companyId, tableName: "quotes", recordId: quote.id },
  ]);

  res.status(201).json({ loaded: true });
});

router.delete("/sample-data", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const records = await db.select().from(sampleDataRecordsTable).where(eq(sampleDataRecordsTable.companyId, companyId));
  const idsFor = (tableName: string) => records.filter((r) => r.tableName === tableName).map((r) => r.recordId);

  // Reverse-dependency order (quotes -> tasks -> clients -> offices) so
  // a referencing row is never left pointing at something already gone,
  // even momentarily mid-request.
  const quoteIds = idsFor("quotes");
  if (quoteIds.length > 0) await db.delete(quotesTable).where(and(eq(quotesTable.companyId, companyId), inArray(quotesTable.id, quoteIds)));
  const taskIds = idsFor("tasks");
  if (taskIds.length > 0) await db.delete(tasksTable).where(and(eq(tasksTable.companyId, companyId), inArray(tasksTable.id, taskIds)));
  const clientIds = idsFor("clients");
  if (clientIds.length > 0) await db.delete(clientsTable).where(and(eq(clientsTable.companyId, companyId), inArray(clientsTable.id, clientIds)));
  const officeIds = idsFor("offices");
  if (officeIds.length > 0) await db.delete(officesTable).where(and(eq(officesTable.companyId, companyId), inArray(officesTable.id, officeIds)));

  await db.delete(sampleDataRecordsTable).where(eq(sampleDataRecordsTable.companyId, companyId));
  res.sendStatus(204);
});

export default router;
