import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";
import { usersTable } from "./users";

// Task Assignment - a Manager assigns a CPO a specific piece of
// structured work already in the platform ("complete the assessment
// for venue X", "recce venue Y"), tied to a venue, usually the day
// before the work happens. The CPO moves it through a simple 3-state
// status the Manager can see - deliberately not a general-purpose
// worklist or a two-way chat (per direct product direction: "specifically
// about driving CPOs to complete the existing structured work").
//
// assignedTo is nullable so a Manager can create a task before
// deciding who covers it ("unassigned", per the Task Assignment Board)
// - it gets assigned later via PATCH. archived covers "cancel/archive
// task" as a single soft-hide flag rather than a 4th status value, so
// every existing status-based UI (PDF, dashboard counts, CPO task
// history) doesn't need to learn a new state - archived tasks are
// just excluded from the lists that matter.
export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venuesTable.id, { onDelete: "cascade" }),
  assignedTo: integer("assigned_to").references(() => usersTable.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").notNull().default("not_completed"),
  priority: text("priority").notNull().default("medium"),
  archived: boolean("archived").notNull().default(false),
  completionNote: text("completion_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
