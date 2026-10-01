import { pgTable, serial, integer, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// CPO self-service availability/time-off requests - Following Roadmap
// Tier 3, item 34, the last item on that list. Not task-scoped (unlike
// most of this session's other CPO-authored entities) - a time-off
// request is about the operator's own general availability, nothing
// to do with any one job. startDate/endDate are plain date strings
// (YYYY-MM-DD), same convention as timesheet_entries.date - this is a
// calendar-day request, not a precise timestamp range. Only 3 stored
// statuses, same "no 4th computed-looking value stored" reasoning as
// contracts.ts's own status column - "pending" is reviewed by a
// Manager/HR into approved or denied, nothing else derives from it.
export const availabilityRequestsTable = pgTable("availability_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  cpoId: integer("cpo_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | denied
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_availability_requests_company_id").on(table.companyId),
  index("idx_availability_requests_cpo_id").on(table.cpoId),
]);

export const insertAvailabilityRequestSchema = createInsertSchema(availabilityRequestsTable).omit({ id: true, requestedAt: true });
export type InsertAvailabilityRequest = z.infer<typeof insertAvailabilityRequestSchema>;
export type AvailabilityRequest = typeof availabilityRequestsTable.$inferSelect;
