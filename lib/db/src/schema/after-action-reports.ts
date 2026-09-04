import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";

// A structured after-action report, filed by the CPO who worked the
// task - Following Roadmap, Tier 2 item 7 ("industry-standard,
// currently only free-text fields exist"). Fixed sections rather than
// one blob, matching the standard close-protection AAR shape: what
// happened, what went wrong, whether the plan held up, what the
// client said, what to change next time. Unlike checkins/field
// incident reports, taskId is required and non-nullable - an AAR is
// inherently about a specific job, never a standalone signal - and
// onDelete: cascade (matching expensesTable.taskId, the closest
// existing "required, task-owned child record") rather than set null,
// since a report with nothing left to report on isn't meaningful to
// keep around. A CPO can file more than one against the same task
// (e.g. an interim note during a multi-day deployment, then a final
// one) - append-only list, same convention as field_incident_reports,
// rather than a single upsert-per-task record.
export const afterActionReportsTable = pgTable("after_action_reports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  cpoId: integer("cpo_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  incidentsEncountered: text("incidents_encountered"),
  routeDeviations: text("route_deviations"),
  clientFeedback: text("client_feedback"),
  recommendations: text("recommendations"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  // Set by whoever on Command Desk reviews it, same reviewedBy/
  // reviewedAt shape as field_incident_reports/checkins. Null means
  // still needs review.
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (table) => [
  index("idx_after_action_reports_company_id").on(table.companyId),
  index("idx_after_action_reports_task_id").on(table.taskId),
]);

export const insertAfterActionReportSchema = createInsertSchema(afterActionReportsTable).omit({ id: true, submittedAt: true });
export type InsertAfterActionReport = z.infer<typeof insertAfterActionReportSchema>;
export type AfterActionReport = typeof afterActionReportsTable.$inferSelect;
