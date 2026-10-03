import { Router, type IRouter } from "express";
import { sql, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, statusIncidentsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;

function formatIncident(row: typeof statusIncidentsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    status: row.status as (typeof INCIDENT_STATUSES)[number],
    createdAt: row.createdAt.toISOString(),
  };
}

// Public status page - Platform Maturity Roadmap, Tier 5, item 11.
// Entirely public (no session), registered ahead of the central
// requireAuth gate in routes/index.ts, same placement as
// feedbackRouter/clientPortalRouter - so a subscriber mid-incident can
// check "is it down for everyone or just me" without logging in at
// all, let alone filing a ticket and waiting. Deliberately separate
// from the Owner-only GET /system/status (routes/system.ts) - that one
// reports internal diagnostics (Node version, environment) that have
// no business being public; this reuses only its live "select 1" DB
// check, duplicated locally rather than shared, matching this app's
// own convention for small page-local helpers.
router.get("/status", async (_req, res): Promise<void> => {
  let operational = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    operational = false;
  }

  const incidents = await db.select().from(statusIncidentsTable).orderBy(desc(statusIncidentsTable.createdAt)).limit(20);

  res.json({
    operational,
    checkedAt: new Date().toISOString(),
    incidents: incidents.map(formatIncident),
  });
});

const IncidentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000),
  status: z.enum(INCIDENT_STATUSES).optional(),
});

// Owner-only posting - a real incident, not a subscriber-facing
// action. requireAuth/requireRole applied inline per-route (this
// router is registered ahead of the central requireAuth gate so its
// own public GET above works with no session) rather than a blanket
// router.use(), same reasoning routes/system.ts's own comment already
// gives for this exact pattern.
router.post("/status/incidents", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = IncidentInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [incident] = await db
    .insert(statusIncidentsTable)
    .values({ title: parsed.data.title, message: parsed.data.message, status: parsed.data.status ?? "investigating" })
    .returning();
  res.status(201).json(formatIncident(incident));
});

const IncidentUpdateSchema = IncidentInputSchema.partial();

router.patch("/status/incidents/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = IncidentUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [incident] = await db.update(statusIncidentsTable).set(parsed.data).where(eq(statusIncidentsTable.id, id)).returning();
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }
  res.json(formatIncident(incident));
});

router.delete("/status/incidents/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(statusIncidentsTable).where(eq(statusIncidentsTable.id, id));
  res.sendStatus(204);
});

export default router;
