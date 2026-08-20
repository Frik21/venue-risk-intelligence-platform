import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, officesTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { resolveCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatOffice(row: typeof officesTable.$inferSelect, managerName?: string | null) {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    address: row.address,
    city: row.city,
    country: row.country,
    managerId: row.managerId,
    managerName: managerName ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/offices", async (_req, res): Promise<void> => {
  const rows = await db.select().from(officesTable).orderBy(asc(officesTable.name));
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatOffice(r, r.managerId ? (userMap[r.managerId] ?? null) : null)));
});

const OfficeInputSchema = z.object({
  companyId: z.number().int().optional(),
  name: z.string().trim().min(1).max(200),
  address: z.string().max(500).optional(),
  city: z.string().trim().min(1).max(100),
  country: z.string().trim().min(1).max(100),
  managerId: z.number().int().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

router.post("/offices", async (req, res): Promise<void> => {
  const parsed = OfficeInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await resolveCompanyId(parsed.data.companyId);
  const [office] = await db
    .insert(officesTable)
    .values({
      companyId,
      name: parsed.data.name,
      address: parsed.data.address ?? "",
      city: parsed.data.city,
      country: parsed.data.country,
      managerId: parsed.data.managerId ?? null,
      notes: parsed.data.notes ?? "",
    })
    .returning();

  let managerName: string | null = null;
  if (office.managerId) {
    const [m] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, office.managerId));
    managerName = m?.name ?? null;
  }
  res.status(201).json(formatOffice(office, managerName));
});

const OfficeUpdateSchema = OfficeInputSchema.partial();

router.patch("/offices/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = OfficeUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [office] = await db.update(officesTable).set(parsed.data).where(eq(officesTable.id, id)).returning();
  if (!office) { res.status(404).json({ error: "Office not found" }); return; }

  let managerName: string | null = null;
  if (office.managerId) {
    const [m] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, office.managerId));
    managerName = m?.name ?? null;
  }
  res.json(formatOffice(office, managerName));
});

router.delete("/offices/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(officesTable).where(eq(officesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Office not found" }); return; }
  res.sendStatus(204);
});

export default router;
