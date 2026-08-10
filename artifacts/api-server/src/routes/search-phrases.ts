import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, venueSearchPhrasesTable, venuesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function formatPhrase(row: typeof venueSearchPhrasesTable.$inferSelect) {
  return {
    id: row.id,
    venueId: row.venueId,
    phrase: row.phrase,
    createdAt: row.createdAt.toISOString(),
  };
}

// All phrases across every venue - used by the Alert Queue to figure
// out which venues are actually being monitored, so it can show only
// alerts connected to a venue with at least one search phrase set up.
router.get("/search-phrases", async (_req, res): Promise<void> => {
  const phrases = await db.select().from(venueSearchPhrasesTable).orderBy(venueSearchPhrasesTable.createdAt);
  res.json(phrases.map(formatPhrase));
});

router.get("/venues/:id/search-phrases", async (req, res): Promise<void> => {
  const venueId = Number(req.params.id);
  if (isNaN(venueId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const phrases = await db
    .select()
    .from(venueSearchPhrasesTable)
    .where(eq(venueSearchPhrasesTable.venueId, venueId))
    .orderBy(venueSearchPhrasesTable.createdAt);

  res.json(phrases.map(formatPhrase));
});

const PhraseInputSchema = z.object({
  phrase: z.string().trim().min(2).max(100),
});

router.post("/venues/:id/search-phrases", async (req, res): Promise<void> => {
  const venueId = Number(req.params.id);
  if (isNaN(venueId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = PhraseInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [venue] = await db.select({ id: venuesTable.id }).from(venuesTable).where(eq(venuesTable.id, venueId));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  const [phrase] = await db
    .insert(venueSearchPhrasesTable)
    .values({ venueId, phrase: parsed.data.phrase })
    .returning();

  res.status(201).json(formatPhrase(phrase));
});

router.delete("/search-phrases/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(venueSearchPhrasesTable).where(eq(venueSearchPhrasesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Search phrase not found" }); return; }
  res.sendStatus(204);
});

export default router;
