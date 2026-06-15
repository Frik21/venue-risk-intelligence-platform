import { pgTable, text, serial, integer, real, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { venuesTable } from "./venues";

export const incidentsTable = pgTable("incidents", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").references(() => venuesTable.id, { onDelete: "set null" }),
  incidentType: text("incident_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  incidentDate: timestamp("incident_date", { withTimezone: true }).notNull(),
  summary: text("summary").notNull(),
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  lat: real("lat"),
  lng: real("lng"),
  distanceFromVenue: real("distance_from_venue"),
  confidenceLevel: text("confidence_level").default("medium"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIncidentSchema = createInsertSchema(incidentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Incident = typeof incidentsTable.$inferSelect;
