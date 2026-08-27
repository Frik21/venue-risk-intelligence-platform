import { pgTable, serial, integer, text, real, jsonb, timestamp, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";
import { companiesTable } from "./companies";

// A CPO's route for a specific task - Route Planning (Operational
// Canvas), same task-scoped/slot pattern as venue_risk_assessments: a
// task can have several routes (primary, alternative, ...), added on
// demand rather than requiring a fixed count. Start/end are picked via
// the location engine (search or "use my current location"), same as
// everywhere else that takes a location in this app - not drawn on a
// map, since this panel doesn't have one embedded.
//
// Geometry/distance/static duration come from OSRM (router.project-
// osrm.org, free, no key - same public demo server the existing
// Routes feature already uses). Live traffic ETA comes from TomTom's
// Routing API (traffic=true) - a second, separate provider, kept
// distinct from OSRM specifically so the free/unlimited geometry call
// and the metered traffic call can be triggered independently (see
// POST /routes/:id/calculate).
export const taskRoutesTable = pgTable(
  "task_routes",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
    taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull().default(1),
    startLabel: text("start_label").notNull().default(""),
    startLat: real("start_lat"),
    startLng: real("start_lng"),
    endLabel: text("end_label").notNull().default(""),
    endLat: real("end_lat"),
    endLng: real("end_lng"),
    routeGeometryGeojson: jsonb("route_geometry_geojson"),
    distanceMeters: real("distance_meters"),
    staticTravelTimeSeconds: integer("static_travel_time_seconds"),
    liveTravelTimeSeconds: integer("live_travel_time_seconds"),
    trafficDelaySeconds: integer("traffic_delay_seconds"),
    trafficCheckedAt: timestamp("traffic_checked_at", { withTimezone: true }),
    // Nearest hospitals/police stations found along the route corridor
    // (see lib/nearby-services.ts) - populated alongside the OSRM
    // geometry on calculate, not user-editable. Automates the Task
    // Planning checklist's "Closest hospitals identified"/"Closest
    // police stations identified" items for this route.
    nearestHospitalsJson: jsonb("nearest_hospitals_json"),
    nearestPoliceStationsJson: jsonb("nearest_police_stations_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique("task_routes_task_id_slot_index_unique").on(table.taskId, table.slotIndex),
    index("idx_task_routes_company_id").on(table.companyId),
  ],
);

export const insertTaskRouteSchema = createInsertSchema(taskRoutesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTaskRoute = z.infer<typeof insertTaskRouteSchema>;
export type TaskRoute = typeof taskRoutesTable.$inferSelect;
