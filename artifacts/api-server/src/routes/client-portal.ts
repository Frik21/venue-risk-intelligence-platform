import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, clientsTable, companiesTable, tasksTable, invoicesTable, quotesTable } from "@workspace/db";
import { z } from "zod";
import { buildInvoicePdf } from "../lib/invoice-pdf";
import { clientPortalLimiter, clientPortalActionLimiter } from "../lib/rate-limit";
import { formatInvoice, loadAssignedByName, invoiceNumber } from "./invoices";
import { computeCommercials, applyApprovalSideEffects } from "./quotes";

const router: IRouter = Router();

function quoteNumber(id: number) {
  return `Q-${String(id).padStart(4, "0")}`;
}

// Client-facing quote shape - deliberately narrower than quotes.ts's
// own formatQuote: a client sees what they'd pay (clientPrice/
// taxAmount/totalQuoteValue), never the internal cost build-up that
// produced it (internalCost, markupAmount/Type, costLineItems) - that
// margin is this company's own business, not the client's to see.
function formatPortalQuote(row: typeof quotesTable.$inferSelect) {
  const { internalCost: _internalCost, markupAmount: _markupAmount, ...commercials } = computeCommercials(row);
  return {
    id: row.id,
    quoteNumber: quoteNumber(row.id),
    title: row.title,
    status: row.status,
    validUntil: row.validUntil?.toISOString() ?? null,
    currency: row.currency,
    sentAt: row.sentAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    signedByName: row.signedByName,
    signedAt: row.signedAt?.toISOString() ?? null,
    ...commercials,
  };
}

async function loadClientByToken(token: string) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.portalToken, token));
  return client;
}

// Client Portal - Following Roadmap Tier 3, item 25 ("the client sees
// their own task status/invoices instead of chasing email"). No
// client login/password anywhere in this app (that's a much bigger
// build - real accounts, password resets, etc. - for a party VenueGuard
// doesn't itself manage) - same "opaque unguessable link, no email
// infra to send it automatically, a Manager generates it and sends it
// themselves" pattern already established for feedback_requests and
// admin-created users' initial passwords. Unlike feedback_requests'
// token, clients.portalToken is persistent (not single-use) and lives
// on the Client row itself, not a separate table - rotated by
// generating a new one (POST /clients/:id/portal-link in routes/clients.ts),
// not consumed on read.
//
// Read-only by construction - no POST/PATCH routes exist here at all.
// Deliberately returns only what the roadmap item itself asked for
// (task status + invoices), never internal fields like personnel
// cost, quote cost build-up, or other clients' data - every query
// below is scoped through the token's own clientId, never trusting
// anything client-supplied. Reuses invoices.ts's own formatInvoice
// (now exported) rather than reimplementing the totals/number math a
// second time with a drift risk.
router.get("/portal/:token", clientPortalLimiter, async (req, res): Promise<void> => {
  const client = await loadClientByToken(String(req.params.token));
  if (!client) { res.status(404).json({ error: "This portal link is invalid or has been revoked." }); return; }

  const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, client.companyId));

  const taskRows = await db
    .select({ id: tasksTable.id, title: tasksTable.title, status: tasksTable.status, dueDate: tasksTable.dueDate, endDate: tasksTable.endDate })
    .from(tasksTable)
    .where(and(eq(tasksTable.companyId, client.companyId), eq(tasksTable.clientId, client.id), eq(tasksTable.archived, false)))
    .orderBy(desc(tasksTable.dueDate));

  // Following Roadmap Tier 3, item 26 - a client reviews (and, while
  // status is "sent", signs or declines) their own quotes here. "draft"
  // quotes are excluded, same reasoning as draft invoices above - not
  // final/sent yet.
  const quoteRows = await db
    .select()
    .from(quotesTable)
    .where(and(eq(quotesTable.companyId, client.companyId), eq(quotesTable.clientId, client.id)))
    .orderBy(desc(quotesTable.createdAt));

  const invoiceRows = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.companyId, client.companyId), eq(invoicesTable.clientId, client.id)))
    .orderBy(desc(invoicesTable.createdAt));

  const invoices = await Promise.all(
    invoiceRows
      .filter((i) => i.status !== "draft") // a draft invoice isn't final yet - nothing to show the client
      .map(async (i) => {
        const assignedByName = await loadAssignedByName(i);
        const { lineItems: _lineItems, billingDetails: _billingDetails, clientContact: _clientContact, assignedByName: _assignedByName, ...rest } = formatInvoice(i, assignedByName);
        return rest; // strip internal-facing fields (assignee identity, raw billing contact block, line-item build-up) - the client sees status/totals, not the cost breakdown
      }),
  );

  res.json({
    clientName: client.name,
    companyName: company?.name ?? "the company",
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate?.toISOString() ?? null,
      endDate: t.endDate?.toISOString() ?? null,
    })),
    quotes: quoteRows.filter((q) => q.status !== "draft").map(formatPortalQuote),
    invoices,
  });
});

