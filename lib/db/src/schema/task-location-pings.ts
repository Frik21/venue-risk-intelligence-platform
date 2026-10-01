import { pgTable, serial, integer, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";

// GPS breadcrumb trail - Following Roadmap Tier 3, item 33 ("pairs
// with item 1" - checkins.ts's check-in/panic signal). Deliberately a
// separate table, not another checkins.type value - a breadcrumb ping
// is high-frequency, passive, never-acknowledged telemetry (a trail
// point every few minutes while a task runs), structurally different
// from checkins' own event-with-acknowledgment shape (ok/panic/missed,
// each a thing a Manager explicitly reviews and clears). taskId is
// required/non-nullable with onDelete: cascade (unlike checkins'
// nullable taskId after the global panic button shipped) - a
// breadcrumb trail is inherently about one specific job's route, there
// is no "general" breadcrumb the way there's a general panic button.
export const taskLocationPingsTable = pgTable("task_location_pings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  cpoId: integer("cpo_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_task_location_pings_company_id").on(table.companyId),
  index("idx_task_location_pings_task_id").on(table.taskId),
]);

export const insertTaskLocationPingSchema = createInsertSchema(taskLocationPingsTable).omit({ id: true, capturedAt: true });
export type InsertTaskLocationPing = z.infer<typeof insertTaskLocationPingSchema>;
export type TaskLocationPing = typeof taskLocationPingsTable.$inferSelect;
