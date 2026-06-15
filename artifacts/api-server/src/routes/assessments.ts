import { Router, type IRouter } from "express";
import { eq, desc, count } from "drizzle-orm";
import {
  db,
  assessmentsTable,
  risksTable,
  venuesTable,
  usersTable,
  riskMatrixTable,
  assessmentVersionsTable,
  auditLogTable,
} from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const AssessmentInputSchema = z.object({
  title: z.string().min(1),
  venueId: z.number().int().optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "under_review", "approved", "monitoring", "review_required", "escalated", "archived"]).optional(),
  intelSummary: z.string().optional(),
  analystNotes: z.string().optional(),
  createdBy: z.number().int().optional(),
});

const AssessmentUpdateSchema = AssessmentInputSchema.partial().extend({
  updatedBy: z.number().int().optional(),
});

function getRiskLevel(score: number): string {
  if (score <= 4) return "low";
  if (score <= 9) return "medium";
  if (score <= 16) return "high";
  return "critical";
}

async function buildAssessmentSummary(
  a: typeof assessmentsTable.$inferSelect,
  venueMap: Record<number, { name: string; city: string }>,
  overallRating?: string | null
) {
  return {
    id: a.id,
    venueId: a.venueId ?? null,
    venueName: a.venueId ? (venueMap[a.venueId]?.name ?? null) : null,
    venueCity: a.venueId ? (venueMap[a.venueId]?.city ?? null) : null,
    title: a.title,
    description: a.description ?? null,
    status: a.status as "draft" | "under_review" | "approved" | "monitoring" | "review_required" | "escalated" | "archived",
    version: a.version,
    overallRating: overallRating ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/assessments/summary", async (_req, res): Promise<void> => {
  const assessments = await db.select().from(assessmentsTable).orderBy(desc(assessmentsTable.updatedAt));
  const risks = await db.select().from(risksTable);
  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city }).from(venuesTable);
  const venueMap: Record<number, { name: string; city: string }> = {};
  for (const v of venues) venueMap[v.id] = { name: v.name, city: v.city };

  const statusKeys = ["draft", "under_review", "approved", "monitoring", "review_required", "escalated", "archived"] as const;
  const byStatus: Record<string, number> = Object.fromEntries(statusKeys.map((k) => [k, 0]));
  for (const a of assessments) {
    if (a.status in byStatus) byStatus[a.status]++;
  }

  const totalRisks = risks.length;
  const highRisks = risks.filter((r) => r.likelihood * r.impact >= 10).length;

  const recent = await Promise.all(
    assessments.slice(0, 5).map((a) => buildAssessmentSummary(a, venueMap))
  );

  res.json({
    total: assessments.length,
    byStatus: { draft: byStatus.draft ?? 0, active: byStatus.under_review ?? 0, completed: byStatus.approved ?? 0, archived: byStatus.archived ?? 0 },
    totalRisks,
    highRisks,
    recentAssessments: recent,
  });
});

router.get("/assessments", async (_req, res): Promise<void> => {
  const assessments = await db.select().from(assessmentsTable).orderBy(desc(assessmentsTable.updatedAt));
  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city }).from(venuesTable);
  const matrices = await db.select({ assessmentId: riskMatrixTable.assessmentId, overallRating: riskMatrixTable.overallRating }).from(riskMatrixTable);

  const venueMap: Record<number, { name: string; city: string }> = {};
  for (const v of venues) venueMap[v.id] = { name: v.name, city: v.city };
  const matrixMap: Record<number, string | null> = {};
  for (const m of matrices) matrixMap[m.assessmentId] = m.overallRating ?? null;

  const result = await Promise.all(
    assessments.map((a) => buildAssessmentSummary(a, venueMap, matrixMap[a.id]))
  );
  res.json(result);
});

router.post("/assessments", async (req, res): Promise<void> => {
  const parsed = AssessmentInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [assessment] = await db
    .insert(assessmentsTable)
    .values({ ...parsed.data, status: parsed.data.status ?? "draft" })
    .returning();

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city }).from(venuesTable);
  const venueMap: Record<number, { name: string; city: string }> = {};
  for (const v of venues) venueMap[v.id] = { name: v.name, city: v.city };

  if (parsed.data.createdBy) {
    await db.insert(auditLogTable).values({
      assessmentId: assessment.id,
      userId: parsed.data.createdBy,
      action: "created",
      fieldChanged: "status",
      newValue: assessment.status,
    });
  }

  res.status(201).json(await buildAssessmentSummary(assessment, venueMap));
});

