import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, quotesTable, venuesTable, usersTable, tasksTable, invoicesTable } from "@workspace/db";
import { z } from "zod";
import { buildQuotePdf } from "../lib/quote-pdf";

const router: IRouter = Router();

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const QUOTE_STATUSES = ["draft", "sent", "approved", "rejected"] as const;
const MARKUP_TYPES = ["percent", "fixed"] as const;
export const COST_CATEGORIES = [
  "cpo_rate", "overtime", "vehicles", "fuel_mileage", "accommodation",
  "flights_travel", "equipment", "subcontractors", "allowances", "misc",
] as const;

function quoteNumber(id: number) {
  return `Q-${String(id).padStart(4, "0")}`;
}

// internalCost/markupAmount/clientPrice/taxAmount/totalQuoteValue are
// derived here on every read rather than stored, so there's exactly
// one source of truth for the math (see Commercials comment in
// schema/quotes.ts).
function computeCommercials(row: typeof quotesTable.$inferSelect) {
  const internalCost = row.costLineItems.reduce((sum, i) => sum + i.amount, 0);
  const markupAmount = row.markupType === "percent" ? internalCost * (row.markupValue / 100) : row.markupValue;
  const clientPrice = internalCost + markupAmount;
  const taxAmount = clientPrice * (row.taxRatePercent / 100);
  const totalQuoteValue = clientPrice + taxAmount;
  return { internalCost, markupAmount, clientPrice, taxAmount, totalQuoteValue };
}

function formatQuote(
  row: typeof quotesTable.$inferSelect,
  venueName: string | null,
  assignedByName: string | null,
) {
  return {
    id: row.id,
    quoteNumber: quoteNumber(row.id),
    taskId: row.taskId,
    title: row.title,
    status: row.status as (typeof QUOTE_STATUSES)[number],
    validUntil: row.validUntil?.toISOString() ?? null,
    clientId: row.clientId,
    clientName: row.clientName,
    clientContact: row.clientContact,
    billingDetails: row.billingDetails,
    venueId: row.venueId,
    venueName: venueName ?? null,
    clientRequirements: row.clientRequirements,
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    priority: row.priority as (typeof PRIORITIES)[number],
    operatorsRequired: row.operatorsRequired,
    armedRequired: row.armedRequired,
    vehiclesRequired: row.vehiclesRequired,
    additionalEquipment: row.additionalEquipment,
    costLineItems: row.costLineItems,
    markupType: row.markupType as (typeof MARKUP_TYPES)[number],
    markupValue: row.markupValue,
    taxRatePercent: row.taxRatePercent,
    currency: row.currency,
    assignedBy: row.assignedBy,
    assignedByName: assignedByName ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...computeCommercials(row),
  };
}

async function loadContext(row: typeof quotesTable.$inferSelect) {
  const [venue] = row.venueId != null
    ? await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, row.venueId))
    : [undefined];
  const [assignedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.assignedBy));
  return { venueName: venue?.name ?? null, assignedByName: assignedByUser?.name ?? null };
}

router.get("/quotes", async (_req, res): Promise<void> => {
  const rows = await db.select().from(quotesTable).orderBy(desc(quotesTable.createdAt));
  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name }).from(venuesTable);
  const venueMap: Record<number, string> = {};
  for (const v of venues) venueMap[v.id] = v.name;
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(
    rows.map((r) =>
      formatQuote(
        r,
        r.venueId != null ? (venueMap[r.venueId] ?? null) : null,
        userMap[r.assignedBy] ?? null,
      ),
    ),
  );
});

const CostLineItemSchema = z.object({
  category: z.enum(COST_CATEGORIES),
  description: z.string().max(200),
  amount: z.number(),
});

const QuoteFieldsSchema = {
  taskId: z.number().int().nullable().optional(),
  title: z.string().max(200).optional(),
  status: z.enum(QUOTE_STATUSES).optional(),
  validUntil: z.string().nullable().optional(),
  clientId: z.number().int().nullable().optional(),
  clientName: z.string().max(200).optional(),
  clientContact: z.string().max(200).optional(),
  billingDetails: z.string().max(2000).optional(),
  venueId: z.number().int().nullable().optional(),
  clientRequirements: z.string().max(2000).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  operatorsRequired: z.number().int().min(0).optional(),
  armedRequired: z.boolean().optional(),
  vehiclesRequired: z.number().int().min(0).optional(),
  additionalEquipment: z.string().max(2000).optional(),
  costLineItems: z.array(CostLineItemSchema).optional(),
  markupType: z.enum(MARKUP_TYPES).optional(),
  markupValue: z.number().optional(),
  taxRatePercent: z.number().min(0).optional(),
  currency: z.string().min(1).max(10).optional(),
};

const QuoteInputSchema = z.object({ ...QuoteFieldsSchema, assignedBy: z.number().int() });
const QuoteUpdateSchema = z.object({ ...QuoteFieldsSchema, assignedBy: z.number().int().optional() });

