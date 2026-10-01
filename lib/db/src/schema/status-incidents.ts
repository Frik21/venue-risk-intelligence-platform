import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

// Public status page - Platform Maturity Roadmap, Tier 5, item 11.
// Platform-wide, not company-scoped (there's only one VenueGuard
// platform to report on) - a flat, append-only post log rather than
// one incident row with a nested timeline of updates, matching this
// codebase's existing preference for simple append-only logs
// (client_activities, vendor_activities) over a more structured model.
// The most recent post's own `status` is what the public page's
// "known issues" banner reflects; older posts stay visible as history.
export const statusIncidentsTable = pgTable("status_incidents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("investigating"), // investigating | identified | monitoring | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StatusIncident = typeof statusIncidentsTable.$inferSelect;
