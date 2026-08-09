import { pgTable, serial, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Singleton (always exactly one row, id=1) - the overtime rule used
// to compute Personnel Costs. Deliberately not hardcoded (1.5x/8-hour
// day etc) since these numbers are company-specific, per direct
// product direction ("each company have different rates") - a Manager
// edits this from the Costs page instead of it being a constant in code.
export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  overtimeThresholdHours: real("overtime_threshold_hours").notNull().default(8),
  overtimeThresholdPeriod: text("overtime_threshold_period").notNull().default("daily"),
  overtimeMultiplier: real("overtime_multiplier").notNull().default(1.5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettingsTable).omit({ id: true, updatedAt: true });
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettingsTable.$inferSelect;