router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = QuoteInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [quote] = await db
    .insert(quotesTable)
    .values({
      taskId: parsed.data.taskId ?? null,
      title: parsed.data.title ?? "",
      status: parsed.data.status ?? "draft",
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : undefined,
      clientId: parsed.data.clientId ?? null,
      clientName: parsed.data.clientName ?? "",
      clientContact: parsed.data.clientContact ?? "",
      billingDetails: parsed.data.billingDetails ?? "",
      venueId: parsed.data.venueId ?? null,
      clientRequirements: parsed.data.clientRequirements ?? "",
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      priority: parsed.data.priority ?? "medium",
      operatorsRequired: parsed.data.operatorsRequired ?? 1,
      armedRequired: parsed.data.armedRequired ?? false,
      vehiclesRequired: parsed.data.vehiclesRequired ?? 0,
      additionalEquipment: parsed.data.additionalEquipment ?? "",
      costLineItems: parsed.data.costLineItems ?? [],
      markupType: parsed.data.markupType ?? "percent",
      markupValue: parsed.data.markupValue ?? 0,
      taxRatePercent: parsed.data.taxRatePercent ?? 0,
      currency: parsed.data.currency ?? "ZAR",
      assignedBy: parsed.data.assignedBy,
    })
    .returning();

  const ctx = await loadContext(quote);
  res.status(201).json(formatQuote(quote, ctx.venueName, ctx.assignedByName));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = QuoteUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }

  const { validUntil, startDate, endDate, status, ...rest } = parsed.data;

  // Stamps sentAt/decidedAt the first time a quote moves into that
  // status - never cleared automatically if it's later edited back to
  // draft, so there's still a record of when it was originally sent/
  // decided.
  const statusStamps: Partial<typeof quotesTable.$inferInsert> = {};
  if (status !== undefined) {
    if (status === "sent" && !existing.sentAt) statusStamps.sentAt = new Date();
    if ((status === "approved" || status === "rejected") && !existing.decidedAt) statusStamps.decidedAt = new Date();
  }

  const [quote] = await db
    .update(quotesTable)
    .set({
      ...rest,
      ...(status !== undefined ? { status } : {}),
      ...(validUntil !== undefined ? { validUntil: validUntil ? new Date(validUntil) : null } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...statusStamps,
    })
    .where(eq(quotesTable.id, id))
    .returning();

  // Approving the Quote is what actually moves its linked Task out of
  // the "Quotation" bucket and into "Pending Allocation" (see
  // taskBucket() in task-bucket.ts, which reads task.quotationStatus -
  // a separate field from this Quote's own status, per direct product
  // direction: quote approval is the trigger, not merely creating/
  // saving one). Only fires on this explicit transition, not on every
  // edit of an already-approved quote.
  const justApproved = status === "approved" && existing.status !== "approved";
  if (justApproved && quote.taskId != null) {
    await db.update(tasksTable).set({ quotationStatus: "approved" }).where(eq(tasksTable.id, quote.taskId));
  }

  // Auto-create a draft Invoice the moment a Quote is approved, per
  // direct product direction - the same "prefill from an approved
  // Quote" the manual Task Pending Invoice flow already does
  // (invoice-dialog.tsx's initialQuote prop), just triggered
  // automatically instead of waiting for a Manager to open the
  // dialog. A Manager can then add further, categorized line items
  // for costs beyond the quoted amount (operational costs, additional
  // manpower, vehicles, etc. - COST_CATEGORIES above, shared with
  // Quotes' own cost build-up). Guarded on the same justApproved
  // transition, plus a check for an existing invoice against this
  // quote, so re-saving an already-approved quote (or a quote that
  // already had one manually created) never creates a duplicate.
  if (justApproved) {
    const [existingInvoice] = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.quoteId, quote.id));
    if (!existingInvoice) {
      const { totalQuoteValue } = computeCommercials(quote);
      const [draftInvoice] = await db
        .insert(invoicesTable)
        .values({
          taskId: quote.taskId,
          quoteId: quote.id,
          clientId: quote.clientId,
          title: quote.title,
          status: "draft",
          clientName: quote.clientName,
          clientContact: quote.clientContact,
          billingDetails: quote.billingDetails,
          lineItems: [{ category: null, description: quote.title || "Services rendered", amount: totalQuoteValue }],
          taxRatePercent: quote.taxRatePercent,
          currency: quote.currency,
          assignedBy: quote.assignedBy,
        })
        .returning();
      // Same "a saved Invoice record existing for a task IS what
      // billed means" sync as manual invoice creation - see
      // syncTaskInvoiced in routes/invoices.ts.
      if (draftInvoice.taskId != null) {
        await db.update(tasksTable).set({ invoiced: true }).where(eq(tasksTable.id, draftInvoice.taskId));
      }
    }
  }

  const ctx = await loadContext(quote);
  res.json(formatQuote(quote, ctx.venueName, ctx.assignedByName));
});

router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(quotesTable).where(eq(quotesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Quote not found" }); return; }
  res.status(204).end();
});

router.get("/quotes/:id/pdf", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

  const ctx = await loadContext(quote);
  const formatted = formatQuote(quote, ctx.venueName, ctx.assignedByName);
  const doc = buildQuotePdf(formatted);

  const filenameSafeTitle = quote.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "quote";
  const disposition = req.query.preview === "1" ? "inline" : "attachment";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filenameSafeTitle}-${quoteNumber(quote.id)}.pdf"`);

  doc.pipe(res);
  doc.end();
});

export default router;
