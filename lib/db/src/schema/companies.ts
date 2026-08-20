import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A paying subscriber of VenueGuard itself - the platform-owner
// concept (see the "owner" role on users.ts). Tier/status are stored
// and displayed on the Owner page, but not yet enforced anywhere
// (no seat-limit blocking, no billing integration) - that's future
// work once real subscription/billing mechanics are built.
export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tier: text("tier").notNull().default("enterprise"),
  status: text("status").notNull().default("trial"),
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
