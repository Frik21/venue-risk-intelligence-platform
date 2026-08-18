import { pgTable, text, serial, integer, timestamp, boolean, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";
import { usersTable } from "./users";
import { clientsTable } from "./clients";
import { officesTable } from "./offices";

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
  // Nullable - a task can be created before a location is picked (see
  // Pending Details in lib/task-bucket.ts on the frontend: a task with
  // no venueId, blank title, no dates, or no estimated cost stays
  // Pending Details until every one of those is filled in).
  venueId: integer("venue_id").references(() => venuesTable.id, { onDelete: "cascade" }),
  // Which office this task belongs to - see officeId comment in
  // schema/users.ts for the broader multi-office direction.
  officeId: integer("office_id").references(() => officesTable.id, { onDelete: "set null" }),
  assignedTo: integer("assigned_to").references(() => usersTable.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: text("status").notNull().default("not_completed"),
  priority: text("priority").notNull().default("medium"),
  archived: boolean("archived").notNull().default(false),
  completionNote: text("completion_note"),
  // Manager-set once a Completed task has actually been billed - a
  // separate flag rather than a 6th status value, same reasoning as
  // archived above. Only meaningful once status is "completed" (see
  // Invoiced in lib/task-bucket.ts on the frontend, which supersedes
  // the Completed bucket once this is set); toggled via PATCH
  // /tasks/:id from the Tasks list, mirroring Mark Completed.
  invoiced: boolean("invoiced").notNull().default(false),
  // No longer drives Tasks list bucketing (see venueId comment above and
  // lib/task-bucket.ts - that's now based on field completeness). Kept
  // as manually-settable state via PATCH /tasks/:id, clientConfirmed,
  // in case it's needed again later.
  clientConfirmedAt: timestamp("client_confirmed_at", { withTimezone: true }),
  // Where the client's quotation stands - "approved" | "awaiting_approval"
  // | "denied", set by hand by a Manager on the task form. Independent of
  // clientConfirmedAt/status; nothing derives from it yet.
  quotationStatus: text("quotation_status").notNull().default("awaiting_approval"),
  // Optional link to a saved Client record (see schema/clients.ts) - a
  // task can still be created for a one-off client with no record here,
  // per direct product direction ("add a client picker, keep free text
  // as fallback"). clientName/clientContact stay the actual freeform
  // fields on the task even when linked, since picking a client just
  // pre-fills them rather than replacing them.
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull().default(""),
  clientContact: text("client_contact").notNull().default(""),
  clientRequirements: text("client_requirements").notNull().default(""),
  operatorsRequired: integer("operators_required").notNull().default(1),
  // Whether the client's request calls for armed operators - a single
  // flag for the whole task, not per-operator, set on the intake form
  // alongside Operators Needed.
  armedRequired: boolean("armed_required").notNull().default(false),
  vehiclesRequired: integer("vehicles_required").notNull().default(0),
  estimatedCost: real("estimated_cost"),
  estimatedCostCurrency: text("estimated_cost_currency").notNull().default("ZAR"),
  // Manual line items (description + amount) a Manager builds up on the
  // Quotations page's Quotation Workspace to work out estimatedCost -
  // per direct product direction: "let's do it manually, we will
  // automate it later, now I just need the engine build first". Feeds
  // the client-facing quotation PDF (see lib/quotation-pdf.ts); doesn't
  // look up CPO rates or vehicle/armed pricing yet.
  quotationLineItems: jsonb("quotation_line_items").notNull().default([]).$type<{ description: string; amount: number }[]>(),
  // Task-lifecycle flagging on the Alerts page (Pending Details / Pending
  // Allocation / Completed - see lib/task-bucket.ts on the frontend),
  // separate from the OSINT/GDELT-driven alertsTable. Scoped to a bucket
  // name rather than a plain boolean so a task that's already been
  // reviewed in one bucket (e.g. Pending Details) shows up unreviewed
  // again once it moves to the next one (e.g. Pending Allocation) -
  // each bucket is its own thing to look at.
  alertReviewedBucket: text("alert_reviewed_bucket"),
  alertReviewedAt: timestamp("alert_reviewed_at", { withTimezone: true }),
  alertReviewedBy: integer("alert_reviewed_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
