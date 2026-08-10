import { pgTable, text, serial, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A client (the organization/person requesting CPO services) - kept
// separate from the freeform clientName/clientContact still on each
// task (see clientId in schema/tasks.ts), since a task can still be
// created for a one-off client with no record here at all. Day/night
// rate live here because quotes and daily rates differ from client to
// client, per direct product direction - not looked up automatically
// by the quote engine yet (that's manual line items for now, see
// quotationLineItems in schema/tasks.ts), just recorded here ready
// for when that's automated.
export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  dayRate: real("day_rate"),
  nightRate: real("night_rate"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
