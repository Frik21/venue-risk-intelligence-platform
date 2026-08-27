import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";

// A CPO's own field-filed incident report - Following Roadmap, Tier 2
// item 6 ("offline-first sync for field timesheet/incident entries").
// Distinct from incidentsTable (lib/db/src/schema/incidents.ts), which
// is OSINT/GDELT-sourced external intelligence tied to a venue, not
// something a CPO files themselves - this is a first-hand report from
// whoever's actually on the ground, same "operator's own signal" shape
// as checkinsTable. taskId nullable for the same reason checkins.taskId
// is: an incident isn't only reportable during a formally in_progress
// task. Submitted through the frontend's offline queue
// (lib/offline-queue.ts) so a report typed in a dead zone isn't lost -
// it syncs once the CPO's connection comes back.
export const fieldIncidentReportsTable = pgTable("field_incident_reports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").references(() => tasksTable.id, { onDelete: "set null" }),
  cpoId: integer("cpo_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  severity: text("severity").notNull().default("medium"),
  summary: text("summary").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  locationLabel: text("location_label"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  // Set by whoever on Command Desk reviews it - see pages/alerts/
  // list.tsx's Field Incident Reports panel. Null means still needs review.
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertFieldIncidentReportSchema = createInsertSchema(fieldIncidentReportsTable).omit({ id: true, occurredAt: true });
export type InsertFieldIncidentReport = z.infer<typeof insertFieldIncidentReportSchema>;
export type FieldIncidentReport = typeof fieldIncidentReportsTable.$inferSelect;
