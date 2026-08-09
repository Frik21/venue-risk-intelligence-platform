import { pgTable, serial, integer, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tasksTable } from "./tasks";

// One row per (operator, calendar day, task) - Profile > Timesheet.
// date is a plain "YYYY-MM-DD" string (not drizzle's date type, to
// match this schema's existing preference for plain text over
// specialised column types, and to sidestep timezone-conversion
// questions a single calendar day shouldn't have to deal with) -
// lexicographically sortable/comparable as-is.
//
// taskId + the dayHours/nightHours split were added so Personnel
// Costs can be computed per task (rate x hours), not just per CPO
// overall - per direct product direction. hoursWorked is kept as the
// dayHours+nightHours total for backward compatibility with the PDF
// report and anything else that only cares about the total. taskId is
// nullable for pre-existing rows logged before this existed; new
// entries always set it (the CPO picks which task the hours were
// for).
export const timesheetEntriesTable = pgTable(
  "timesheet_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    taskId: integer("task_id").references(() => tasksTable.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    hoursWorked: real("hours_worked").notNull(),
    dayHours: real("day_hours").notNull().default(0),
    nightHours: real("night_hours").notNull().default(0),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userDateTaskUnique: unique().on(table.userId, table.date, table.taskId),
  }),
);

export const insertTimesheetEntrySchema = createInsertSchema(timesheetEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimesheetEntry = z.infer<typeof insertTimesheetEntrySchema>;
export type TimesheetEntry = typeof timesheetEntriesTable.$inferSelect;
