import { inArray, and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isEmailConfigured, sendEmail } from "./email";
import { isSmsConfigured, sendSms } from "./sms";
import { MANAGEMENT_ROLES } from "../routes/companies";

// Real notifications - Following Roadmap Tier 3, item 29 ("SMS/push/
// email for panic alerts, overdue invoices, expiring certs - things
// that can't wait for someone to open the app"). Deliberately scoped
// to email + SMS only, not push - a real web-push implementation
// (service worker registration, VAPID keys, per-user subscription
// storage) is a much bigger, separate build than wiring two more
// connect-later channels onto the email infra this app already has
// (lib/email.ts, built for forgot-password) - flagged as a narrower
// scope than the roadmap item's own wording, not silently dropped.
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
  if (!isEmailConfigured() && !isSmsConfigured()) return; // nothing connected - a silent no-op, same as every other connect-later integration

  const recipients = await db
    .select({ email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(and(eq(usersTable.companyId, companyId), eq(usersTable.active, true), inArray(usersTable.role, MANAGEMENT_ROLES)));

  await Promise.all(
    recipients.flatMap((r) => {
      const sends: Promise<void>[] = [];
      if (isEmailConfigured() && r.email) {
        sends.push(sendEmail(r.email, subject, message).catch((e) => console.error("notifyManagement: email failed", r.email, e)));
      }
      if (isSmsConfigured() && r.phone) {
        sends.push(sendSms(r.phone, `${subject}: ${message}`).catch((e) => console.error("notifyManagement: SMS failed", r.phone, e)));
      }
      return sends;
    }),
  );
}
