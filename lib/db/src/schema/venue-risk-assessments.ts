import { pgTable, serial, integer, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

// The CPO's in-field risk assessment - filled in from the Operational
// Canvas (Risk Assessments > Venues > a task). Distinct from the
// existing formal assessments/risk-matrix/versioning system
// (schema/assessments.ts, the Manager/Analyst-facing "Assessments" nav
// item) - this is a lighter, CPO-facing checklist, not a
// versioned/approved document. Every field is a single free-text
// comment box the CPO writes into directly (per direct product
// direction), including Location - so a task doesn't need a matching
// real venue record to get another assessment: a task can cover
// several physical locations (slotIndex 1, 2, 3...), each its own
// assessment, with the CPO typing the actual location into each one.
export const venueRiskAssessmentsTable = pgTable(
  "venue_risk_assessments",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
    taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
    // 1, 2, 3... per task - lets a CPO add another assessment for the
    // same task (e.g. a second/third venue) without a real venue
    // record existing for it.
    slotIndex: integer("slot_index").notNull().default(1),
    operatorId: integer("operator_id").notNull().references(() => usersTable.id),
    // Captured automatically when the assessment is created (see
    // "Date, Time, Operator, Timezone - automatic" in the product
    // spec) - createdAt covers date/time, this covers timezone.
    timezone: text("timezone"),
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
  (table) => [
    unique("venue_risk_assessments_task_id_slot_index_unique").on(table.taskId, table.slotIndex),
    index("idx_venue_risk_assessments_company_id").on(table.companyId),
  ],
);

export const insertVenueRiskAssessmentSchema = createInsertSchema(venueRiskAssessmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVenueRiskAssessment = z.infer<typeof insertVenueRiskAssessmentSchema>;
export type VenueRiskAssessment = typeof venueRiskAssessmentsTable.$inferSelect;
