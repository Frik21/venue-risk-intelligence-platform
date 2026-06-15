import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, riskMatrixTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const ratingEnum = ["low", "moderate", "moderate_high", "high", "unknown"] as const;
const RatingSchema = z.enum(ratingEnum).optional();

const RiskMatrixInputSchema = z.object({
  areaRisk: RatingSchema,
  accessControl: RatingSchema,
  arrivalDeparture: RatingSchema,
  parking: RatingSchema,
  personnel: RatingSchema,
  medical: RatingSchema,
  hse: RatingSchema,
  extraction: RatingSchema,
  overallRating: RatingSchema,
  notes: z.string().optional(),
});

function formatMatrix(row: typeof riskMatrixTable.$inferSelect) {
  type RatingType = typeof ratingEnum[number];
  const safeRating = (v?: string | null): RatingType => ratingEnum.includes(v as RatingType) ? v as RatingType : "unknown";
  return {
    id: row.id,
    assessmentId: row.assessmentId,
    areaRisk: safeRating(row.areaRisk),
    accessControl: safeRating(row.accessControl),
    arrivalDeparture: safeRating(row.arrivalDeparture),
    parking: safeRating(row.parking),
    personnel: safeRating(row.personnel),
    medical: safeRating(row.medical),
    hse: safeRating(row.hse),
    extraction: safeRating(row.extraction),
    overallRating: safeRating(row.overallRating),
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/assessments/:id/risk-matrix", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [matrix] = await db.select().from(riskMatrixTable).where(eq(riskMatrixTable.assessmentId, id));
  if (!matrix) { res.status(404).json({ error: "Risk matrix not found" }); return; }
  res.json(formatMatrix(matrix));
});

router.put("/assessments/:id/risk-matrix", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = RiskMatrixInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(riskMatrixTable).where(eq(riskMatrixTable.assessmentId, id));

  let matrix: typeof riskMatrixTable.$inferSelect;
  if (existing) {
    [matrix] = await db
      .update(riskMatrixTable)
      .set(parsed.data)
      .where(eq(riskMatrixTable.assessmentId, id))
      .returning();
  } else {
    [matrix] = await db
      .insert(riskMatrixTable)
      .values({ assessmentId: id, ...parsed.data })
      .returning();
  }

  res.json(formatMatrix(matrix));
});

export default router;
