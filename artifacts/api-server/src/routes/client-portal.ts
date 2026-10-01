import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, clientsTable, companiesTable, tasksTable, invoicesTable } from "@workspace/db";
import { buildInvoicePdf } from "../lib/invoice-pdf";
import { clientPortalLimiter } from "../lib/rate-limit";
import { formatInvoice, loadAssignedByName, invoiceNumber } from "./invoices";

const router: IRouter = Router();

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
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.portalToken, String(req.params.token)));
  if (!client) { res.status(404).json({ error: "This portal link is invalid or has been revoked." }); return; }

  const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, client.companyId));

  const taskRows = await db
    .select({ id: tasksTable.id, title: tasksTable.title, status: tasksTable.status, dueDate: tasksTable.dueDate, endDate: tasksTable.endDate })
    .from(tasksTable)
    .where(and(eq(tasksTable.companyId, client.companyId), eq(tasksTable.clientId, client.id), eq(tasksTable.archived, false)))
    .orderBy(desc(tasksTable.dueDate));

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
    invoices,
  });
});

router.get("/portal/:token/invoices/:invoiceId/pdf", clientPortalLimiter, async (req, res): Promise<void> => {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.portalToken, String(req.params.token)));
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