const SignQuoteSchema = z.object({ signedByName: z.string().trim().min(1).max(200) });

// E-signature - Following Roadmap Tier 3, item 26 ("not just a status
// flip - more defensible if a dispute comes up"). Only signable while
// "sent" (not already decided, not a draft the client was never shown)
// - 409s otherwise rather than silently re-recording a signature over
// an existing decision. Shares the exact same task-sync/auto-invoice
// side effects as the authenticated Manager-side PATCH /quotes/:id
// approval (routes/quotes.ts's applyApprovalSideEffects, extracted
// specifically so this flow never drifts from that one).
router.post("/portal/:token/quotes/:quoteId/sign", clientPortalActionLimiter, async (req, res): Promise<void> => {
  const client = await loadClientByToken(String(req.params.token));
  if (!client) { res.status(404).json({ error: "This portal link is invalid or has been revoked." }); return; }

  const quoteId = Number(req.params.quoteId);
  if (isNaN(quoteId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = SignQuoteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db
    .select()
    .from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, client.companyId), eq(quotesTable.clientId, client.id)));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "sent") { res.status(409).json({ error: "This quote has already been decided or isn't ready to sign yet." }); return; }

  const now = new Date();
  const [quote] = await db
    .update(quotesTable)
    .set({ status: "approved", decidedAt: existing.decidedAt ?? now, signedByName: parsed.data.signedByName, signedAt: now })
    .where(eq(quotesTable.id, quoteId))
    .returning();

  await applyApprovalSideEffects(quote, true);

  res.json(formatPortalQuote(quote));
});

// Declining needs no signature to prove - there's nothing to dispute
// about turning work down, unlike agreeing to pay for it.
router.post("/portal/:token/quotes/:quoteId/decline", clientPortalActionLimiter, async (req, res): Promise<void> => {
  const client = await loadClientByToken(String(req.params.token));
  if (!client) { res.status(404).json({ error: "This portal link is invalid or has been revoked." }); return; }

  const quoteId = Number(req.params.quoteId);
  if (isNaN(quoteId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, client.companyId), eq(quotesTable.clientId, client.id)));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "sent") { res.status(409).json({ error: "This quote has already been decided or isn't ready to decline yet." }); return; }

  const [quote] = await db
    .update(quotesTable)
    .set({ status: "rejected", decidedAt: existing.decidedAt ?? new Date() })
    .where(eq(quotesTable.id, quoteId))
    .returning();

  res.json(formatPortalQuote(quote));
});

router.get("/portal/:token/invoices/:invoiceId/pdf", clientPortalLimiter, async (req, res): Promise<void> => {
  const client = await loadClientByToken(String(req.params.token));
  if (!client) { res.status(404).json({ error: "This portal link is invalid or has been revoked." }); return; }

  const invoiceId = Number(req.params.invoiceId);
  if (isNaN(invoiceId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, client.companyId), eq(invoicesTable.clientId, client.id)));
  if (!invoice || invoice.status === "draft") { res.status(404).json({ error: "Invoice not found" }); return; }

  const assignedByName = await loadAssignedByName(invoice);
  const doc = buildInvoicePdf(formatInvoice(invoice, assignedByName));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoiceNumber(invoice.id)}.pdf"`);
  doc.pipe(res);
  doc.end();
});

export default router;
