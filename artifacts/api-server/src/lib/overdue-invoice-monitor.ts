import { eq, and, isNull, lt } from "drizzle-orm";
import { db, invoicesTable } from "@workspace/db";
import { logger } from "./logger";
import { notifyManagement } from "./notifications";

// Real notifications - Following Roadmap Tier 3, item 29. Background
// scan for invoices that just became overdue, same setInterval-on-boot
// pattern as lib/checkin-monitor.ts - a sent invoice whose dueDate has
// passed and that hasn't been notified yet (overdueNotifiedAt still
// null) gets one notification and is marked so it's never re-sent on
// a later scan cycle (see that column's own schema comment for the
// "never cleared" tradeoff this accepts).
const SCAN_INTERVAL_MS = 30 * 60 * 1000;

async function scanForOverdueInvoices() {
  const overdue = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.status, "sent"), lt(invoicesTable.dueDate, new Date()), isNull(invoicesTable.overdueNotifiedAt)));

  for (const invoice of overdue) {
    try {
      await db.update(invoicesTable).set({ overdueNotifiedAt: new Date() }).where(eq(invoicesTable.id, invoice.id));
      await notifyManagement(
        invoice.companyId,
        "VenueGuard: Invoice overdue",
        `Invoice for "${invoice.title || invoice.clientName || "a client"}" is now overdue (was due ${invoice.dueDate?.toDateString()}). Check Aging Receivables on /admin/invoices.`,
      );
      logger.info({ invoiceId: invoice.id }, "Overdue invoice monitor: notification sent");
    } catch (err) {
      logger.error({ err, invoiceId: invoice.id }, "Overdue invoice monitor: scan failed for invoice");
    }
  }
}

export function startOverdueInvoiceMonitor() {
  scanForOverdueInvoices().catch((err) => logger.error({ err }, "Overdue invoice monitor: initial scan failed"));
  setInterval(() => {
    scanForOverdueInvoices().catch((err) => logger.error({ err }, "Overdue invoice monitor: interval scan failed"));
  }, SCAN_INTERVAL_MS);
}
