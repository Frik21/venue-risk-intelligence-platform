import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

// A logged-in session, keyed by an opaque random token (not a serial
// id - this value is what becomes the signed session cookie, so it
// must be unguessable/unenumerable; see lib/auth.ts's createSession).
// Deliberately no companyId column here - a session's tenancy is
// resolved live via a join to users.companyId at verification time,
// not cached, so changing a user's company (or deactivating them)
// takes effect on their very next request instead of waiting for
// their session to expire.
export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Sliding-expiry bookkeeping - requireAuth refreshes this (and
  // expiresAt) when a session hasn't been seen in a while, rather than
  // on every single request.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  // Set only for an Owner (role: "admin") session that has entered
  // Preview mode (see lib/auth.ts's enterPreview/exitPreview) to browse
  // the Management/CPO pages for testing - always the internal test
  // company (companies.isInternal), never a real subscriber. requireAuth
  // resolves req.user.companyId from this when set, so every existing
  // tenant-scoped route works unchanged for a previewing Owner with no
  // per-route code. Not applicable to (and always null for) any regular
  // company-scoped user's session.
  previewCompanyId: integer("preview_company_id").references(() => companiesTable.id, { onDelete: "set null" }),
});

export type Session = typeof sessionsTable.$inferSelect;
