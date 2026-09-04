import { pgTable, serial, integer, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

// The full CPO roster for a task - a task can genuinely need several
// operators (per direct product direction: "client wants 3
// operators"), not just the single tasks.assignedTo primary. A CPO
// only shows up as "deployed"/sees the task in their Operational
// Canvas if they're a row here.
export const taskAssignmentsTable = pgTable(
  "task_assignments",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
    taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
    operatorId: integer("operator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    // Team-lead/hierarchy designation on a multi-operator roster -
    // Following Roadmap Tier 2, item 15 ("who's team lead, driver,
    // advance, close protection"). Freeform text, not an enum - the
    // fixed four roles are a Command Desk UI convenience (a dropdown
    // with those four options plus "Other"), not a schema-level
    // constraint, since a role this open-ended (a company might use
    // its own terminology) doesn't need DB-level validation the way a
    // status field does. Nullable - most rosters won't bother
    // assigning roles at all.
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("task_assignments_task_id_operator_id_unique").on(table.taskId, table.operatorId),
    index("idx_task_assignments_company_id").on(table.companyId),
  ],
);

export const insertTaskAssignmentSchema = createInsertSchema(taskAssignmentsTable).omit({ id: true, createdAt: true });
export type InsertTaskAssignment = z.infer<typeof insertTaskAssignmentSchema>;
export type TaskAssignment = typeof taskAssignmentsTable.$inferSelect;
