import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { db, operatorDocumentsTable, operatorOnboardingTable, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { notifyManagement } from "./notifications";

// Real notifications - Following Roadmap Tier 3, item 29. Same
// setInterval-on-boot pattern as lib/checkin-monitor.ts/
// overdue-invoice-monitor.ts. Same EXPIRY_WARNING_DAYS value already
// used (duplicated, matching this codebase's own established
// convention for this specific constant - see the Compliance Rollup/
// onboarding.tsx/hr.tsx notes in CLAUDE.md) as the threshold for
// "worth notifying about," not just displaying on a card.
const EXPIRY_WARNING_DAYS = 30;
const SCAN_INTERVAL_MS = 60 * 60 * 1000; // hourly - unlike check-ins/invoices, a cert's expiry date barely moves hour to hour

function daysUntil(expiryDate: string): number {
  return Math.ceil((new Date(expiryDate + "T00:00:00").getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

async function scanForExpiringDocuments() {
  const candidates = await db
    .select()
    .from(operatorDocumentsTable)
    .where(and(isNotNull(operatorDocumentsTable.expiryDate), isNull(operatorDocumentsTable.expiryNotifiedAt)));

  const dueForNotification = candidates.filter((d) => daysUntil(d.expiryDate!) <= EXPIRY_WARNING_DAYS);
  if (dueForNotification.length === 0) return;

  for (const doc of dueForNotification) {
    try {
      const [onboarding] = await db
        .select({ candidateName: operatorOnboardingTable.candidateName, userId: operatorOnboardingTable.userId })
        .from(operatorOnboardingTable)
        .where(eq(operatorOnboardingTable.id, doc.operatorOnboardingId));
      const [user] = onboarding?.userId != null
        ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, onboarding.userId))
        : [undefined];
      const operatorName = user?.name ?? onboarding?.candidateName ?? "An operator";

      await db.update(operatorDocumentsTable).set({ expiryNotifiedAt: new Date() }).where(eq(operatorDocumentsTable.id, doc.id));

      const days = daysUntil(doc.expiryDate!);
      const label = doc.label || doc.documentType;
      await notifyManagement(
        doc.companyId,
        "VenueGuard: Certification expiring",
        days < 0
          ? `${operatorName}'s ${label} expired ${Math.abs(days)} day(s) ago. Check Operator Database.`
          : `${operatorName}'s ${label} expires in ${days} day(s). Check Operator Database.`,
      );
      logger.info({ documentId: doc.id }, "Cert expiry monitor: notification sent");
    } catch (err) {
      logger.error({ err, documentId: doc.id }, "Cert expiry monitor: scan failed for document");
    }
  }
}

export function startCertExpiryMonitor() {
  scanForExpiringDocuments().catch((err) => logger.error({ err }, "Cert expiry monitor: initial scan failed"));
  setInterval(() => {
    scanForExpiringDocuments().catch((err) => logger.error({ err }, "Cert expiry monitor: interval scan failed"));
  }, SCAN_INTERVAL_MS);
}
