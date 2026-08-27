import { Router, type IRouter } from "express";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { db, vendorsTable, vendorActivitiesTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

const VENDOR_STATUSES = ["lead", "active", "inactive", "preferred"] as const;

function formatVendor(row: typeof vendorsTable.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    status: row.status as (typeof VENDOR_STATUSES)[number],
    category: row.category,
    primaryContactName: row.primaryContactName,
    primaryContactRole: row.primaryContactRole,
    email: row.email,
    phone: row.phone,
    address: row.address,
    officeId: row.officeId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatActivity(row: typeof vendorActivitiesTable.$inferSelect, createdByName: string | null) {
  return {
    id: row.id,
    vendorId: row.vendorId,
    note: row.note,
    createdBy: row.createdBy,
    createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/vendors", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  const rows = await db.select().from(vendorsTable).where(eq(vendorsTable.companyId, companyId)).orderBy(asc(vendorsTable.name));
  res.json(rows.map(formatVendor));
});

const VendorInputSchema = z.object({
  companyId: z.number().int().optional(),
  name: z.string().trim().min(1).max(200),
  status: z.enum(VENDOR_STATUSES).optional(),
  category: z.string().max(200).optional(),
  primaryContactName: z.string().max(200).optional(),
  primaryContactRole: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  officeId: z.number().int().nullable().optional(),
});

router.post("/vendors", async (req, res): Promise<void> => {
  const parsed = VendorInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const companyId = await resolveCompanyId(req.user!.companyId);
  const [vendor] = await db
    .insert(vendorsTable)
    .values({
      companyId,
      name: parsed.data.name,
      status: parsed.data.status ?? "active",
      category: parsed.data.category ?? "",
      primaryContactName: parsed.data.primaryContactName ?? "",
      primaryContactRole: parsed.data.primaryContactRole ?? "",
      email: parsed.data.email ?? "",
      phone: parsed.data.phone ?? "",
      address: parsed.data.address ?? "",
      officeId: parsed.data.officeId ?? null,
    })
    .returning();

  res.status(201).json(formatVendor(vendor));
});

const VendorUpdateSchema = VendorInputSchema.partial();

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = VendorUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [vendor] = await db.update(vendorsTable).set(parsed.data).where(eq(vendorsTable.id, id)).returning();
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  res.json(formatVendor(vendor));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(vendorsTable).where(eq(vendorsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.sendStatus(204);
});

router.get("/vendors/:id/activities", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(vendorActivitiesTable)
    .where(eq(vendorActivitiesTable.vendorId, vendorId))
    .orderBy(desc(vendorActivitiesTable.createdAt));

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

router.post("/vendors/:id/activities", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [vendor] = await db.select({ id: vendorsTable.id, companyId: vendorsTable.companyId }).from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const parsed = ActivityInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [activity] = await db
    .insert(vendorActivitiesTable)
    .values({ companyId: vendor.companyId, vendorId, note: parsed.data.note, createdBy: parsed.data.createdBy ?? null })
    .returning();

  let createdByName: string | null = null;
  if (activity.createdBy != null) {
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, activity.createdBy));
    createdByName = user?.name ?? null;
  }

  res.status(201).json(formatActivity(activity, createdByName));
});

router.delete("/vendors/:id/activities/:activityId", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  const activityId = Number(req.params.activityId);
  if (isNaN(vendorId) || isNaN(activityId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(vendorActivitiesTable)
    .where(eq(vendorActivitiesTable.id, activityId))
    .returning();
  if (!deleted || deleted.vendorId !== vendorId) { res.status(404).json({ error: "Activity not found" }); return; }
  res.sendStatus(204);
});

export default router;
