import { pgTable, serial, integer, jsonb, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Operator Onboarding - one record per CPO, exists implicitly the
// moment the CPO user does (lazily created on first fetch, same
// pattern as plans.ts's per-task Plan). The checklist itself is a
// fixed, ordered list of items (see
// artifacts/api-server/src/lib/onboarding-checklist.ts) - stored here
// as a { [itemKey]: boolean } map rather than one row per item, same
// reasoning as plans.ts: the list is defined in code, not
// user-managed, so it can change without a data migration.
// status is a Manager-set decision, deliberately not derived from
// checklist completion - a fully-checked checklist doesn't
// automatically mean "Onboarded" (the Manager still confirms it), and
// "Denied" is a terminal decision the checklist alone can't express.
export const operatorOnboardingTable = pgTable("operator_onboarding", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  checklist: jsonb("checklist").notNull().default({}),
  status: text("status").notNull().default("in_progress"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOperatorOnboardingSchema = createInsertSchema(operatorOnboardingTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOperatorOnboarding = z.infer<typeof insertOperatorOnboardingSchema>;
export type OperatorOnboarding = typeof operatorOnboardingTable.$inferSelect;

// A CPO's onboarding documents (ID, PSIRA registration, firearm
// competency, etc.) - several per CPO, each with its own optional
// expiry date. fileDataUrl is a base64 data: URL (this app has no
// cloud file storage - see lib/db/src/schema/expenses.ts for the same
// reasoning/pattern with receipts), stored/returned directly on the row.
export const operatorDocumentsTable = pgTable("operator_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull().default("other"),
  label: text("label").notNull().default(""),
  filename: text("filename"),
  fileDataUrl: text("file_data_url"),
  expiryDate: text("expiry_date"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOperatorDocumentSchema = createInsertSchema(operatorDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOperatorDocument = z.infer<typeof insertOperatorDocumentSchema>;
export type OperatorDocument = typeof operatorDocumentsTable.$inferSelect;
