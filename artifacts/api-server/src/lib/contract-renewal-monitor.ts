import { eq, and, isNull } from "drizzle-orm";
import { db, contractsTable, clientsTable } from "@workspace/db";
import { logger } from "./logger";
import { notifyManagement } from "./notifications";

// Automation pass - a Manager shouldn't have to remember to check the
// Contracts page for what's renewing soon; same setInterval-on-boot
// pattern as lib/cert-expiry-monitor.ts/lib/overdue-invoice-monitor.ts.
// Same 30-day window pages/admin/contracts.tsx's own RENEWAL_WARNING_DAYS
// already uses for the visible badge, duplicated here (matching this
// codebase's established convention for this exact kind of constant)
// as the threshold for "worth notifying about," not just displaying.
// Only active contracts - an already-expired/cancelled one has nothing
// to renew.
const RENEWAL_WARNING_DAYS = 30;
const SCAN_INTERVAL_MS = 60 * 60 * 1000; // hourly - a renewal date barely moves hour to hour

function daysUntil(renewalDate: string): number {
  return Math.ceil((new Date(renewalDate + "T00:00:00").getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// Exported for direct testing (contract-renewal-monitor.test.ts) -
// same reasoning as every other monitor in this app not having its own
// HTTP route to drive a test through.
export async function scanForRenewingContracts() {
  const candidates = await db
    .select()
    .from(contractsTable)
    .where(and(eq(contractsTable.status, "active"), isNull(contractsTable.renewalNotifiedAt)));

  const dueForNotification = candidates.filter((c) => daysUntil(c.renewalDate) <= RENEWAL_WARNING_DAYS);
  if (dueForNotification.length === 0) return;

  for (const contract of dueForNotification) {
    try {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, contract.clientId));
      const clientName = client?.name ?? "A client";

      await db.update(contractsTable).set({ renewalNotifiedAt: new Date() }).where(eq(contractsTable.id, contract.id));

      const days = daysUntil(contract.renewalDate);
      await notifyManagement(
        contract.companyId,
        "VenueGuard: Contract renewal approaching",
        days < 0
          ? `"${contract.title}" (${clientName}) was due for renewal ${Math.abs(days)} day(s) ago. Check Contracts.`
          : `"${contract.title}" (${clientName}) renews in ${days} day(s). Check Contracts.`,
      );
      logger.info({ contractId: contract.id }, "Contract renewal monitor: notification sent");
    } catch (err) {
      logger.error({ err, contractId: contract.id }, "Contract renewal monitor: scan failed for contract");
    }
  }
}

export function startContractRenewalMonitor() {
  scanForRenewingContracts().catch((err) => logger.error({ err }, "Contract renewal monitor: initial scan failed"));
  setInterval(() => {
    scanForRenewingContracts().catch((err) => logger.error({ err }, "Contract renewal monitor: interval scan failed"));
  }, SCAN_INTERVAL_MS);
}
