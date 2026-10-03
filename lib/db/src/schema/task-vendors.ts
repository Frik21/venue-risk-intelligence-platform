import { pgTable, serial, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { tasksTable } from "./tasks";
import { vendorsTable } from "./vendors";
import { usersTable } from "./users";

// The real Task<->Vendor link - Following Roadmap Tier 3, item 20's
// own scoping (confirmed via AskUserQuestion): vendors previously had
// no connection to Tasks anywhere in the schema at all, so "vendor
// performance over time" had nothing real to hang a review off other
// than the vendor record itself. This join table (same shape as
// task_assignments, minus a role column - a vendor assignment has no
// CPO-style hierarchy to capture) is what a performance review
// (vendor-performance-reviews.ts) is actually reviewing: a specific,
// real instance of using this vendor on this job. A vendor can be used
// on more than one task and a task can use more than one vendor, hence
// a join table rather than a single vendorId column on tasks.
export const taskVendorsTable = pgTable("task_vendors", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  addedBy: integer("added_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_task_vendors_company_id").on(table.companyId),
  index("idx_task_vendors_task_id").on(table.taskId),
  index("idx_task_vendors_vendor_id").on(table.vendorId),
  unique("task_vendors_task_id_vendor_id_unique").on(table.taskId, table.vendorId),
]);

export type TaskVendor = typeof taskVendorsTable.$inferSelect;
