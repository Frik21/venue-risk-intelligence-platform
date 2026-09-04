import { pgTable, text, serial, timestamp, boolean, real, integer, type AnyPgColumn, index } from "drizzle-orm/pg-core";
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
  // Nullable - existing seeded users and CPOs mid-onboarding may not
  // have a password set yet. Login is refused (not "no password
  // required") when this is null - see requireAuth in lib/auth.ts.
  passwordHash: text("password_hash"),
  // Set whenever an admin generates a user's initial password on
  // their behalf (POST /users, onboarding operational-access grant);
  // cleared on the user's own successful POST /auth/change-password.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("idx_users_company_id").on(table.companyId)]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
