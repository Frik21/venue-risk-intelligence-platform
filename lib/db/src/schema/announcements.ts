import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tasksTable } from "./tasks";
import { companiesTable } from "./companies";

// A Manager-to-CPO broadcast instruction/announcement - one-way, no
// chat, per direct product direction. Optionally scoped to one task
// (taskId) - when set, only CPOs on that task's roster see it; when
// null, it's a general broadcast visible to every CPO. Shows up in
// the relevant CPOs' Communications panel on the Operational Canvas
// and surfaces in their Alerts too (an instruction from a Manager
// isn't something an operator should have to go looking for in a
// separate panel to notice - see instructionAlerts in dashboard.tsx).
// Append-only, same convention as client_activities/vendor_activities -
// no editing, a Manager retracts one by deleting it outright.
// onDelete: set null (not cascade) so a message like "principal
// delayed" stays around as a general note even if the task it was
// about later gets deleted.
export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  message: text("message").notNull(),
  taskId: integer("task_id").references(() => tasksTable.id, { onDelete: "set null" }),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("idx_announcements_company_id").on(table.companyId)]);

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({ id: true, createdAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;
