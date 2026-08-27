import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { tasksTable } from "./tasks";
import { usersTable } from "./users";

// The live duty-of-care signal a CPO sends from the field - per direct
// product direction (Following Roadmap, Tier 1 item 1), the strongest
// "where has this been all my life" feature on Operators Note: everything
// else in the platform is admin, this is what actually protects the
// operator. Three event types on one table: "ok" (a routine check-in the
// CPO submits themselves), "panic" (the CPO's own emergency trigger, not
// tied to any schedule), and "missed" (the system's own finding - see
// lib/checkin-monitor.ts's background scan, same setInterval pattern as
// lib/gdelt-monitor.ts, for a task with tasks.checkInIntervalMinutes set
// where the gap since the last "ok"/"panic" has grown too long).
// location is optional (a CPO might not grant browser geolocation) but
// captured whenever available via the existing resolveCurrentLocation()
// (components/location-search.tsx) - reused rather than a second
// geolocation implementation, same engine already used for the CPO's
// "Current Area" and the currency engine's country detection.
export const checkinsTable = pgTable("checkins", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  cpoId: integer("cpo_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  locationLabel: text("location_label"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  // Set by whoever on Command Desk sees the alert and responds - see
  // pages/alerts/list.tsx's Safety Alerts panel. Null means it still
  // needs attention.
  acknowledgedBy: integer("acknowledged_by").references(() => usersTable.id),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

export const insertCheckinSchema = createInsertSchema(checkinsTable).omit({ id: true, triggeredAt: true });
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkinsTable.$inferSelect;
