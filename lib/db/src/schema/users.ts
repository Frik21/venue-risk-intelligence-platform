import { pgTable, text, serial, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("cpo"),
  avatarInitials: text("avatar_initials"),
  active: boolean("active").notNull().default(true),
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
