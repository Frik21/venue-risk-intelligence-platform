import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, travelLogisticsEntriesTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

const ENTRY_TYPES = ["visa_requirement", "embassy_contact", "fixer_contact"] as const;

// Same normalize-then-compare strategy lib/travel-advisory.ts already
// established for the identical "freeform country name never matches
// a canonical list by string equality" problem - venues.country and
// this table's own destinationCountry are both freeform text a
// Manager types in, never picked from a shared list.
function normalizeCountry(name: string): string {
  const stripped = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.startsWith("the ") ? stripped.slice(4) : stripped;
}

function formatEntry(row: typeof travelLogisticsEntriesTable.$inferSelect, createdByName: string | null) {
  return {
    id: row.id,
    destinationCountry: row.destinationCountry,
    entryType: row.entryType as (typeof ENTRY_TYPES)[number],
    title: row.title,
    details: row.details,
    createdBy: row.createdBy,
    createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Company-wide, optionally filtered to one destination country
// (normalized match - see normalizeCountry above) - Operators Note
// uses the filtered form to look up entries for a task's venue
// country, Command Desk's own reference-data page uses the
// unfiltered form to manage everything at once.
router.get("/travel-logistics", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const rows = await db
    .select()
    .from(travelLogisticsEntriesTable)
    .where(eq(travelLogisticsEntriesTable.companyId, companyId))
    .orderBy(asc(travelLogisticsEntriesTable.destinationCountry), asc(travelLogisticsEntriesTable.entryType));

  const destinationCountry = typeof req.query.destinationCountry === "string" ? req.query.destinationCountry : undefined;
  const filtered = destinationCountry != null
    ? rows.filter((r) => normalizeCountry(r.destinationCountry) === normalizeCountry(destinationCountry))
    : rows;
  if (filtered.length === 0) { res.json([]); return; }

  const userIds = [...new Set(filtered.map((r) => r.createdBy))];
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const userMap: Record<number, string> = {};
  for (const u of users) if (userIds.includes(u.id)) userMap[u.id] = u.name;

  res.json(filtered.map((r) => formatEntry(r, userMap[r.createdBy] ?? null)));
});

const EntryInputSchema = z.object({
  destinationCountry: z.string().trim().min(1).max(200),
  entryType: z.enum(ENTRY_TYPES),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().min(1).max(4000),
});

// Manager-authored reference data - createdBy always comes from the
// session, same no-client-trust posture as elsewhere in this app.
router.post("/travel-logistics", async (req, res): Promise<void> => {
  const parsed = EntryInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await resolveCompanyId(req.user!.companyId);
  const [row] = await db
    .insert(travelLogisticsEntriesTable)
    .values({ companyId, createdBy: req.user!.id, ...parsed.data })
    .returning();

  const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.createdBy));
  res.status(201).json(formatEntry(row, creator?.name ?? null));
});

const EntryUpdateSchema = EntryInputSchema.partial();

router.patch("/travel-logistics/:id", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = EntryUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .update(travelLogisticsEntriesTable)
    .set(parsed.data)
    .where(and(eq(travelLogisticsEntriesTable.id, id), eq(travelLogisticsEntriesTable.companyId, companyId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Entry not found" }); return; }

  const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.createdBy));
  res.json(formatEntry(row, creator?.name ?? null));
});

router.delete("/travel-logistics/:id", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(travelLogisticsEntriesTable)
    .where(and(eq(travelLogisticsEntriesTable.id, id), eq(travelLogisticsEntriesTable.companyId, companyId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Entry not found" }); return; }
  res.sendStatus(204);
});

export default router;
