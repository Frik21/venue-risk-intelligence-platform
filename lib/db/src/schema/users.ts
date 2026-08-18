import { pgTable, text, serial, timestamp, boolean, real, integer, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { officesTable } from "./offices";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("cpo"),
  avatarInitials: text("avatar_initials"),
  active: boolean("active").notNull().default(true),
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
