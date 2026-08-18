import { pgTable, text, serial, integer, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { quotesTable } from "./quotes";
import { clientsTable } from "./clients";
import { usersTable } from "./users";

// A client-facing Invoice - money owed TO VenueGuard, the natural next
// step after a Task/Quote is approved and completed, per direct
// product direction ("client invoices - money owed to you"). Kept
// deliberately separate and simpler than Quotes (schema/quotes.ts):
// no cost-category build-up or markup, since an invoice bills a
// client for an already-agreed amount rather than working one out -
// just billing line items (description + amount) and a tax rate.
//
// taskId/quoteId are both optional and independent - an invoice can
// be raised straight from an approved Quote (pre-filling client/title/
// amount from it), directly against a Task with no formal Quote, or
// standalone for a one-off client with neither. clientName/
// clientContact/billingDetails stay the actual freeform fields even
// when clientId is linked, same convention as Quotes/Tasks.
export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasksTable.id, { onDelete: "set null" }),
  quoteId: integer("quote_id").references(() => quotesTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  title: text("title").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | sent | paid
  clientName: text("client_name").notNull().default(""),
  clientContact: text("client_contact").notNull().default(""),
  billingDetails: text("billing_details").notNull().default(""),
  dueDate: timestamp("due_date", { withTimezone: true }),
  lineItems: jsonb("line_items").notNull().default([]).$type<{ description: string; amount: number }[]>(),
  taxRatePercent: real("tax_rate_percent").notNull().default(0),
  currency: text("currency").notNull().default("ZAR"),
  assignedBy: integer("assigned_by").notNull().references(() => usersTable.id),
  // Stamped the first time the invoice moves into that status - see
  // sentAt/decidedAt on quotesTable for the same reasoning.
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
