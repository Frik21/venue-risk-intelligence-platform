import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { companiesTable } from "./companies";

// A named, individually-protected person under a Client - Following
// Roadmap, Tier 2 item 8 ("real client/principal protection profile...
// today's requirements field is billing-shaped, not protection-
// shaped"). Scoped via AskUserQuestion as a real roster (not one
// profile per Client) - a corporate client protecting an executive
// plus their family is the normal case this needs to model, and a
// single free-text block per Client couldn't tell those people apart.
// Each field is its own free-text section (medical/threats/routine/
// family), same shape as this app's other CRM free-text fields -
// deliberately not further structured (e.g. a real allergy list),
// since this is a briefing document a CPO reads, not a form a system
// reasons over.
export const principalsTable = pgTable("principals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Free text, not an enum - "Principal", "Executive", "Spouse",
  // "Child", whatever actually describes who this person is relative
  // to the client account, without this app pre-guessing every real
  // household/org shape.
  relationship: text("relationship").notNull().default(""),
  medicalInfo: text("medical_info"),
  knownThreats: text("known_threats"),
  routineNotes: text("routine_notes"),
  familyNotes: text("family_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_principals_company_id").on(table.companyId),
  index("idx_principals_client_id").on(table.clientId),
]);

export const insertPrincipalSchema = createInsertSchema(principalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPrincipal = z.infer<typeof insertPrincipalSchema>;
export type Principal = typeof principalsTable.$inferSelect;
