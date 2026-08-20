import { Router, type IRouter } from "express";
import { db, companySettingsTable } from "@workspace/db";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { resolveCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatSettings(row: typeof companySettingsTable.$inferSelect) {
  return {
    overtimeThresholdHours: row.overtimeThresholdHours,
    overtimeThresholdPeriod: row.overtimeThresholdPeriod as "daily" | "weekly",
    overtimeMultiplier: row.overtimeMultiplier,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// One row per company (was a singleton, id=1, before multi-company
// tenancy) - a Manager edits this from the Costs page rather than it
// being hardcoded, since overtime rules are company-specific.
async function getOrCreateSettings(companyId: number) {
  const [existing] = await db.select().from(companySettingsTable).where(eq(companySettingsTable.companyId, companyId));
  if (existing) return existing;
  const [created] = await db.insert(companySettingsTable).values({ companyId }).returning();
  return created;
}

router.get("/settings", async (req, res): Promise<void> => {
  const companyId = await resolveCompanyId(req.user!.companyId);
  res.json(formatSettings(await getOrCreateSettings(companyId)));
});

const SettingsUpdateSchema = z.object({
  overtimeThresholdHours: z.number().min(0).optional(),
  overtimeThresholdPeriod: z.enum(["daily", "weekly"]).optional(),
  overtimeMultiplier: z.number().min(1).optional(),
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = SettingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await resolveCompanyId(req.user!.companyId);
  const current = await getOrCreateSettings(companyId);
  const [updated] = await db
    .update(companySettingsTable)
    .set(parsed.data)
    .where(eq(companySettingsTable.id, current.id))
    .returning();

  res.json(formatSettings(updated));
});

export default router;
