import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { tasksTable } from "./tasks";
import { vendorsTable } from "./vendors";
import { usersTable } from "./users";

// A vendor performance review - Following Roadmap Tier 3, item 20
// ("Vendor/subcontractor performance tracking over time... adds a
// track record, not just a contact card"). Always tied to a real
// task_vendors assignment (taskId required, non-nullable) rather than
// a freestanding rating against the vendor in the abstract - a review
// is reviewing a specific, real engagement. Append-only, like
// after_action_reports/field_incident_reports - a Manager can log more
// than one review against the same task+vendor pairing (e.g. an
// interim note, then a final one) rather than being forced into a
// single upsert-per-engagement record.
//
// Deliberately separate from vendor_activities (the vendor's existing
// freeform dated log) - that stays for calls/emails/meetings, this is
// specifically the structured rating data a track-record average can
// be computed from. Both remain visible on the vendor's detail page.
export const vendorPerformanceReviewsTable = pgTable("vendor_performance_reviews", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5
  notes: text("notes").notNull().default(""),
  reviewedBy: integer("reviewed_by").notNull().references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_vendor_performance_reviews_company_id").on(table.companyId),
  index("idx_vendor_performance_reviews_vendor_id").on(table.vendorId),
  index("idx_vendor_performance_reviews_task_id").on(table.taskId),
]);

export type VendorPerformanceReview = typeof vendorPerformanceReviewsTable.$inferSelect;
