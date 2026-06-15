import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, incidentsTable, venuesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const IncidentInputSchema = z.object({
  venueId: z.number().int().optional(),
  incidentType: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  incidentDate: z.string(),
  summary: z.string().min(1),
  sourceName: z.string().optional(),
  sourceUrl: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  distanceFromVenue: z.number().optional(),
  confidenceLevel: z.enum(["low", "medium", "high"]).optional(),
  verified: z.boolean().optional(),
});

async function formatIncident(row: typeof incidentsTable.$inferSelect, venueName?: string | null) {
  return {
    id: row.id,
    venueId: row.venueId ?? null,
    venueName: venueName ?? null,
    incidentType: row.incidentType,
    severity: row.severity as "low" | "medium" | "high" | "critical",
    incidentDate: row.incidentDate.toISOString(),
    summary: row.summary,
    sourceName: row.sourceName ?? null,
    sourceUrl: row.sourceUrl ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    distanceFromVenue: row.distanceFromVenue ?? null,
    confidenceLevel: row.confidenceLevel ?? null,
    verified: row.verified,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/incidents", async (_req, res): Promise<void> => {
  const incidents = await db.select().from(incidentsTable).orderBy(desc(incidentsTable.incidentDate));
  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name }).from(venuesTable);
  const venueMap: Record<number, string> = {};
  for (const v of venues) venueMap[v.id] = v.name;

  const result = await Promise.all(incidents.map((i) => formatIncident(i, i.venueId ? venueMap[i.venueId] : null)));
  res.json(result);
});

router.post("/incidents", async (req, res): Promise<void> => {
  const parsed = IncidentInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { incidentDate, ...rest } = parsed.data;
  const [incident] = await db
    .insert(incidentsTable)
    .values({ ...rest, incidentDate: new Date(incidentDate) })
    .returning();

  let venueName: string | null = null;
  if (incident.venueId) {
    const [v] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, incident.venueId));
    venueName = v?.name ?? null;
  }

  res.status(201).json(await formatIncident(incident, venueName));
});

router.patch("/incidents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const UpdateSchema = IncidentInputSchema.partial();
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.incidentDate) updates.incidentDate = new Date(parsed.data.incidentDate);

  const [incident] = await db
    .update(incidentsTable)
    .set(updates)
    .where(eq(incidentsTable.id, id))
    .returning();

  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

  let venueName: string | null = null;
  if (incident.venueId) {
    const [v] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, incident.venueId));
    venueName = v?.name ?? null;
  }

  res.json(await formatIncident(incident, venueName));
});

router.delete("/incidents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(incidentsTable).where(eq(incidentsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Incident not found" }); return; }
  res.sendStatus(204);
});

export default router;