router.get("/assessments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [assessment] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, id));
  if (!assessment) { res.status(404).json({ error: "Assessment not found" }); return; }

  const risks = await db.select().from(risksTable).where(eq(risksTable.assessmentId, id)).orderBy(risksTable.createdAt);
  const [matrix] = await db.select().from(riskMatrixTable).where(eq(riskMatrixTable.assessmentId, id));

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city }).from(venuesTable);
  const venueMap: Record<number, { name: string; city: string }> = {};
  for (const v of venues) venueMap[v.id] = { name: v.name, city: v.city };

  const formattedRisks = risks.map((r) => {
    const riskScore = r.likelihood * r.impact;
    return {
      id: r.id,
      assessmentId: r.assessmentId,
      title: r.title,
      description: r.description ?? null,
      category: r.category as "operational" | "financial" | "strategic" | "compliance" | "reputational" | "technical" | "other",
      likelihood: r.likelihood,
      impact: r.impact,
      riskScore,
      riskLevel: getRiskLevel(riskScore) as "low" | "medium" | "high" | "critical",
      mitigation: r.mitigation ?? null,
      owner: r.owner ?? null,
      status: r.status as "open" | "mitigated" | "accepted" | "closed",
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  const ratingEnum = ["low", "moderate", "moderate_high", "high", "unknown"] as const;
  type RatingType = typeof ratingEnum[number];
  const safeRating = (v?: string | null): RatingType => ratingEnum.includes(v as RatingType) ? v as RatingType : "unknown";

  const formattedMatrix = matrix ? {
    id: matrix.id,
    assessmentId: matrix.assessmentId,
    areaRisk: safeRating(matrix.areaRisk),
    accessControl: safeRating(matrix.accessControl),
    arrivalDeparture: safeRating(matrix.arrivalDeparture),
    parking: safeRating(matrix.parking),
    personnel: safeRating(matrix.personnel),
    medical: safeRating(matrix.medical),
    hse: safeRating(matrix.hse),
    extraction: safeRating(matrix.extraction),
    overallRating: safeRating(matrix.overallRating),
    notes: matrix.notes ?? null,
    createdAt: matrix.createdAt.toISOString(),
    updatedAt: matrix.updatedAt.toISOString(),
  } : null;

  const summary = await buildAssessmentSummary(assessment, venueMap, matrix?.overallRating ?? null);

  res.json({
    ...summary,
    intelSummary: assessment.intelSummary ?? null,
    analystNotes: assessment.analystNotes ?? null,
    overallRating: matrix?.overallRating ?? null,
    riskMatrix: formattedMatrix,
    risks: formattedRisks,
    approvedAt: assessment.approvedAt?.toISOString() ?? null,
  });
});

router.patch("/assessments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = AssessmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { updatedBy, ...updates } = parsed.data;

  const [before] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, id));
  if (!before) { res.status(404).json({ error: "Assessment not found" }); return; }

  const [assessment] = await db
    .update(assessmentsTable)
    .set({ ...updates, updatedBy: updatedBy ?? null })
    .where(eq(assessmentsTable.id, id))
    .returning();

  if (updatedBy && updates.status && updates.status !== before.status) {
    await db.insert(auditLogTable).values({
      assessmentId: id,
      userId: updatedBy,
      action: "status_changed",
      fieldChanged: "status",
      oldValue: before.status,
      newValue: updates.status,
    });
  }

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city }).from(venuesTable);
  const venueMap: Record<number, { name: string; city: string }> = {};
  for (const v of venues) venueMap[v.id] = { name: v.name, city: v.city };

  const [matrix] = await db.select().from(riskMatrixTable).where(eq(riskMatrixTable.assessmentId, id));
  const risks = await db.select().from(risksTable).where(eq(risksTable.assessmentId, id));

  const formattedRisks = risks.map((r) => {
    const riskScore = r.likelihood * r.impact;
    return {
      id: r.id,
      assessmentId: r.assessmentId,
      title: r.title,
      description: r.description ?? null,
      category: r.category as "operational" | "financial" | "strategic" | "compliance" | "reputational" | "technical" | "other",
      likelihood: r.likelihood,
      impact: r.impact,
      riskScore,
      riskLevel: getRiskLevel(riskScore) as "low" | "medium" | "high" | "critical",
      mitigation: r.mitigation ?? null,
      owner: r.owner ?? null,
      status: r.status as "open" | "mitigated" | "accepted" | "closed",
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  const ratingEnum = ["low", "moderate", "moderate_high", "high", "unknown"] as const;
  type RatingType = typeof ratingEnum[number];
  const safeRating = (v?: string | null): RatingType => ratingEnum.includes(v as RatingType) ? v as RatingType : "unknown";

  const formattedMatrix = matrix ? {
    id: matrix.id,
    assessmentId: matrix.assessmentId,
    areaRisk: safeRating(matrix.areaRisk),
    accessControl: safeRating(matrix.accessControl),
    arrivalDeparture: safeRating(matrix.arrivalDeparture),
    parking: safeRating(matrix.parking),
    personnel: safeRating(matrix.personnel),
    medical: safeRating(matrix.medical),
    hse: safeRating(matrix.hse),
    extraction: safeRating(matrix.extraction),
    overallRating: safeRating(matrix.overallRating),
    notes: matrix.notes ?? null,
    createdAt: matrix.createdAt.toISOString(),
    updatedAt: matrix.updatedAt.toISOString(),
  } : null;

  const summary = await buildAssessmentSummary(assessment, venueMap, matrix?.overallRating ?? null);

  res.json({
    ...summary,
    intelSummary: assessment.intelSummary ?? null,
    analystNotes: assessment.analystNotes ?? null,
    overallRating: matrix?.overallRating ?? null,
    riskMatrix: formattedMatrix,
    risks: formattedRisks,
    approvedAt: assessment.approvedAt?.toISOString() ?? null,
  });
});

router.delete("/assessments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(assessmentsTable).where(eq(assessmentsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Assessment not found" }); return; }
  res.sendStatus(204);
});

