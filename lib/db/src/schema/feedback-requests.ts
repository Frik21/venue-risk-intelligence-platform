import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";

// Post-task client satisfaction feedback - Following Roadmap Tier 3,
// item 19. Scoped via AskUserQuestion: there's no client portal or
// client login anywhere in this app (that's its own separate,
// unbuilt roadmap item, #25) - so a client's feedback is collected
// through a one-time public link a Manager generates and sends
// manually (no email infra exists to send it automatically, same
// "generate it, show it once, send it yourself" pattern already used
// for admin-created users' initial passwords and the forgot-password
// flow's logged-not-emailed reset link).
//
// Keyed by an opaque random token (same shape as sessions.id/
// password_reset_tokens.id - see lib/auth.ts's createSession) rather
// than a serial id, since this value is handed directly to someone
// outside the company and must be unguessable. submittedAt is null
// until the client actually fills the form in - same "null until
// consumed, then locked" shape as password_reset_tokens.usedAt, so a
// link can't be resubmitted/overwritten once answered.
//
// Four ratings (overall + professionalism/punctuality/communication
// sub-scores, each 1-5) rather than just one overall number, per
// direct product direction - more diagnostic than a single score, but
// still simple, fixed fields rather than an open-ended survey.
export const feedbackRequestsTable = pgTable("feedback_requests", {
  id: text("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  requestedBy: integer("requested_by").notNull().references(() => usersTable.id),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),

  overallRating: integer("overall_rating"),
  professionalismRating: integer("professionalism_rating"),
  punctualityRating: integer("punctuality_rating"),
  communicationRating: integer("communication_rating"),
  comment: text("comment").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
}, (table) => [
  index("idx_feedback_requests_company_id").on(table.companyId),
  index("idx_feedback_requests_task_id").on(table.taskId),
]);

export type FeedbackRequest = typeof feedbackRequestsTable.$inferSelect;
