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
//
// Per direct product direction, every seat role gets its own
// individually-settable price - no more one shared price applied to
// every Management role. Defaults all match the old flat $40 so
// switching to this model didn't silently change anyone's estimate.
export const pricingConfigTable = pgTable("pricing_config", {
  id: serial("id").primaryKey(),
  baseMonthlyPrice: integer("base_monthly_price").notNull().default(1500),
  pricePerManagerSeat: integer("price_per_manager_seat").notNull().default(40),
  pricePerOperationsSeat: integer("price_per_operations_seat").notNull().default(40),
  pricePerFinanceSeat: integer("price_per_finance_seat").notNull().default(40),
  pricePerHumanResourcesSeat: integer("price_per_human_resources_seat").notNull().default(40),
  pricePerCpoSeat: integer("price_per_cpo_seat").notNull().default(40),
  soloOperatorMonthlyPrice: integer("solo_operator_monthly_price").notNull().default(250),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPricingConfigSchema = createInsertSchema(pricingConfigTable).omit({ id: true, updatedAt: true });
export type InsertPricingConfig = z.infer<typeof insertPricingConfigSchema>;
export type PricingConfig = typeof pricingConfigTable.$inferSelect;
