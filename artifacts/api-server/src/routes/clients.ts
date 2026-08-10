import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function formatClient(row: typeof clientsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    dayRate: row.dayRate,
    nightRate: row.nightRate,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/clients", async (_req, res): Promise<void> => {
  const rows = await db.select().from(clientsTable).orderBy(asc(clientsTable.name));
  res.json(rows.map(formatClient));
});

const ClientInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact: z.string().max(200).optional(),
  dayRate: z.number().min(0).nullable().optional(),
  nightRate: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = ClientInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [client] = await db
    .insert(clientsTable)
    .values({
      name: parsed.data.name,
      contact: parsed.data.contact ?? "",
      dayRate: parsed.data.dayRate ?? null,
      nightRate: parsed.data.nightRate ?? null,
      notes: parsed.data.notes ?? "",
    })
    .returning();

  res.status(201).json(formatClient(client));
});

const ClientUpdateSchema = ClientInputSchema.partial();

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ClientUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [client] = await db.update(clientsTable).set(parsed.data).where(eq(clientsTable.id, id)).returning();
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }

  res.json(formatClient(client));
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(clientsTable).where(eq(clientsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Client not found" }); return; }
  res.sendStatus(204);
});

export default router;
