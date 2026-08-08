import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";

// Operational Planning (Step 1 of the Planner: the pre-op readiness
// checklist) - one Plan per Task (per direct product direction), a
// full plan document going deeper than the task's own title. The
// checklist itself is a fixed, ordered list of items (see
// artifacts/api-server/src/lib/plan-checklist.ts) - stored here as a
// { [itemKey]: boolean } map rather than one row per item, since the
// list is defined in code, not user-managed; the API fills in any keys
// missing from a plan's stored checklist (e.g. an item added after this
// plan was created) as unchecked, so the master list can change without
// a data migration.
export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().unique().references(() => tasksTable.id, { onDelete: "cascade" }),
  checklist: jsonb("checklist").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlanSchema = createInsertSchema(plansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plansTable.$inferSelect;
