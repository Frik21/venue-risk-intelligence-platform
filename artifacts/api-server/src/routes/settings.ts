import { Router, type IRouter } from "express";
import { db, companySettingsTable } from "@workspace/db";
import { z } from "zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function formatSettings(row: typeof companySettingsTable.$inferSelect) {
  return {
    overtimeThresholdHours: row.overtimeThresholdHours,
    overtimeThresholdPeriod: row.overtimeThresholdPeriod as "daily" | "weekly",
    overtimeMultiplier: row.overtimeMultiplier,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Singleton row (id=1), created on first read/write - a Manager edits
// this from the Costs page rather than it being hardcoded, since
// overtime rules are company-specific.
async function getOrCreateSettings() {
  const [existing] = await db.select().from(companySettingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(companySettingsTable).values({}).returning();
  return created;
}

router.get("/settings", async (_req, res): Promise<void> => {
  res.json(formatSettings(await getOrCreateSettings()));
});

const SettingsUpdateSchema = z.object({
  overtimeThresholdHours: z.number().min(0).optional(),
  overtimeThresholdPeriod: z.enum(["daily", "weekly"]).optional(),
  overtimeMultiplier: z.number().min(1).optional(),
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = SettingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const current = await getOrCreateSettings();
  const [updated] = await db
    .update(companySettingsTable)
    .set(parsed.data)
    .where(eq(companySettingsTable.id, current.id))
    .returning();

  res.json(formatSettings(updated));
});

export default router;
