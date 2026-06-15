import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, risksTable, assessmentsTable } from "@workspace/db";
import {
  CreateRiskBody,
  CreateRiskParams,
  UpdateRiskBody,
  UpdateRiskParams,
  DeleteRiskParams,
  ListRisksResponse,
  UpdateRiskResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score <= 4) return "low";
  if (score <= 9) return "medium";
  if (score <= 16) return "high";
  return "critical";
}

function formatRisk(r: typeof risksTable.$inferSelect) {
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
    riskLevel: getRiskLevel(riskScore),
    mitigation: r.mitigation ?? null,
    owner: r.owner ?? null,
    status: r.status as "open" | "mitigated" | "accepted" | "closed",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/assessments/:assessmentId/risks", async (req, res): Promise<void> => {
  const params = CreateRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const risks = await db
    .select()
    .from(risksTable)
    .where(eq(risksTable.assessmentId, params.data.assessmentId))
    .orderBy(risksTable.createdAt);

  res.json(ListRisksResponse.parse(risks.map(formatRisk)));
});

router.post("/assessments/:assessmentId/risks", async (req, res): Promise<void> => {
  const params = CreateRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, params.data.assessmentId));

  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }

  const { title, description, category, likelihood, impact, mitigation, owner, status } = parsed.data;
  const [risk] = await db
    .insert(risksTable)
    .values({
      assessmentId: params.data.assessmentId,
      title,
      description,
      category: category ?? "other",
      likelihood,
      impact,
      mitigation,
      owner,
      status: status ?? "open",
    })
    .returning();

  res.status(201).json(formatRisk(risk));
});

router.patch("/assessments/:assessmentId/risks/:riskId", async (req, res): Promise<void> => {
  const params = UpdateRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRiskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof risksTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;
  if (parsed.data.likelihood !== undefined) updates.likelihood = parsed.data.likelihood;
  if (parsed.data.impact !== undefined) updates.impact = parsed.data.impact;
  if (parsed.data.mitigation !== undefined) updates.mitigation = parsed.data.mitigation;
  if (parsed.data.owner !== undefined) updates.owner = parsed.data.owner;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const [risk] = await db
    .update(risksTable)
    .set(updates)
    .where(
      and(
        eq(risksTable.id, params.data.riskId),
        eq(risksTable.assessmentId, params.data.assessmentId)
      )
    )
    .returning();

  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }

  res.json(UpdateRiskResponse.parse(formatRisk(risk)));
});

router.delete("/assessments/:assessmentId/risks/:riskId", async (req, res): Promise<void> => {
  const params = DeleteRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(risksTable)
    .where(
      and(
        eq(risksTable.id, params.data.riskId),
        eq(risksTable.assessmentId, params.data.assessmentId)
      )
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
