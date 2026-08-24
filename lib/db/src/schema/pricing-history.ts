import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Every time the Owner changes a subscription price (pricingConfigTable,
// see pricing-config.ts), one row here - an audit trail of how many
// times a price has changed and by how much, per direct product
// direction. percentageChange is always stored, whether the change was
// entered as a direct new dollar value or as a percentage increase -
// computed server-side from previousValue/newValue in the former case,
// taken as given in the latter (see routes/companies.ts's
// POST /companies/pricing/change), never trusted from the client as a
// pre-computed pair that could disagree with the actual values saved.
export const pricingHistoryTable = pgTable("pricing_history", {
  id: serial("id").primaryKey(),
  // "baseMonthlyPrice" | "pricePerAdditionalSeat" | "soloOperatorMonthlyPrice"
  // - matches a pricingConfigTable column name, not enforced at the DB
  // level (kept a plain text column, validated by the route's zod enum
  // instead - matching this codebase's preference for small explicit
  // validation over DB-level enum types).
  field: text("field").notNull(),
  previousValue: integer("previous_value").notNull(),
  newValue: integer("new_value").notNull(),
  percentageChange: real("percentage_change").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPricingHistorySchema = createInsertSchema(pricingHistoryTable).omit({ id: true, changedAt: true });
export type InsertPricingHistory = z.infer<typeof insertPricingHistorySchema>;
export type PricingHistory = typeof pricingHistoryTable.$inferSelect;
