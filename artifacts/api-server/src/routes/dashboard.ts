import { Router, type IRouter } from "express";
import { desc, count, eq } from "drizzle-orm";
import { db, venuesTable, assessmentsTable, incidentsTable, alertsTable, riskMatrixTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [venueCount] = await db.select({ cnt: count() }).from(venuesTable);
  const [assessmentCount] = await db.select({ cnt: count() }).from(assessmentsTable);
  const [incidentCount] = await db.select({ cnt: count() }).from(incidentsTable);

  const allAlerts = await db.select().from(alertsTable).orderBy(desc(alertsTable.createdAt));
  const pendingAlerts = allAlerts.filter((a) => a.status === "pending").length;

  const allAssessments = await db.select().from(assessmentsTable).orderBy(desc(assessmentsTable.updatedAt));
  const matrices = await db.select({ assessmentId: riskMatrixTable.assessmentId, overallRating: riskMatrixTable.overallRating }).from(riskMatrixTable);
  const matrixMap: Record<number, string | null> = {};
  for (const m of matrices) matrixMap[m.assessmentId] = m.overallRating ?? null;

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city }).from(venuesTable);
  const venueMap: Record<number, { name: string; city: string }> = {};
  for (const v of venues) venueMap[v.id] = { name: v.name, city: v.city };

  const statusKeys = ["draft", "under_review", "approved", "monitoring", "review_required", "escalated", "archived"] as const;
  const byStatus: Record<string, number> = Object.fromEntries(statusKeys.map((k) => [k, 0]));
  for (const a of allAssessments) {
    if (a.status in byStatus) byStatus[a.status]++;
  }

  const recentAssessments = allAssessments.slice(0, 5).map((a) => ({
    id: a.id,
    venueId: a.venueId ?? null,
    venueName: a.venueId ? (venueMap[a.venueId]?.name ?? null) : null,
    venueCity: a.venueId ? (venueMap[a.venueId]?.city ?? null) : null,
    title: a.title,
    description: a.description ?? null,
    status: a.status as "draft" | "under_review" | "approved" | "monitoring" | "review_required" | "escalated" | "archived",
    version: a.version,
    overallRating: matrixMap[a.id] ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  const recentAlerts = allAlerts.slice(0, 5).map((a) => ({
    id: a.id,
    venueId: a.venueId,
    venueName: venueMap[a.venueId]?.name ?? null,
    incidentId: a.incidentId ?? null,
    priority: a.priority as "low" | "medium" | "high" | "critical",
    title: a.title,
    summary: a.summary,
    status: a.status as "pending" | "reviewed" | "dismissed" | "escalated",
    reviewedByName: null,
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  res.json({
    totalVenues: Number(venueCount.cnt),
    totalAssessments: Number(assessmentCount.cnt),
    totalIncidents: Number(incidentCount.cnt),
    pendingAlerts,
    assessmentsByStatus: {
      draft: byStatus.draft ?? 0,
      under_review: byStatus.under_review ?? 0,
      approved: byStatus.approved ?? 0,
      monitoring: byStatus.monitoring ?? 0,
      review_required: byStatus.review_required ?? 0,
      escalated: byStatus.escalated ?? 0,
      archived: byStatus.archived ?? 0,
    },
    recentAssessments,
    recentAlerts,
  });
});

export default router;
