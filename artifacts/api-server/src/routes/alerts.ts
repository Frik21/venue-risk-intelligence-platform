import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, alertsTable, venuesTable, usersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

async function formatAlert(row: typeof alertsTable.$inferSelect, venueName?: string | null, reviewedByName?: string | null) {
  return {
    id: row.id,
    venueId: row.venueId,
    venueName: venueName ?? null,
    incidentId: row.incidentId ?? null,
    priority: row.priority as "low" | "medium" | "high" | "critical",
    title: row.title,
    summary: row.summary,
    status: row.status as "pending" | "reviewed" | "dismissed" | "escalated",
    reviewedByName: reviewedByName ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/alerts", async (_req, res): Promise<void> => {
  const alerts = await db.select().from(alertsTable).orderBy(desc(alertsTable.createdAt));
  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name }).from(venuesTable);
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

  const venueMap: Record<number, string> = {};
  for (const v of venues) venueMap[v.id] = v.name;
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  const result = await Promise.all(
    alerts.map((a) => formatAlert(a, venueMap[a.venueId], a.reviewedBy ? userMap[a.reviewedBy] : null))
  );
  res.json(result);
});

router.patch("/alerts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const UpdateSchema = z.object({
    status: z.enum(["pending", "reviewed", "dismissed", "escalated"]),
    reviewedBy: z.number().int().optional(),
  });
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.reviewedBy) {
    updates.reviewedBy = parsed.data.reviewedBy;
    updates.reviewedAt = new Date();
  }

  const [alert] = await db
    .update(alertsTable)
    .set(updates)
    .where(eq(alertsTable.id, id))
    .returning();

  if (!alert) { res.status(404).json({ error: "Alert not found" }); return; }

  const [venue] = await db.select({ name: venuesTable.name }).from(venuesTable).where(eq(venuesTable.id, alert.venueId));
  let reviewedByName: string | null = null;
  if (alert.reviewedBy) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, alert.reviewedBy));
    reviewedByName = u?.name ?? null;
  }

  res.json(await formatAlert(alert, venue?.name ?? null, reviewedByName));
});

export default router;
