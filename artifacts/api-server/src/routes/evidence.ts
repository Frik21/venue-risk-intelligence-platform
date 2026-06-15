import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, evidenceTable, usersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const EvidenceInputSchema = z.object({
  evidenceType: z.enum(["osint_source", "analyst_note", "image", "video", "pdf", "website", "news_article", "police_advisory", "government_bulletin", "map_screenshot"]),
  label: z.string().min(1),
  content: z.string().optional(),
  url: z.string().optional(),
  filename: z.string().optional(),
  section: z.string().optional(),
  analystNote: z.string().optional(),
  uploadedBy: z.number().int().optional(),
});

async function formatEvidence(row: typeof evidenceTable.$inferSelect, uploadedByName?: string | null) {
  return {
    id: row.id,
    assessmentId: row.assessmentId,
    evidenceType: row.evidenceType,
    label: row.label,
    content: row.content ?? null,
    url: row.url ?? null,
    filename: row.filename ?? null,
    section: row.section ?? null,
    analystNote: row.analystNote ?? null,
    verified: row.verified,
    uploadedByName: uploadedByName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/assessments/:id/evidence", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(evidenceTable)
    .where(eq(evidenceTable.assessmentId, id))
    .orderBy(desc(evidenceTable.createdAt));

  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  const result = await Promise.all(rows.map((r) => formatEvidence(r, r.uploadedBy ? userMap[r.uploadedBy] : null)));
  res.json(result);
});

router.post("/assessments/:id/evidence", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = EvidenceInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .insert(evidenceTable)
    .values({ ...parsed.data, assessmentId: id })
    .returning();

  let uploadedByName: string | null = null;
  if (row.uploadedBy) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.uploadedBy));
    uploadedByName = u?.name ?? null;
  }

  res.status(201).json(await formatEvidence(row, uploadedByName));
});

router.patch("/evidence/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const UpdateSchema = z.object({
    label: z.string().optional(),
    content: z.string().optional(),
    url: z.string().optional(),
    section: z.string().optional(),
    analystNote: z.string().optional(),
    verified: z.boolean().optional(),
  });
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .update(evidenceTable)
    .set(parsed.data)
    .where(eq(evidenceTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Evidence not found" }); return; }
  res.json(await formatEvidence(row, null));
});

router.delete("/evidence/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(evidenceTable).where(eq(evidenceTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Evidence not found" }); return; }
  res.sendStatus(204);
});

export default router;
