import { pgTable, serial, integer, real, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

// A Pay Run - one payout to one operator, covering whatever approved
// timesheet entries were still unpaid at the moment it was created
// (see payRunId on timesheet_entries.ts, the join back the other
// way). totalHours/totalAmount are snapshotted here rather than
// recomputed live from those entries on every read - unlike Quotes/
// Invoices' commercials (which recompute so an in-progress draft
// always reflects its current line items), a Pay Run represents money
// that's already been committed to/paid out, so its amount shouldn't
// silently drift if a CPO's rate changes afterwards.
//
// status stays "pending" until a Manager explicitly marks it paid
// (PATCH .../status) - creating the run just locks in which hours
// it covers and the amount, same two-step pattern as Invoices
// (draft/sent vs paid), not an instant payment.
export const payRunsTable = pgTable("pay_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  totalHours: real("total_hours").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | paid
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("idx_pay_runs_company_id").on(table.companyId)]);

export const insertPayRunSchema = createInsertSchema(payRunsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayRun = z.infer<typeof insertPayRunSchema>;
export type PayRun = typeof payRunsTable.$inferSelect;
