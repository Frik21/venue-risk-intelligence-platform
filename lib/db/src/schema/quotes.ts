import { pgTable, text, serial, integer, timestamp, boolean, real, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { venuesTable } from "./venues";
import { usersTable } from "./users";
import { tasksTable } from "./tasks";
import { officesTable } from "./offices";
import { companiesTable } from "./companies";

// A formal sales quote - its own record with its own number/status
// lifecycle (Draft -> Sent -> Approved/Rejected), independent of
// whether an operational Task ever gets created from it. Deliberately
// separate from tasks.quotationStatus/quotationLineItems (that's a
// lighter per-task pricing gate that drives the Running pipeline -
// see lib/task-bucket.ts on the frontend and its own comment) - a
// Quote can exist, be sent, and be rejected without any Task ever
// existing, per direct product direction ("I would not require final
// CPO assignment at quotation stage").
export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),

  // Optional link back to the Task Request this quote was created
  // from (Quotations > Task Pending Quotation) - a Quote can still be
  // created with no Task at all, this is just how a task drops off
  // that pending list once it has one.
  taskId: integer("task_id").references(() => tasksTable.id, { onDelete: "set null" }),

  // Which office this quote belongs to - see officeId comment in
  // schema/users.ts for the broader multi-office direction.
  officeId: integer("office_id").references(() => officesTable.id, { onDelete: "set null" }),

  // 1. Quote Details
  title: text("title").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | sent | approved | rejected
  validUntil: timestamp("valid_until", { withTimezone: true }),

  // 2. Client - clientId is an optional link to a saved Client record
  // (see clientId comment in schema/tasks.ts - same "pick fills in,
  // free text still works" convention). billingDetails is deliberately
  // one freeform field (address/VAT/registration etc.) rather than
  // several structured ones, since nothing beyond "if needed" was
  // specified for it.
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull().default(""),
  clientContact: text("client_contact").notNull().default(""),
  billingDetails: text("billing_details").notNull().default(""),

  // 3. Operational Requirement
  venueId: integer("venue_id").references(() => venuesTable.id, { onDelete: "set null" }),
  clientRequirements: text("client_requirements").notNull().default(""),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  priority: text("priority").notNull().default("medium"),

  // 4. Resources Required
  operatorsRequired: integer("operators_required").notNull().default(1),
  armedRequired: boolean("armed_required").notNull().default(false),
  vehiclesRequired: integer("vehicles_required").notNull().default(0),
  additionalEquipment: text("additional_equipment").notNull().default(""),

  // 5. Cost Build-Up - categorized manual line items (CPO rate,
  // overtime, vehicles, fuel/mileage, accommodation, flights/travel,
  // equipment, subcontractors, allowances, misc), same "type an
  // amount" approach as tasks.quotationLineItems - per direct product
  // direction: manual for now, automated later.
  costLineItems: jsonb("cost_line_items").notNull().default([]).$type<{ category: string; description: string; amount: number }[]>(),

  // 6. Commercials - internalCost/markupAmount/clientPrice/taxAmount/
  // totalQuoteValue are derived from costLineItems + these on every
  // read (see formatQuote in routes/quotes.ts), not stored, so
  // there's exactly one source of truth for the math.
  markupType: text("markup_type").notNull().default("percent"), // percent | fixed
  markupValue: real("markup_value").notNull().default(0),
  taxRatePercent: real("tax_rate_percent").notNull().default(0),
  currency: text("currency").notNull().default("ZAR"),

  // 7. Assignment / Ownership - responsible manager only. Real CPO
  // assignment happens once an actual Task exists (see
  // task-assignments.ts), not at quotation stage.
  assignedBy: integer("assigned_by").notNull().references(() => usersTable.id),

  sentAt: timestamp("sent_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("idx_quotes_company_id").on(table.companyId)]);

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
