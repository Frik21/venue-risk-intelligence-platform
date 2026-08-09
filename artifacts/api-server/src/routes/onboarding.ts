import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, operatorOnboardingTable, operatorDocumentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { ONBOARDING_CHECKLIST_ITEMS, DOCUMENT_TYPES } from "../lib/onboarding-checklist";

const router: IRouter = Router();
const DOCUMENT_TYPE_VALUES = DOCUMENT_TYPES.map((t) => t.value) as [string, ...string[]];

function formatOnboarding(row: typeof operatorOnboardingTable.$inferSelect, userName?: string | null) {
  const stored = (row.checklist as Record<string, boolean>) ?? {};
  const checklist = ONBOARDING_CHECKLIST_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    checked: stored[item.key] === true,
  }));
  return {
    id: row.id,
    userId: row.userId,
    userName: userName ?? null,
    checklist,
    checkedCount: checklist.filter((c) => c.checked).length,
    totalCount: checklist.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatDocument(row: typeof operatorDocumentsTable.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    documentType: row.documentType as (typeof DOCUMENT_TYPES)[number]["value"],
    label: row.label,
    filename: row.filename ?? null,
    fileDataUrl: row.fileDataUrl ?? null,
    expiryDate: row.expiryDate ?? null,
    verified: row.verified,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Every CPO's onboarding progress, most recently updated first -
// powers the Operator Onboarding overview page.
router.get("/onboarding", async (_req, res): Promise<void> => {
  const cpos = await db.select().from(usersTable).where(eq(usersTable.role, "cpo"));
  const records = await db.select().from(operatorOnboardingTable);
  const recordMap: Record<number, typeof operatorOnboardingTable.$inferSelect> = {};
  for (const r of records) recordMap[r.userId] = r;

  const documents = await db.select({ userId: operatorDocumentsTable.userId }).from(operatorDocumentsTable);
  const docCountMap: Record<number, number> = {};
  for (const d of documents) docCountMap[d.userId] = (docCountMap[d.userId] ?? 0) + 1;

  res.json(
    cpos.map((cpo) => ({
      ...formatOnboarding(
        recordMap[cpo.id] ?? { id: -1, userId: cpo.id, checklist: {}, createdAt: new Date(), updatedAt: new Date() },
        cpo.name,
      ),
      documentCount: docCountMap[cpo.id] ?? 0,
    })),
  );
});

// A CPO's onboarding record exists implicitly the moment they do -
// lazily created on first fetch, same pattern as GET /tasks/:taskId/plan.
router.get("/users/:userId/onboarding", async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let [record] = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.userId, userId));
  if (!record) {
    [record] = await db.insert(operatorOnboardingTable).values({ userId, checklist: {} }).returning();
  }

  res.json(formatOnboarding(record, user.name));
});

const ChecklistUpdateSchema = z.object({
  key: z.string(),
  checked: z.boolean(),
});

router.patch("/onboarding/:id/checklist", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ChecklistUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (!ONBOARDING_CHECKLIST_ITEMS.some((item) => item.key === parsed.data.key)) {
    res.status(400).json({ error: `Unknown checklist item "${parsed.data.key}"` });
    return;
  }

  const [existing] = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!existing) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  const nextChecklist = { ...(existing.checklist as Record<string, boolean>), [parsed.data.key]: parsed.data.checked };

  const [updated] = await db
    .update(operatorOnboardingTable)
    .set({ checklist: nextChecklist })
    .where(eq(operatorOnboardingTable.id, id))
    .returning();

  res.json(formatOnboarding(updated));
});

router.get("/users/:userId/onboarding-documents", async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(operatorDocumentsTable)
    .where(eq(operatorDocumentsTable.userId, userId))
    .orderBy(desc(operatorDocumentsTable.createdAt));

  res.json(rows.map(formatDocument));
});

const DocumentInputSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPE_VALUES),
  label: z.string().max(200).optional(),
  filename: z.string().max(500).optional(),
  fileDataUrl: z.string().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate must be YYYY-MM-DD").optional(),
});

router.post("/users/:userId/onboarding-documents", async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = DocumentInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const typeLabel = DOCUMENT_TYPES.find((t) => t.value === parsed.data.documentType)?.label ?? "Document";
  const [doc] = await db
    .insert(operatorDocumentsTable)
    .values({
      userId,
      documentType: parsed.data.documentType,
      label: parsed.data.label || typeLabel,
      filename: parsed.data.filename,
      fileDataUrl: parsed.data.fileDataUrl,
      expiryDate: parsed.data.expiryDate,
    })
    .returning();

  res.status(201).json(formatDocument(doc));
});

const DocumentUpdateSchema = DocumentInputSchema.partial().extend({
  verified: z.boolean().optional(),
});

router.patch("/onboarding-documents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = DocumentUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [doc] = await db.update(operatorDocumentsTable).set(parsed.data).where(eq(operatorDocumentsTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  res.json(formatDocument(doc));
});

router.delete("/onboarding-documents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(operatorDocumentsTable).where(eq(operatorDocumentsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Document not found" }); return; }

  res.sendStatus(204);
});

export default router;
