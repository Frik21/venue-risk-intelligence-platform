import { pgTable, text, serial, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
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
//
// assignedTo is the primary/first CPO on the task, kept for backward
// compatibility with everything already built around "one operator
// per task" (Expenses' default operator, the PDF report header,
// Timesheet, the CPO Operational Canvas's own task list). The full
// roster - which can be more than one CPO, per direct product
// direction ("client wants 3 operators") - lives in
// task-assignments.ts; assignedTo is always also a member of that
// roster when set.
//
// The client* / *Required / estimatedCost* fields turn task creation
// into a real intake form for phone-in requests ("need a CPO for
// these dates, X operators, X vehicles") rather than just a title +
// assignee - per direct product direction.
export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venuesTable.id, { onDelete: "cascade" }),
  assignedTo: integer("assigned_to").references(() => usersTable.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: text("status").notNull().default("not_completed"),
  priority: text("priority").notNull().default("medium"),
  archived: boolean("archived").notNull().default(false),
  completionNote: text("completion_note"),
  // Client confirmation - independent of status above (status tracks
  // the CPO's own work progress; this tracks whether the client has
  // actually confirmed the request). A Manager sets this by hand once
  // the client confirms (see PATCH /tasks/:id, clientConfirmed) - not
  // derived from anything else. Tasks list buckets on this: no
  // confirmation yet = Pending, confirmed but not done = Running,
  // status = completed = Completed regardless of this field.
  clientConfirmedAt: timestamp("client_confirmed_at", { withTimezone: true }),
  clientName: text("client_name").notNull().default(""),
  clientContact: text("client_contact").notNull().default(""),
  clientRequirements: text("client_requirements").notNull().default(""),
  operatorsRequired: integer("operators_required").notNull().default(1),
  vehiclesRequired: integer("vehicles_required").notNull().default(0),
  estimatedCost: real("estimated_cost"),
  estimatedCostCurrency: text("estimated_cost_currency").notNull().default("ZAR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
