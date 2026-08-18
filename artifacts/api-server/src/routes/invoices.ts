import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, invoicesTable, usersTable, tasksTable } from "@workspace/db";
import { z } from "zod";
import { buildInvoicePdf } from "../lib/invoice-pdf";
import { COST_CATEGORIES } from "./quotes";

const router: IRouter = Router();

const INVOICE_STATUSES = ["draft", "sent", "paid"] as const;

function invoiceNumber(id: number) {
  return `INV-${String(id).padStart(4, "0")}`;
}

// subtotal/taxAmount/totalAmount are derived here on every read rather
// than stored, same reasoning as computeCommercials in quotes.ts - one
// source of truth for the math.
function computeTotals(row: typeof invoicesTable.$inferSelect) {
  const subtotal = row.lineItems.reduce((sum, i) => sum + i.amount, 0);
  const taxAmount = subtotal * (row.taxRatePercent / 100);
  const totalAmount = subtotal + taxAmount;
  return { subtotal, taxAmount, totalAmount };
}

function formatInvoice(
  row: typeof invoicesTable.$inferSelect,
  assignedByName: string | null,
) {
  return {
    id: row.id,
    invoiceNumber: invoiceNumber(row.id),
    taskId: row.taskId,
    quoteId: row.quoteId,
    clientId: row.clientId,
    title: row.title,
    status: row.status as (typeof INVOICE_STATUSES)[number],
    clientName: row.clientName,
    clientContact: row.clientContact,
    billingDetails: row.billingDetails,
    dueDate: row.dueDate?.toISOString() ?? null,
    lineItems: row.lineItems,
    taxRatePercent: row.taxRatePercent,
    currency: row.currency,
    assignedBy: row.assignedBy,
    assignedByName: assignedByName ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...computeTotals(row),
  };
}

async function loadAssignedByName(row: typeof invoicesTable.$inferSelect) {
  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.assignedBy));
  return user?.name ?? null;
}

// If the invoice is linked to a task, that task is now billed - see
// Task.invoiced and taskBucket() in the frontend's task-bucket.ts,
// which reports "invoiced" instead of "completed" once this is set.
// Fires on every create/update that leaves taskId set, not just a
// status transition - a saved Invoice record existing for a task IS
// what "billed" means here, same "PATCH .../checklist can flip a flag
// on another table" pattern already used for Quote approval ->
// task.quotationStatus (see routes/quotes.ts).
async function syncTaskInvoiced(taskId: number | null) {
  if (taskId == null) return;
  await db.update(tasksTable).set({ invoiced: true }).where(eq(tasksTable.id, taskId));
}

router.get("/invoices", async (_req, res): Promise<void> => {
  const rows = await db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt));
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatInvoice(r, userMap[r.assignedBy] ?? null)));
});

const InvoiceFieldsSchema = {
  taskId: z.number().int().nullable().optional(),
  quoteId: z.number().int().nullable().optional(),
  clientId: z.number().int().nullable().optional(),
  title: z.string().max(200).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  clientName: z.string().max(200).optional(),
  clientContact: z.string().max(200).optional(),
  billingDetails: z.string().max(2000).optional(),
  dueDate: z.string().nullable().optional(),
  lineItems: z.array(z.object({
    category: z.enum(COST_CATEGORIES).nullable().optional(),
    description: z.string().max(200),
    amount: z.number(),
  })).optional(),
  taxRatePercent: z.number().min(0).optional(),
  currency: z.string().min(1).max(10).optional(),
};

const InvoiceInputSchema = z.object({ ...InvoiceFieldsSchema, assignedBy: z.number().int() });
const InvoiceUpdateSchema = z.object({ ...InvoiceFieldsSchema, assignedBy: z.number().int().optional() });

// Zod's .optional() on category means a client that omits it entirely
// parses fine, but the column type requires the key present - normalize
// that gap here rather than loosening the column type.
function normalizeLineItems(items?: { category?: string | null; description: string; amount: number }[]) {
  return items?.map((i) => ({ category: i.category ?? null, description: i.description, amount: i.amount }));
}

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = InvoiceInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      taskId: parsed.data.taskId ?? null,
      quoteId: parsed.data.quoteId ?? null,
      clientId: parsed.data.clientId ?? null,
      title: parsed.data.title ?? "",
      status: parsed.data.status ?? "draft",
      clientName: parsed.data.clientName ?? "",
      clientContact: parsed.data.clientContact ?? "",
      billingDetails: parsed.data.billingDetails ?? "",
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      lineItems: normalizeLineItems(parsed.data.lineItems) ?? [],
      taxRatePercent: parsed.data.taxRatePercent ?? 0,
      currency: parsed.data.currency ?? "ZAR",
      assignedBy: parsed.data.assignedBy,
    })
    .returning();

  await syncTaskInvoiced(invoice.taskId);

  const assignedByName = await loadAssignedByName(invoice);
  res.status(201).json(formatInvoice(invoice, assignedByName));
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = InvoiceUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const { dueDate, status, lineItems, ...rest } = parsed.data;

  // Stamps sentAt/paidAt the first time the invoice moves into that
  // status - same reasoning as sentAt/decidedAt on Quotes.
  const statusStamps: Partial<typeof invoicesTable.$inferInsert> = {};
  if (status !== undefined) {
    if (status === "sent" && !existing.sentAt) statusStamps.sentAt = new Date();
    if (status === "paid" && !existing.paidAt) statusStamps.paidAt = new Date();
  }

  const [invoice] = await db
    .update(invoicesTable)
    .set({
      ...rest,
      ...(status !== undefined ? { status } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(lineItems !== undefined ? { lineItems: normalizeLineItems(lineItems) } : {}),
      ...statusStamps,
    })
    .where(eq(invoicesTable.id, id))
    .returning();

  await syncTaskInvoiced(invoice.taskId);

  const assignedByName = await loadAssignedByName(invoice);
  res.json(formatInvoice(invoice, assignedByName));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(invoicesTable).where(eq(invoicesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.status(204).end();
});

router.get("/invoices/:id/pdf", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const assignedByName = await loadAssignedByName(invoice);
  const formatted = formatInvoice(invoice, assignedByName);
  const doc = buildInvoicePdf(formatted);

  const filenameSafeTitle = invoice.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "invoice";
  const disposition = req.query.preview === "1" ? "inline" : "attachment";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filenameSafeTitle}-${invoiceNumber(invoice.id)}.pdf"`);

  doc.pipe(res);
  doc.end();
});

export default router;
