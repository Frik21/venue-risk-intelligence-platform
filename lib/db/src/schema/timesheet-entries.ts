import { pgTable, serial, integer, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// One row per (operator, calendar day) - Profile > Timesheet. date is
// a plain "YYYY-MM-DD" string (not drizzle's date type, to match this
// schema's existing preference for plain text over specialised column
// types, and to sidestep timezone-conversion questions a single
// calendar day shouldn't have to deal with) - lexicographically
// sortable/comparable as-is. Clicking an already-logged day in the
// calendar edits this same row rather than creating a second one for
// that date, enforced by the unique constraint below.
export const timesheetEntriesTable = pgTable(
  "timesheet_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    hoursWorked: real("hours_worked").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    userDateUnique: unique().on(table.userId, table.date),
  }),
);

export const insertTimesheetEntrySchema = createInsertSchema(timesheetEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimesheetEntry = z.infer<typeof insertTimesheetEntrySchema>;
export type TimesheetEntry = typeof timesheetEntriesTable.$inferSelect;
