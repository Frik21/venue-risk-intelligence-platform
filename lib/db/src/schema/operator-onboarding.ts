import { pgTable, serial, integer, jsonb, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Operator Onboarding - one record per candidate/CPO, created the
// moment a Manager adds an operator (POST /onboarding) - *before* any
// real user account exists. candidateName/candidateEmail hold their
// details until they're Approved; userId is only set once approved,
// which is also the moment their real account gets created (see
// PATCH /onboarding/:id/status in routes/onboarding.ts). This is
// deliberate: an operator can't be assigned tasks, log in as a CPO,
// etc. while Pending or Denied, because until Approved there's no
// user account for any of that to point at. The checklist itself is a
// fixed, ordered list of items (see
// artifacts/api-server/src/lib/onboarding-checklist.ts) - stored here
// as a { [itemKey]: boolean } map rather than one row per item, same
// reasoning as plans.ts: the list is defined in code, not
// user-managed, so it can change without a data migration.
// status is a Manager-set decision, deliberately not derived from
// checklist completion - a fully-checked checklist doesn't
// automatically mean "Approved" (the Manager still confirms it), and
// "Denied" is a terminal decision the checklist alone can't express.
export const operatorOnboardingTable = pgTable("operator_onboarding", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").unique().references(() => usersTable.id, { onDelete: "set null" }),
  candidateName: text("candidate_name").notNull().default(""),
  candidateEmail: text("candidate_email").notNull().default(""),
  checklist: jsonb("checklist").notNull().default({}),
  status: text("status").notNull().default("in_progress"),
  // Independent of status/account creation above - a Manager-set
  // record of when operational access (credentials handed over,
  // briefed, etc.) was actually given, toggled via the "Assign
  // Operational Access" button. Doesn't touch the user account itself.
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
