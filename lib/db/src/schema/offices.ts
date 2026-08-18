import { pgTable, text, serial, integer, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A company office/base location, added manually by a Manager to
// track operational footprint - deliberately separate from Venues
// (client sites the CPO assesses/works at). No geocoding/map
// integration - just the reference details a Manager types in.
export const officesTable = pgTable("offices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  city: text("city").notNull(),
  country: text("country").notNull(),
  // Explicit AnyPgColumn return type breaks the users<->offices
  // circular-inference issue TS can't otherwise resolve (users.ts's
  // officeId references officesTable right back).
  managerId: integer("manager_id").references((): AnyPgColumn => usersTable.id, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOfficeSchema = createInsertSchema(officesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOffice = z.infer<typeof insertOfficeSchema>;
export type Office = typeof officesTable.$inferSelect;