router.post("/assessments/:id/approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const Schema = z.object({ userId: z.number().int(), changeSummary: z.string() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [assessment] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, id));
  if (!assessment) { res.status(404).json({ error: "Assessment not found" }); return; }

  const risks = await db.select().from(risksTable).where(eq(risksTable.assessmentId, id));
  const [matrix] = await db.select().from(riskMatrixTable).where(eq(riskMatrixTable.assessmentId, id));
  const snapshot = { assessment, risks, matrix: matrix ?? null };

  await db.insert(assessmentVersionsTable).values({
    assessmentId: id,
    version: assessment.version,
    snapshot,
    changeSummary: parsed.data.changeSummary,
    createdBy: parsed.data.userId,
  });

  const [updated] = await db
    .update(assessmentsTable)
    .set({
      status: "approved",
      version: assessment.version + 1,
      approvedBy: parsed.data.userId,
      approvedAt: new Date(),
      updatedBy: parsed.data.userId,
    })
    .where(eq(assessmentsTable.id, id))
    .returning();

  await db.insert(auditLogTable).values({
    assessmentId: id,
    userId: parsed.data.userId,
    action: "approved",
    fieldChanged: "status",
    oldValue: assessment.status,
    newValue: "approved",
    reason: parsed.data.changeSummary,
  });

  const venues = await db.select({ id: venuesTable.id, name: venuesTable.name, city: venuesTable.city }).from(venuesTable);
  const venueMap: Record<number, { name: string; city: string }> = {};
  for (const v of venues) venueMap[v.id] = { name: v.name, city: v.city };

  const formattedRisks = risks.map((r) => {
    const riskScore = r.likelihood * r.impact;
    return {
      id: r.id,
      assessmentId: r.assessmentId,
      title: r.title,
      description: r.description ?? null,
      category: r.category as "operational" | "financial" | "strategic" | "compliance" | "reputational" | "technical" | "other",
      likelihood: r.likelihood,
      impact: r.impact,
      riskScore,
      riskLevel: getRiskLevel(riskScore) as "low" | "medium" | "high" | "critical",
      mitigation: r.mitigation ?? null,
      owner: r.owner ?? null,
      status: r.status as "open" | "mitigated" | "accepted" | "closed",
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  const summary = await buildAssessmentSummary(updated, venueMap, matrix?.overallRating ?? null);

  res.json({
    ...summary,
    intelSummary: updated.intelSummary ?? null,
    analystNotes: updated.analystNotes ?? null,
    overallRating: matrix?.overallRating ?? null,
    riskMatrix: matrix ? {
      id: matrix.id,
      assessmentId: matrix.assessmentId,
      areaRisk: matrix.areaRisk ?? "unknown",
      accessControl: matrix.accessControl ?? "unknown",
      arrivalDeparture: matrix.arrivalDeparture ?? "unknown",
      parking: matrix.parking ?? "unknown",
      personnel: matrix.personnel ?? "unknown",
      medical: matrix.medical ?? "unknown",
      hse: matrix.hse ?? "unknown",
      extraction: matrix.extraction ?? "unknown",
      overallRating: matrix.overallRating ?? "unknown",
      notes: matrix.notes ?? null,
      createdAt: matrix.createdAt.toISOString(),
      updatedAt: matrix.updatedAt.toISOString(),
    } : null,
    risks: formattedRisks,
    approvedAt: updated.approvedAt?.toISOString() ?? null,
  });
});

router.get("/assessments/:id/versions", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const versions = await db
    .select()
    .from(assessmentVersionsTable)
    .where(eq(assessmentVersionsTable.assessmentId, id))
    .orderBy(desc(assessmentVersionsTable.version));

  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(
    versions.map((v) => ({
      id: v.id,
      assessmentId: v.assessmentId,
      version: v.version,
      changeSummary: v.changeSummary ?? null,
      createdByName: v.createdBy ? (userMap[v.createdBy] ?? null) : null,
      createdAt: v.createdAt.toISOString(),
    }))
  );
});

router.get("/assessments/:id/audit-log", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const logs = await db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.assessmentId, id))
    .orderBy(desc(auditLogTable.createdAt));

  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(
    logs.map((l) => ({
      id: l.id,
      assessmentId: l.assessmentId ?? null,
      userId: l.userId ?? null,
      userName: l.userId ? (userMap[l.userId] ?? null) : null,
      action: l.action,
      fieldChanged: l.fieldChanged ?? null,
      oldValue: l.oldValue ?? null,
      newValue: l.newValue ?? null,
      reason: l.reason ?? null,
      createdAt: l.createdAt.toISOString(),
    }))
  );
});

export default router;
