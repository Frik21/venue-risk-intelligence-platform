import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, announcementsTable, usersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function formatAnnouncement(row: typeof announcementsTable.$inferSelect, createdByName: string | null) {
  return {
    id: row.id,
    message: row.message,
    createdBy: row.createdBy,
    createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

// Newest first - every CPO sees the same list (broadcast, no per-CPO
// targeting) on their own Communications panel, and a Manager sees it
// here on /admin/communications.
router.get("/announcements", async (_req, res): Promise<void> => {
  const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));

  const userIds = [...new Set(rows.map((r) => r.createdBy).filter((id): id is number => id != null))];
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatAnnouncement(r, r.createdBy != null ? (userMap[r.createdBy] ?? null) : null)));
});

const AnnouncementInputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  createdBy: z.number().int().nullable().optional(),
});

router.post("/announcements", async (req, res): Promise<void> => {
  const parsed = AnnouncementInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [announcement] = await db
    .insert(announcementsTable)
    .values({ message: parsed.data.message, createdBy: parsed.data.createdBy ?? null })
    .returning();

  let createdByName: string | null = null;
  if (announcement.createdBy != null) {
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, announcement.createdBy));
    createdByName = user?.name ?? null;
  }

  res.status(201).json(formatAnnouncement(announcement, createdByName));
});

router.delete("/announcements/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(announcementsTable).where(eq(announcementsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Announcement not found" }); return; }
  res.sendStatus(204);
});

export default router;
