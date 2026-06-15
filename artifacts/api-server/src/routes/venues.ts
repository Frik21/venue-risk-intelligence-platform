import { Router, type IRouter } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db, venuesTable, assessmentsTable, incidentsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const VenueInputSchema = z.object({
  name: z.string().min(1),
  venueType: z.string().optional(),
  address: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  googleMapsUrl: z.string().optional(),
  district: z.string().optional(),
  environmentType: z.string().optional(),
  notes: z.string().optional(),
});

function formatVenue(row: typeof venuesTable.$inferSelect, assessmentCount = 0) {
  return {
    id: row.id,
    name: row.name,
    venueType: row.venueType,
    address: row.address,
    city: row.city,
    country: row.country,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    googleMapsUrl: row.googleMapsUrl ?? null,
    district: row.district ?? null,
    environmentType: row.environmentType ?? null,
    notes: row.notes ?? null,
    assessmentCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/venues", async (_req, res): Promise<void> => {
  const venues = await db.select().from(venuesTable).orderBy(desc(venuesTable.updatedAt));
  const assessmentCounts = await db
    .select({ venueId: assessmentsTable.venueId, cnt: count() })
    .from(assessmentsTable)
    .groupBy(assessmentsTable.venueId);

  const countMap: Record<number, number> = {};
  for (const row of assessmentCounts) {
    if (row.venueId !== null) countMap[row.venueId] = Number(row.cnt);
  }

  res.json(venues.map((v) => formatVenue(v, countMap[v.id] ?? 0)));
});

router.get("/venues/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [venue] = await db.select().from(venuesTable).where(eq(venuesTable.id, id));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  const assessments = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.venueId, id))
    .orderBy(desc(assessmentsTable.updatedAt));

  const recentIncidents = await db
    .select()
    .from(incidentsTable)
    .where(eq(incidentsTable.venueId, id))
    .orderBy(desc(incidentsTable.incidentDate))
    .limit(5);

  const assessmentSummaries = assessments.map((a) => ({
    id: a.id,
    venueId: a.venueId ?? null,
    venueName: venue.name,
    venueCity: venue.city,
    title: a.title,
    description: a.description ?? null,
    status: a.status as "draft" | "under_review" | "approved" | "monitoring" | "review_required" | "escalated" | "archived",
    version: a.version,
    overallRating: null as string | null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  const incidents = recentIncidents.map((i) => ({
    id: i.id,
    venueId: i.venueId ?? null,
    venueName: venue.name,
    incidentType: i.incidentType,
    severity: i.severity as "low" | "medium" | "high" | "critical",
    incidentDate: i.incidentDate.toISOString(),
    summary: i.summary,
    sourceName: i.sourceName ?? null,
    sourceUrl: i.sourceUrl ?? null,
    lat: i.lat ?? null,
    lng: i.lng ?? null,
    distanceFromVenue: i.distanceFromVenue ?? null,
    confidenceLevel: i.confidenceLevel ?? null,
    verified: i.verified,
    createdAt: i.createdAt.toISOString(),
  }));

  res.json({
    ...formatVenue(venue, assessments.length),
    assessments: assessmentSummaries,
    recentIncidents: incidents,
  });
});

router.post("/venues", async (req, res): Promise<void> => {
  const parsed = VenueInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [venue] = await db.insert(venuesTable).values(parsed.data).returning();
  res.status(201).json(formatVenue(venue, 0));
});

router.patch("/venues/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const UpdateSchema = VenueInputSchema.partial();
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [venue] = await db
    .update(venuesTable)
    .set(parsed.data)
    .where(eq(venuesTable.id, id))
    .returning();

  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }
  res.json(formatVenue(venue));
});

router.delete("/venues/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(venuesTable).where(eq(venuesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Venue not found" }); return; }
  res.sendStatus(204);
});

export default router;
