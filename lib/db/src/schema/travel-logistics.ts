import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// Travel/visa logistics reference data - Following Roadmap Tier 3,
// item 16. Scoped via AskUserQuestion: there's no reliable free public
// API for "visa requirements by nationality + destination" (unlike
// the real US State Dept advisories Country Intelligence already
// pulls live) and a wrong answer here can genuinely get a CPO denied
// entry - so this is deliberately Manager-maintained reference data,
// not a live-fetched source, same CRM-authoring shape as
// vendors.ts/clients.ts. Also per that scoping pass: no CPO
// nationality field exists or was added (confirmed out of scope) - a
// row's own `title`/`details` names who it's for in free text (e.g.
// "South African Nationals", "US Embassy Pretoria"), a Manager reads
// the relevant row by eye rather than the system auto-matching a
// CPO's nationality to one.
//
// One flexible table for all three roadmap-named categories (visa
// requirements, embassy contacts, local fixer contacts) rather than
// three near-identical ones - matches this codebase's existing
// preference for a few flexible fields over many structured ones for
// guidance-type content (see venue_risk_assessments' own free-text
// areaAdvisories). `entryType` distinguishes which of the three a row
// is; `title`/`details` are free text for all three (a visa
// requirement's applicability + rule, an embassy's name + contact
// info, a fixer's name + contact info + notes).
export const travelLogisticsEntriesTable = pgTable("travel_logistics_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  // Freeform, matching venues.country's own freeform convention (no
  // shared canonical country list exists for either) - matched to a
  // task's venue country via normalized string comparison server-side
  // when Operators Note looks entries up per task, same "normalize
  // then look up" strategy lib/travel-advisory.ts already established
  // for the identical freeform-country-name problem.
  destinationCountry: text("destination_country").notNull(),
  entryType: text("entry_type").notNull(), // "visa_requirement" | "embassy_contact" | "fixer_contact"
  title: text("title").notNull(),
  details: text("details").notNull(),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_travel_logistics_entries_company_id").on(table.companyId),
  index("idx_travel_logistics_entries_destination_country").on(table.destinationCountry),
]);

export const insertTravelLogisticsEntrySchema = createInsertSchema(travelLogisticsEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTravelLogisticsEntry = z.infer<typeof insertTravelLogisticsEntrySchema>;
export type TravelLogisticsEntry = typeof travelLogisticsEntriesTable.$inferSelect;
