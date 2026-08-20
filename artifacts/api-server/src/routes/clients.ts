import { Router, type IRouter } from "express";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { db, clientsTable, clientActivitiesTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

const CLIENT_STATUSES = ["lead", "active", "inactive", "vip"] as const;

function formatClient(row: typeof clientsTable.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    status: row.status as (typeof CLIENT_STATUSES)[number],
    industry: row.industry,
    primaryContactName: row.primaryContactName,
    primaryContactRole: row.primaryContactRole,
    email: row.email,
    phone: row.phone,
    address: row.address,
    dayRate: row.dayRate,
    nightRate: row.nightRate,
    officeId: row.officeId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatActivity(row: typeof clientActivitiesTable.$inferSelect, createdByName: string | null) {
  return {
    id: row.id,
    clientId: row.clientId,
    note: row.note,
    createdBy: row.createdBy,
    createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/clients", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  const rows = await db.select().from(clientsTable).where(eq(clientsTable.companyId, companyId)).orderBy(asc(clientsTable.name));
  res.json(rows.map(formatClient));
});

const ClientInputSchema = z.object({
  companyId: z.number().int().optional(),
  name: z.string().trim().min(1).max(200),
  status: z.enum(CLIENT_STATUSES).optional(),
  industry: z.string().max(200).optional(),
  primaryContactName: z.string().max(200).optional(),
  primaryContactRole: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  dayRate: z.number().min(0).nullable().optional(),
  nightRate: z.number().min(0).nullable().optional(),
  officeId: z.number().int().nullable().optional(),
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = ClientInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await resolveCompanyId(req.user!.companyId);
  const [client] = await db
    .insert(clientsTable)
    .values({
      companyId,
      name: parsed.data.name,
      status: parsed.data.status ?? "active",
      industry: parsed.data.industry ?? "",
      primaryContactName: parsed.data.primaryContactName ?? "",
      primaryContactRole: parsed.data.primaryContactRole ?? "",
      email: parsed.data.email ?? "",
      phone: parsed.data.phone ?? "",
      address: parsed.data.address ?? "",
      dayRate: parsed.data.dayRate ?? null,
      nightRate: parsed.data.nightRate ?? null,
      officeId: parsed.data.officeId ?? null,
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

router.get("/clients/:id/activities", async (req, res): Promise<void> => {
  const clientId = Number(req.params.id);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(clientActivitiesTable)
    .where(eq(clientActivitiesTable.clientId, clientId))
    .orderBy(desc(clientActivitiesTable.createdAt));

  const userIds = [...new Set(rows.map((r) => r.createdBy).filter((id): id is number => id != null))];
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatActivity(r, r.createdBy != null ? (userMap[r.createdBy] ?? null) : null)));
});

const ActivityInputSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  createdBy: z.number().int().nullable().optional(),
});

router.post("/clients/:id/activities", async (req, res): Promise<void> => {
  const clientId = Number(req.params.id);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [client] = await db.select({ id: clientsTable.id, companyId: clientsTable.companyId }).from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }

  const parsed = ActivityInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [activity] = await db
    .insert(clientActivitiesTable)
    .values({ companyId: client.companyId, clientId, note: parsed.data.note, createdBy: parsed.data.createdBy ?? null })
    .returning();

  let createdByName: string | null = null;
  if (activity.createdBy != null) {
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, activity.createdBy));
    createdByName = user?.name ?? null;
  }

  res.status(201).json(formatActivity(activity, createdByName));
});

router.delete("/clients/:id/activities/:activityId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.id);
  const activityId = Number(req.params.activityId);
  if (isNaN(clientId) || isNaN(activityId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(clientActivitiesTable)
    .where(eq(clientActivitiesTable.id, activityId))
    .returning();
  if (!deleted || deleted.clientId !== clientId) { res.status(404).json({ error: "Activity not found" }); return; }
  res.sendStatus(204);
});

export default router;
