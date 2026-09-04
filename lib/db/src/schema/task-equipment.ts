import { pgTable, text, serial, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";

// Equipment/asset tracking, issued/returned per task - Following
// Roadmap Tier 2, item 14. Scoped ad-hoc per task (confirmed via
// AskUserQuestion) rather than a company-wide asset registry - each
// task gets its own equipment list (item name + optional serial
// number), not a shared catalog of physical items tracked across
// tasks over their lifetime. Either a Manager or the CPO on the task
// can add an item (also confirmed) - `addedBy` records whichever one
// actually did. Append-only list per task, same shape as
// after_action_reports/field_incident_reports (onDelete: cascade,
// matching expensesTable.taskId - a required, task-owned child
// record). `issuedTo`/`issuedAt` and `returnedAt` are nullable,
// set-on-action fields (same pattern as reviewedBy/reviewedAt on AAR,
// acknowledgedBy/acknowledgedAt on checkins) rather than a status
// enum, so "who issued/returned it and when" is always on the record.
// `needsMaintenance` is a simple per-item flag set at return time
// (e.g. "the radio's battery died mid-task") - deliberately not a
// separate maintenance-history entity, since there's no persistent
// asset across tasks for a maintenance history to attach to under the
// ad-hoc model chosen here.
export const taskEquipmentTable = pgTable("task_equipment", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  addedBy: integer("added_by").notNull().references(() => usersTable.id),
  itemName: text("item_name").notNull(),
  serialNumber: text("serial_number"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  issuedTo: integer("issued_to").references(() => usersTable.id),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  needsMaintenance: boolean("needs_maintenance").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_task_equipment_company_id").on(table.companyId),
  index("idx_task_equipment_task_id").on(table.taskId),
]);

export const insertTaskEquipmentSchema = createInsertSchema(taskEquipmentTable).omit({ id: true, createdAt: true });
export type InsertTaskEquipment = z.infer<typeof insertTaskEquipmentSchema>;
export type TaskEquipment = typeof taskEquipmentTable.$inferSelect;
