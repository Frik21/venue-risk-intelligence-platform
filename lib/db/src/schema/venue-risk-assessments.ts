import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { venuesTable } from "./venues";
import { usersTable } from "./users";

// The CPO's in-field venue risk assessment - filled in from the
// Operational Canvas (Risk Assessments > Venues > a venue), after a
// task's venue has been selected. Distinct from the existing formal
// assessments/risk-matrix/versioning system (schema/assessments.ts,
// the Manager/Analyst-facing "Assessments" nav item) - this is a
// lighter, CPO-facing checklist per (task, venue) pair, not a
// versioned/approved document. Every field below is a single free-text
// comment box the CPO writes into directly (per direct product
// direction) - no nested sub-lists.
export const venueRiskAssessmentsTable = pgTable(
  "venue_risk_assessments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
    venueId: integer("venue_id").notNull().references(() => venuesTable.id, { onDelete: "cascade" }),
    operatorId: integer("operator_id").notNull().references(() => usersTable.id),
    // Captured automatically when the assessment is created (see
    // "Date, Time, Operator, Timezone - automatic" in the product
    // spec) - createdAt covers date/time, this covers timezone.
    timezone: text("timezone"),
    // Location / Venue - unlike Date/Time/Operator/Timezone, this is
    // typed in by the operator, not derived from the venue record (per
    // direct product direction).
    location: text("location").notNull().default(""),
    currentOperatingConditions: text("current_operating_conditions").notNull().default(""),
    areaAdvisories: text("area_advisories").notNull().default(""),
    checkpoints: text("checkpoints").notNull().default(""),
    observedHazards: text("observed_hazards").notNull().default(""),
    existingControls: text("existing_controls").notNull().default(""),
    recommendedActions: text("recommended_actions").notNull().default(""),
    operatorNotes: text("operator_notes").notNull().default(""),
    attachments: text("attachments").notNull().default(""),
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    taskVenueUnique: unique().on(table.taskId, table.venueId),
  }),
);

export const insertVenueRiskAssessmentSchema = createInsertSchema(venueRiskAssessmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVenueRiskAssessment = z.infer<typeof insertVenueRiskAssessmentSchema>;
export type VenueRiskAssessment = typeof venueRiskAssessmentsTable.$inferSelect;
