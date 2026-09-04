import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { db, contractsTable, clientsTable } from "@workspace/db";
import { z } from "zod";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

const CONTRACT_STATUSES = ["active", "expired", "cancelled"] as const;
const BILLING_FREQUENCIES = ["monthly", "quarterly", "annually"] as const;

function formatContract(row: typeof contractsTable.$inferSelect, clientName: string | null) {
  return {
    id: row.id,
    companyId: row.companyId,
    clientId: row.clientId,
    clientName,
    title: row.title,
    status: row.status as (typeof CONTRACT_STATUSES)[number],
    recurringAmount: row.recurringAmount,
    billingFrequency: row.billingFrequency as (typeof BILLING_FREQUENCIES)[number],
    currency: row.currency,
    startDate: row.startDate,
    renewalDate: row.renewalDate,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Company-wide (not client-nested) since the Contracts page needs a
// single cross-client list to sort renewing-soon-first - same shape
// as GET /vendors, GET /clients, etc.
router.get("/contracts", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const rows = await db
    .select({ contract: contractsTable, clientName: clientsTable.name })
    .from(contractsTable)
    .leftJoin(clientsTable, eq(contractsTable.clientId, clientsTable.id))
    .where(eq(contractsTable.companyId, companyId))
    .orderBy(asc(contractsTable.renewalDate));

  res.json(rows.map((r) => formatContract(r.contract, r.clientName)));
});

const ContractInputSchema = z.object({
  clientId: z.number().int(),
  title: z.string().trim().min(1).max(200),
  status: z.enum(CONTRACT_STATUSES).optional(),
  recurringAmount: z.number().nonnegative(),
  billingFrequency: z.enum(BILLING_FREQUENCIES).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  startDate: z.string().min(1),
  renewalDate: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

router.post("/contracts", async (req, res): Promise<void> => {
  const parsed = ContractInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await resolveCompanyId(req.user!.companyId);

  const [client] = await db
    .select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable)
    .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.companyId, companyId)));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }

  const [contract] = await db
    .insert(contractsTable)
    .values({
      companyId,
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      status: parsed.data.status ?? "active",
      recurringAmount: parsed.data.recurringAmount,
      billingFrequency: parsed.data.billingFrequency ?? "monthly",
      currency: parsed.data.currency ?? "ZAR",
      startDate: parsed.data.startDate,
      renewalDate: parsed.data.renewalDate,
      notes: parsed.data.notes ?? "",
    })
    .returning();

  res.status(201).json(formatContract(contract, client.name));
});

const ContractUpdateSchema = ContractInputSchema.partial();

router.patch("/contracts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ContractUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await resolveCompanyId(req.user!.companyId);

  if (parsed.data.clientId != null) {
    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.id, parsed.data.clientId), eq(clientsTable.companyId, companyId)));
    if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  }

  const [contract] = await db
    .update(contractsTable)
    .set(parsed.data)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.companyId, companyId)))
    .returning();
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }

  const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, contract.clientId));
  res.json(formatContract(contract, client?.name ?? null));
});

router.delete("/contracts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const companyId = await resolveCompanyId(req.user!.companyId);
  const [deleted] = await db
    .delete(contractsTable)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.companyId, companyId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Contract not found" }); return; }
  res.sendStatus(204);
});

export default router;
