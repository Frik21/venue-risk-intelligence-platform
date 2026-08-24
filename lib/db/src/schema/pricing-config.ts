import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Platform-wide, not company-scoped - always exactly one row (a
// singleton, same pattern as company_settings used to be before
// multi-tenancy). The Owner's own editable subscription pricing,
// replacing the price constants that used to be hardcoded in
// routes/companies.ts - still directional/not connected to any real
// billing integration (see companies.ts's estimatedMonthlyCharge,
// which now reads this table instead of constants), but at least a
// real, changeable number instead of one buried in code.
export const pricingConfigTable = pgTable("pricing_config", {
  id: serial("id").primaryKey(),
  baseMonthlyPrice: integer("base_monthly_price").notNull().default(1500),
  pricePerAdditionalSeat: integer("price_per_additional_seat").notNull().default(40),
  soloOperatorMonthlyPrice: integer("solo_operator_monthly_price").notNull().default(250),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPricingConfigSchema = createInsertSchema(pricingConfigTable).omit({ id: true, updatedAt: true });
export type InsertPricingConfig = z.infer<typeof insertPricingConfigSchema>;
export type PricingConfig = typeof pricingConfigTable.$inferSelect;
