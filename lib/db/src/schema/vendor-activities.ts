import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

// A dated activity/communication log entry against a Vendor - calls,
// meetings, emails, anything worth a note - same CRM-style pattern as
// client_activities (see schema/client-activities.ts). Append-only:
// no editing, just a running history shown newest-first on the
// vendor's detail page.
export const vendorActivitiesTable = pgTable("vendor_activities", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVendorActivitySchema = createInsertSchema(vendorActivitiesTable).omit({ id: true, createdAt: true });
export type InsertVendorActivity = z.infer<typeof insertVendorActivitySchema>;
export type VendorActivity = typeof vendorActivitiesTable.$inferSelect;
