import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A paying subscriber of VenueGuard itself - the platform-owner
// concept (see the "owner" role on users.ts). Status is stored and
// displayed on the Owner page, but not yet enforced anywhere (no
// seat-limit blocking, no billing integration) - that's future work
// once real subscription/billing mechanics are built.
//
// No more Enterprise/Micro Enterprise tiers - per direct product
// direction, every company gets the same single plan: a fixed base
// seat count per Management-side role (BASE_SEATS_BY_ROLE, shared with
// the frontend - see lib/api.ts), with each role's additionalXSeats
// column tracking extra seats purchased beyond that base for that
// role specifically (billed additionally once real billing exists -
// tracked here regardless, since the number itself is real even
// before charging for it is). Deliberately per-role, not one shared
// pool - a company needing more Finance seats shouldn't eat into its
// Operations allowance. CPO seats are explicitly out of scope for
// this model for now - untouched, revisit separately.
export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("trial"),
  additionalManagerSeats: integer("additional_manager_seats").notNull().default(0),
  additionalOperationsSeats: integer("additional_operations_seats").notNull().default(0),
  additionalFinanceSeats: integer("additional_finance_seats").notNull().default(0),
  additionalHumanResourcesSeats: integer("additional_human_resources_seats").notNull().default(0),
  // The Owner's own sandbox for testing/QA-ing the Management and CPO
  // pages (see lib/auth.ts's preview session mechanism) - never a real
  // subscriber. Only a company flagged true here can ever be entered
  // via POST /auth/preview/:companyId; enforced server-side there, not
  // just a UI convention, so the Owner's aggregate-only boundary on
  // every other company can never be bypassed by URL/API manipulation.
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
