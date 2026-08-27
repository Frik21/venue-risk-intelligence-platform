import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";
import { companiesTable } from "./companies";

// One expense logged against a task - Profile > Expenses. A task can
// have several (fuel, food, parking, ...), added on demand like
// venue_risk_assessments/task_routes rather than a fixed count.
// receiptDataUrl stores the uploaded receipt as a base64 data: URL
// directly in the row - this app has no cloud file storage set up
// (evidence.ts's "uploads" are URL/text-only for the same reason), so
// this is the simplest way to make "upload a receipt" actually work
// without adding a storage dependency. Kept out of Postgres's default
// row-size concerns by capping upload size at the route (see
// routes/expenses.ts's dedicated body-size limit).
export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  operatorId: integer("operator_id").notNull().references(() => usersTable.id),
  category: text("category").notNull().default("other"),
  amount: real("amount").notNull().default(0),
  currency: text("currency").notNull().default("ZAR"),
  description: text("description").notNull().default(""),
  incurredOn: text("incurred_on").notNull(),
  receiptFilename: text("receipt_filename"),
  receiptDataUrl: text("receipt_data_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
