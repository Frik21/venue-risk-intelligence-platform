import { pgTable, text, serial, integer, real, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { quotesTable } from "./quotes";
import { clientsTable } from "./clients";
import { usersTable } from "./users";
import { officesTable } from "./offices";
import { companiesTable } from "./companies";

// A client-facing Invoice - money owed TO VenueGuard, the natural next
// step after a Task/Quote is approved and completed, per direct
// product direction ("client invoices - money owed to you"). Kept
// deliberately simpler than Quotes (schema/quotes.ts): no markup, no
// derived internal-cost/client-price build-up - just billing line
// items and a tax rate, since an invoice bills a client for an
// already-agreed amount rather than working one out.
//
// taskId/quoteId are both optional and independent - an invoice can
// be raised straight from an approved Quote (pre-filling client/title/
// amount from it), directly against a Task with no formal Quote, or
// standalone for a one-off client with neither. clientName/
// clientContact/billingDetails stay the actual freeform fields even
// when clientId is linked, same convention as Quotes/Tasks.
//
// A quote's approval (routes/quotes.ts) auto-creates a draft invoice
// here as a single uncategorized line item for the quote's total -
// per direct product direction, a Manager can then add further,
// categorized line items for costs incurred beyond what was quoted
// (operational costs, additional manpower, vehicles, etc.), reusing
// Quotes' own cost category vocabulary (COST_CATEGORIES in
// routes/quotes.ts) so both entities speak the same taxonomy. category
// is nullable - null means "the original agreed amount", a real
// category means "an extra cost added after the fact".
export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").references(() => tasksTable.id, { onDelete: "set null" }),
  quoteId: integer("quote_id").references(() => quotesTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  // Which office this invoice belongs to - see officeId comment in
  // schema/users.ts for the broader multi-office direction.
  officeId: integer("office_id").references(() => officesTable.id, { onDelete: "set null" }),
  title: text("title").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | sent | paid
  clientName: text("client_name").notNull().default(""),
  clientContact: text("client_contact").notNull().default(""),
  billingDetails: text("billing_details").notNull().default(""),
  dueDate: timestamp("due_date", { withTimezone: true }),
  lineItems: jsonb("line_items").notNull().default([]).$type<{ category: string | null; description: string; amount: number }[]>(),
  taxRatePercent: real("tax_rate_percent").notNull().default(0),
  currency: text("currency").notNull().default("ZAR"),
  assignedBy: integer("assigned_by").notNull().references(() => usersTable.id),
  // Stamped the first time the invoice moves into that status - see
  // sentAt/decidedAt on quotesTable for the same reasoning.
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("idx_invoices_company_id").on(table.companyId)]);

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
