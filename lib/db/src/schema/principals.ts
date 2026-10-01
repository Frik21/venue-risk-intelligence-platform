import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { tasksTable } from "./tasks";

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

// Audit log for Principal Protection Profile access - Platform
// Maturity Roadmap, Tier 2, item 4 ("audit logging for the most
// sensitive data in the system... today any Management-side session
// can read with no record of who looked at what"). Scoped via
// AskUserQuestion to log every read (not just Management-side), so
// this is a complete trail, not a partial one - one row per principal
// per access, since the point is "who looked at THIS person's medical/
// threat info," not "who hit this endpoint." `accessedViaTaskId` is
// set only for a CPO's own automatic per-task read (`GET
// /tasks/:id/principals`) - null for a Management-side view/edit on
// the Client detail page, where there's no task context at all.
//
// `principalId` is nullable with `onDelete: set null` rather than
// cascade - deleting a principal would otherwise wipe out its own
// access history (including the "deleted" row itself), defeating the
// entire point of an audit trail that's supposed to survive the data
// it describes. `principalName` snapshots the name at access time so
// the log stays legible even after the principal record is gone.
export const principalAccessLogTable = pgTable("principal_access_log", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  principalId: integer("principal_id").references(() => principalsTable.id, { onDelete: "set null" }),
  principalName: text("principal_name").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  action: text("action").notNull(), // "viewed" | "created" | "updated" | "deleted"
  accessedViaTaskId: integer("accessed_via_task_id").references(() => tasksTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_principal_access_log_company_id").on(table.companyId),
  index("idx_principal_access_log_principal_id").on(table.principalId),
]);

export type PrincipalAccessLogEntry = typeof principalAccessLogTable.$inferSelect;
