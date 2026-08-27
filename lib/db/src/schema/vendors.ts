import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { officesTable } from "./offices";
import { companiesTable } from "./companies";

// A security vendor (subcontractor/supplier used across tasks -
// equipment, transport, subcontracted CPOs, technology, training,
// etc.) - a CRM-style record for onboarding and tracking them, per
// direct product direction. Deliberately kept separate from Clients
// (schema/clients.ts): a vendor is a supplier VenueGuard pays or
// contracts with, not an organization requesting CPO services, so
// there's no day/night rate or task/quote rollup here - those are
// client-billing concepts that don't apply to a vendor relationship.
export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"), // lead | active | inactive | preferred
  category: text("category").notNull().default(""), // e.g. "Equipment Supplier", "Subcontracted CPOs", "Transport"
  primaryContactName: text("primary_contact_name").notNull().default(""),
  primaryContactRole: text("primary_contact_role").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  // Which office owns this vendor relationship - see officeId comment
  // in schema/users.ts for the broader multi-office direction.
  officeId: integer("office_id").references(() => officesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("idx_vendors_company_id").on(table.companyId)]);

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
