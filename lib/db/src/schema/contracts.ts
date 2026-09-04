import { pgTable, text, serial, real, timestamp, integer, index, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { clientsTable } from "./clients";

// Contract/retainer management - Following Roadmap Tier 3, item 17.
// Scoped via AskUserQuestion: a standalone entity (not embedded fields
// on Client) since a client's standing agreement has its own lifecycle
// (renewalDate, status) that a one-off Task/Quote doesn't - a client
// can have zero, one, or several contracts over time. No dated
// activity-log table (unlike client_activities/vendor_activities) -
// a contract's own mutable fields (status, renewalDate, amount) are
// simply overwritten on edit, same convention as e.g. companies.status;
// this roadmap item asked for standing-details + renewal tracking, not
// a full audit trail.
//
// currency lives here per-record, same convention as
// quotes.currency/invoices.currency (never inherited from Client,
// which has no currency field of its own) - a client with contracts in
// more than one currency is legitimate (e.g. a domestic retainer plus
// an international one), and every consumer of recurringAmount buckets
// by currency, never sums across it, matching this app's existing
// currency-naive convention documented on Job Profitability/Revenue
// Concentration.
//
// Only 3 stored statuses - "expiring soon" is deliberately NOT a 4th
// stored value, it's computed client-side from renewalDate (same
// EXPIRY_WARNING_DAYS-style convention compliance.tsx/onboarding.tsx
// already use for cert expiry) so it can never drift out of sync with
// the date itself.
export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"), // active | expired | cancelled
  recurringAmount: real("recurring_amount").notNull(),
  billingFrequency: text("billing_frequency").notNull().default("monthly"), // monthly | quarterly | annually
  currency: text("currency").notNull().default("ZAR"),
  startDate: date("start_date").notNull(),
  renewalDate: date("renewal_date").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_contracts_company_id").on(table.companyId),
  index("idx_contracts_client_id").on(table.clientId),
]);

export const insertContractSchema = createInsertSchema(contractsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;
