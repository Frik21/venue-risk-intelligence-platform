import { pgTable, text, serial, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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

// Expanded routes table
export const routesTable = pgTable("routes", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").references(() => assessmentsTable.id, { onDelete: "cascade" }),
  venueId: integer("venue_id").references(() => venuesTable.id, { onDelete: "set null" }),
  routeName: text("route_name").notNull(),
  routeType: text("route_type").notNull().default("primary_extraction"),
  creationMethod: text("creation_method").notNull().default("endpoint_marker"),
  startLabel: text("start_label"),
  startLat: real("start_lat"),
  startLng: real("start_lng"),
  endLabel: text("end_label"),
  endLat: real("end_lat"),
  endLng: real("end_lng"),
  waypointsJson: jsonb("waypoints_json"),
  routeGeometryGeojson: jsonb("route_geometry_geojson"),
  estimatedDistance: real("estimated_distance"),
  estimatedTravelTime: integer("estimated_travel_time"),
  constraints: jsonb("constraints"),
  analystNotes: text("analyst_notes"),
  verified: boolean("verified").notNull().default(false),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRouteSchema = createInsertSchema(routesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routesTable.$inferSelect;

// Route intelligence findings
export const routeFindingsTable = pgTable("route_findings", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").notNull().references(() => routesTable.id, { onDelete: "cascade" }),
  assessmentId: integer("assessment_id").references(() => assessmentsTable.id, { onDelete: "set null" }),
  venueId: integer("venue_id").references(() => venuesTable.id, { onDelete: "set null" }),
  findingType: text("finding_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  summary: text("summary").notNull(),
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  distanceFromRoute: real("distance_from_route"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  verified: boolean("verified").notNull().default(false),
  analystNotes: text("analyst_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRouteFindingSchema = createInsertSchema(routeFindingsTable).omit({ id: true, createdAt: true });
export type InsertRouteFinding = z.infer<typeof insertRouteFindingSchema>;
export type RouteFinding = typeof routeFindingsTable.$inferSelect;
