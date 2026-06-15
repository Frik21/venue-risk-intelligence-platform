import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, assessmentsTable, risksTable } from "@workspace/db";
import {
  CreateAssessmentBody,
  UpdateAssessmentBody,
  UpdateAssessmentParams,
  GetAssessmentParams,
  DeleteAssessmentParams,
  ListAssessmentsResponse,
  GetAssessmentResponse,
  UpdateAssessmentResponse,
  GetAssessmentsSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getRiskLevel(score: number): string {
  if (score <= 4) return "low";
  if (score <= 9) return "medium";
  if (score <= 16) return "high";
  return "critical";
}

function formatAssessment(row: typeof assessmentsTable.$inferSelect, riskCount: number, highRiskCount: number) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    project: row.project ?? null,
    status: row.status as "draft" | "active" | "completed" | "archived",
    riskCount,
    highRiskCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/assessments/summary", async (req, res): Promise<void> => {
  const assessments = await db.select().from(assessmentsTable).orderBy(desc(assessmentsTable.updatedAt));
  const risks = await db.select().from(risksTable);

  const byStatus = { draft: 0, active: 0, completed: 0, archived: 0 };
  for (const a of assessments) {
    const s = a.status as keyof typeof byStatus;
    if (s in byStatus) byStatus[s]++;
  }

  const totalRisks = risks.length;
  const highRisks = risks.filter((r) => {
    const score = r.likelihood * r.impact;
    return score >= 10;
  }).length;

  const risksByAssessment = risks.reduce<Record<number, { total: number; high: number }>>((acc, r) => {
    if (!acc[r.assessmentId]) acc[r.assessmentId] = { total: 0, high: 0 };
    acc[r.assessmentId].total++;
    if (r.likelihood * r.impact >= 10) acc[r.assessmentId].high++;
    return acc;
  }, {});

  const recentAssessments = assessments.slice(0, 5).map((a) => {
    const counts = risksByAssessment[a.id] ?? { total: 0, high: 0 };
    return formatAssessment(a, counts.total, counts.high);
  });

  const summary = GetAssessmentsSummaryResponse.parse({
    total: assessments.length,
    byStatus,
    totalRisks,
    highRisks,
    recentAssessments,
  });
  res.json(summary);
});

router.get("/assessments", async (_req, res): Promise<void> => {
  const assessments = await db.select().from(assessmentsTable).orderBy(desc(assessmentsTable.updatedAt));
  const risks = await db.select().from(risksTable);

  const risksByAssessment = risks.reduce<Record<number, { total: number; high: number }>>((acc, r) => {
    if (!acc[r.assessmentId]) acc[r.assessmentId] = { total: 0, high: 0 };
    acc[r.assessmentId].total++;
    if (r.likelihood * r.impact >= 10) acc[r.assessmentId].high++;
    return acc;
  }, {});

  const result = assessments.map((a) => {
    const counts = risksByAssessment[a.id] ?? { total: 0, high: 0 };
    return formatAssessment(a, counts.total, counts.high);
  });

  res.json(ListAssessmentsResponse.parse(result));
});

router.post("/assessments", async (req, res): Promise<void> => {
  const parsed = CreateAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, project, status } = parsed.data;
  const [assessment] = await db
    .insert(assessmentsTable)
    .values({ title, description, project, status: status ?? "draft" })
    .returning();

  res.status(201).json(formatAssessment(assessment, 0, 0));
});

router.get("/assessments/:id", async (req, res): Promise<void> => {
  const params = GetAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, params.data.id));

  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }

  const risks = await db
    .select()
    .from(risksTable)
    .where(eq(risksTable.assessmentId, params.data.id))
    .orderBy(risksTable.createdAt);

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

  const result = GetAssessmentResponse.parse({
    id: assessment.id,
    title: assessment.title,
    description: assessment.description ?? null,
    project: assessment.project ?? null,
    status: assessment.status,
    risks: formattedRisks,
    createdAt: assessment.createdAt.toISOString(),
    updatedAt: assessment.updatedAt.toISOString(),
  });

  res.json(result);
});

router.patch("/assessments/:id", async (req, res): Promise<void> => {
  const params = UpdateAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof assessmentsTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.project !== undefined) updates.project = parsed.data.project;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const [assessment] = await db
    .update(assessmentsTable)
    .set(updates)
    .where(eq(assessmentsTable.id, params.data.id))
    .returning();

  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }

  const riskRows = await db
    .select({ count: sql<number>`count(*)`, highCount: sql<number>`sum(case when likelihood * impact >= 10 then 1 else 0 end)` })
    .from(risksTable)
    .where(eq(risksTable.assessmentId, params.data.id));

  const counts = riskRows[0] ?? { count: 0, highCount: 0 };

  res.json(UpdateAssessmentResponse.parse(formatAssessment(assessment, Number(counts.count), Number(counts.highCount ?? 0))));
});

router.delete("/assessments/:id", async (req, res): Promise<void> => {
  const params = DeleteAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(assessmentsTable)
    .where(eq(assessmentsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
