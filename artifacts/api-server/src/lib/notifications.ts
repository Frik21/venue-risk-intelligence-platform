import { inArray, and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isEmailConfigured, sendEmail } from "./email";
import { isSmsConfigured, sendSms } from "./sms";
import { isPushConfigured, sendPushNotification } from "./push";
import { MANAGEMENT_ROLES } from "../routes/companies";

// Real notifications - Following Roadmap Tier 3, item 29 ("SMS/push/
// email for panic alerts, overdue invoices, expiring certs - things
// that can't wait for someone to open the app"). Push itself was
// originally deferred here as a bigger, separate build - now built,
// see lib/push.ts (Platform Maturity Roadmap, Tier 1, item 1).
//
// Fans a notification out to every active Management-side user on a
// company (all four roles, not role-filtered further - the three
// trigger points below are all "something needs attention," which any
// of Manager/Finance/HR/Operations might be the one to act on, same
// looseness this app's permissions already have everywhere else).
// Best-effort per recipient/channel - a failed send is logged, never
// thrown, so one bad phone number or a transient SMTP hiccup can't
// block the other recipients or the action that triggered this.
export async function notifyManagement(companyId: number, subject: string, message: string): Promise<void> {
  if (!isEmailConfigured() && !isSmsConfigured() && !isPushConfigured()) return; // nothing connected - a silent no-op, same as every other connect-later integration

  const recipients = await db
    .select({ id: usersTable.id, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(and(eq(usersTable.companyId, companyId), eq(usersTable.active, true), inArray(usersTable.role, MANAGEMENT_ROLES)));

  const sends: Promise<void>[] = recipients.flatMap((r) => {
    const perRecipient: Promise<void>[] = [];
    if (isEmailConfigured() && r.email) {
      perRecipient.push(sendEmail(r.email, subject, message).catch((e) => console.error("notifyManagement: email failed", r.email, e)));
    }
    if (isSmsConfigured() && r.phone) {
      perRecipient.push(sendSms(r.phone, `${subject}: ${message}`).catch((e) => console.error("notifyManagement: SMS failed", r.phone, e)));
    }
    return perRecipient;
  });

  if (isPushConfigured() && recipients.length > 0) {
    sends.push(
      sendPushNotification(
        recipients.map((r) => r.id),
        subject,
        message,
      ).catch((e) => console.error("notifyManagement: push failed", e)),
    );
  }

  await Promise.all(sends);
}
