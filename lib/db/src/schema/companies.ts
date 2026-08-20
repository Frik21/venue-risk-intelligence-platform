import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
