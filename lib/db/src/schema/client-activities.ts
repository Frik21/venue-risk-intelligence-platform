import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { usersTable } from "./users";

// A dated activity/communication log entry against a Client - calls,
// meetings, emails, anything worth a note - replacing the single
// freeform Notes field a Client used to have, per direct product
// direction ("CRM style"). Append-only: no editing, just a running
// history shown newest-first on the client's detail page.
export const clientActivitiesTable = pgTable("client_activities", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClientActivitySchema = createInsertSchema(clientActivitiesTable).omit({ id: true, createdAt: true });
export type InsertClientActivity = z.infer<typeof insertClientActivitySchema>;
export type ClientActivity = typeof clientActivitiesTable.$inferSelect;
