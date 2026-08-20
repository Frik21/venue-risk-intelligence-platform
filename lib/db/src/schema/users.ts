import { pgTable, text, serial, timestamp, boolean, real, integer, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { officesTable } from "./offices";
import { companiesTable } from "./companies";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("cpo"),
  avatarInitials: text("avatar_initials"),
  active: boolean("active").notNull().default(true),
  // Nullable - null means this user isn't tied to any one company.
  // That's only true for role: "admin" (VenueGuard's own Owner
  // accounts, see routes/companies.ts) - every company-side user
  // (manager/finance/human_resources/operations/cpo) always has one.
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "restrict" }),
  // Home office (per direct product direction: "companies will have
  // different offices... select an office and all the data from the
  // allocated office") - a Manager or CPO's own base, distinct from
  // which office a given Task/Quote/etc. they touch belongs to.
  officeId: integer("office_id").references((): AnyPgColumn => officesTable.id, { onDelete: "set null" }),
  // Manager-set, only meaningful for CPOs - drives Personnel Costs.
  // Not self-service (see PATCH /users/:id/rates vs the plain
  // self-service PATCH /users/:id for Account Details).
  dayRate: real("day_rate"),
  nightRate: real("night_rate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
