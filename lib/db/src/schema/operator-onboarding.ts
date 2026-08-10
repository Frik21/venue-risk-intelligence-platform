import { pgTable, serial, integer, jsonb, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Operator Onboarding - one record per candidate/CPO, created the
// moment a Manager adds an operator (POST /onboarding) - *before* any
// real user account exists. candidateName/candidateEmail hold their
// details until an account gets created. The checklist itself is a
// fixed, ordered list of items (see
// artifacts/api-server/src/lib/onboarding-checklist.ts) - stored here
// as a { [itemKey]: boolean } map rather than one row per item, same
// reasoning as plans.ts: the list is defined in code, not
// user-managed, so it can change without a data migration.
// status is a Manager-set vetting decision, deliberately not derived
// from checklist completion (a fully-checked checklist doesn't
// automatically mean "Approved" - the Manager still confirms it) and
// deliberately NOT what creates the account either - see
// operationalAccessGrantedAt below, which is the real gate.
export const operatorOnboardingTable = pgTable("operator_onboarding", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").unique().references(() => usersTable.id, { onDelete: "set null" }),
  candidateName: text("candidate_name").notNull().default(""),
  candidateEmail: text("candidate_email").notNull().default(""),
  checklist: jsonb("checklist").notNull().default({}),
  status: text("status").notNull().default("in_progress"),
  // The actual gate on being usable as a CPO (Operator View, task
  // assignment, etc.) - userId only gets set and the account only
  // gets created/activated once this is granted (requires Approved
  // status first), and gets deactivated when it's revoked. Denial
  // always forces this back to null - see PATCH
  // /onboarding/:id/operational-access and PATCH
  // /onboarding/:id/status in routes/onboarding.ts.
  operationalAccessGrantedAt: timestamp("operational_access_granted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOperatorOnboardingSchema = createInsertSchema(operatorOnboardingTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOperatorOnboarding = z.infer<typeof insertOperatorOnboardingSchema>;
export type OperatorOnboarding = typeof operatorOnboardingTable.$inferSelect;

// A candidate's onboarding documents (ID, PSIRA registration, firearm
// competency, etc.) - several per candidate, each with its own
// optional expiry date. Attached to the onboarding record rather than
// the user, since documents can be uploaded before a real user
// account exists (see operatorOnboardingTable above). fileDataUrl is
// a base64 data: URL (this app has no cloud file storage - see
// lib/db/src/schema/expenses.ts for the same reasoning/pattern with
// receipts), stored/returned directly on the row.
export const operatorDocumentsTable = pgTable("operator_documents", {
  id: serial("id").primaryKey(),
  operatorOnboardingId: integer("operator_onboarding_id").notNull().references(() => operatorOnboardingTable.id, { onDelete: "cascade" }),
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
