import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// The real "support channel for subscribers" item from CLAUDE.md's
// Outstanding/Roadmap - a subscriber (Command Desk or Operators Note)
// submits a ticket, which lands in the Owner's own IT inbox
// (routes/support-tickets.ts, Owner-only GET/PATCH; the POST intake
// itself is open to any authenticated company-scoped user, including a
// Solo Operator CPO). No email delivery - "sent to all of IT" means
// visible in this one shared in-app inbox, same as every other
// Owner-shared surface (Master Console), since no email infrastructure
// exists in this codebase yet.
export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  // "command_desk" | "operators_note" - which surface it was submitted
  // from, useful triage context since the two apps' users hit very
  // different kinds of issues.
  source: text("source").notNull(),
  // "open" | "in_progress" | "resolved" | "closed"
  status: text("status").notNull().default("open"),
  // "low" | "normal" | "high"
  priority: text("priority").notNull().default("normal"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("idx_support_tickets_company_id").on(table.companyId)]);

export const insertSupportTicketSchema = createInsertSchema(supportTicketsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;
