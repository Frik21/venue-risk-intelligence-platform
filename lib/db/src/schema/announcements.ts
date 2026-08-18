import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A Manager-to-CPO broadcast instruction/announcement - one-way, no
// chat, no per-CPO targeting (visible to every CPO), per direct
// product direction. Shows up in every CPO's Communications panel on
// the Operational Canvas and surfaces in their Alerts too (an
// instruction from a Manager isn't something an operator should have
// to go looking for in a separate panel to notice - see
// instructionAlerts in dashboard.tsx). Append-only, same convention as
// client_activities/vendor_activities - no editing, a Manager
// retracts one by deleting it outright.
export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({ id: true, createdAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;
