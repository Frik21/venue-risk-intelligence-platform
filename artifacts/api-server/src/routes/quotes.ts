import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, quotesTable, venuesTable, usersTable } from "@workspace/db";
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
  proposedCpoNames: string[],
) {
  return {
    id: row.id,
    quoteNumber: quoteNumber(row.id),
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
    proposedCpoIds: row.proposedCpoIds,
    proposedCpoNames,
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
  const cpoUsers = row.proposedCpoIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const cpoMap: Record<number, string> = {};
  for (const u of cpoUsers) cpoMap[u.id] = u.name;
  const proposedCpoNames = row.proposedCpoIds.map((id) => cpoMap[id] ?? `User #${id}`);
  return { venueName: venue?.name ?? null, assignedByName: assignedByUser?.name ?? null, proposedCpoNames };
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
        r.proposedCpoIds.map((id) => userMap[id] ?? `User #${id}`),
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
  proposedCpoIds: z.array(z.number().int()).optional(),
};

const QuoteInputSchema = z.object({ ...QuoteFieldsSchema, assignedBy: z.number().int() });
const QuoteUpdateSchema = z.object({ ...QuoteFieldsSchema, assignedBy: z.number().int().optional() });

router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = QuoteInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [quote] = await db
    .insert(quotesTable)
    .values({
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
      proposedCpoIds: parsed.data.proposedCpoIds ?? [],
    })
    .returning();

  const ctx = await loadContext(quote);
  res.status(201).json(formatQuote(quote, ctx.venueName, ctx.assignedByName, ctx.proposedCpoNames));
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

  const ctx = await loadContext(quote);
  res.json(formatQuote(quote, ctx.venueName, ctx.assignedByName, ctx.proposedCpoNames));
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
  const formatted = formatQuote(quote, ctx.venueName, ctx.assignedByName, ctx.proposedCpoNames);
  const doc = buildQuotePdf(formatted);

  const filenameSafeTitle = quote.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "quote";
  const disposition = req.query.preview === "1" ? "inline" : "attachment";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filenameSafeTitle}-${quoteNumber(quote.id)}.pdf"`);

  doc.pipe(res);
  doc.end();
});

export default router;
