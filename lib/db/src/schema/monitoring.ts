import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";
import { incidentsTable } from "./incidents";
import { usersTable } from "./users";
import { assessmentsTable } from "./assessments";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venuesTable.id, { onDelete: "cascade" }),
  incidentId: integer("incident_id").references(() => incidentsTable.id, { onDelete: "set null" }),
  priority: text("priority").notNull().default("medium"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;

export const osintEventsTable = pgTable("osint_events", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venuesTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  summary: text("summary").notNull(),
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  lat: real("lat"),
  lng: real("lng"),
  status: text("status").notNull().default("pending"),
  analystNote: text("analyst_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOsintEventSchema = createInsertSchema(osintEventsTable).omit({ id: true, createdAt: true });
export type InsertOsintEvent = z.infer<typeof insertOsintEventSchema>;
export type OsintEvent = typeof osintEventsTable.$inferSelect;

export const routesTable = pgTable("routes", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentsTable.id, { onDelete: "cascade" }),
  routeType: text("route_type").notNull(),
  description: text("description"),
  waypoints: text("waypoints"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRouteSchema = createInsertSchema(routesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routesTable.$inferSelect;
