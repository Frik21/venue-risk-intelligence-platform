import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, announcementsTable, usersTable, tasksTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

// tasks.id -> "T-0001" - tasksTable has no taskNumber column, it's
// derived from the id the same way routes/tasks.ts does.
function taskNumber(id: number) {
  return `T-${String(id).padStart(4, "0")}`;
}

function formatAnnouncement(
  row: typeof announcementsTable.$inferSelect,
  createdByName: string | null,
  task: { taskNumber: string; title: string } | null,
) {
  return {
    id: row.id,
    message: row.message,
    taskId: row.taskId,
    taskNumber: task?.taskNumber ?? null,
    taskTitle: task?.title ?? null,
    createdBy: row.createdBy,
    createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

// Newest first. General announcements (taskId null) go to every CPO;
// task-scoped ones only to that task's roster - the frontend does that
// filtering (it already has each CPO's task list loaded). A Manager
// sees the unfiltered list here on /admin/communications.
router.get("/announcements", async (_req, res): Promise<void> => {
  const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));

  const userIds = [...new Set(rows.map((r) => r.createdBy).filter((id): id is number => id != null))];
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap: Record<number, string> = {};
  for (const u of users) userMap[u.id] = u.name;

  const taskIds = [...new Set(rows.map((r) => r.taskId).filter((id): id is number => id != null))];
  const tasks = taskIds.length
    ? await db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable).where(inArray(tasksTable.id, taskIds))
    : [];
  const taskMap: Record<number, { taskNumber: string; title: string }> = {};
  for (const t of tasks) taskMap[t.id] = { taskNumber: taskNumber(t.id), title: t.title };

  res.json(
    rows.map((r) =>
      formatAnnouncement(
        r,
        r.createdBy != null ? (userMap[r.createdBy] ?? null) : null,
        r.taskId != null ? (taskMap[r.taskId] ?? null) : null,
      ),
    ),
  );
});

const AnnouncementInputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  taskId: z.number().int().nullable().optional(),
  createdBy: z.number().int().nullable().optional(),
});

router.post("/announcements", async (req, res): Promise<void> => {
  const parsed = AnnouncementInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  let task: { taskNumber: string; title: string } | null = null;
  if (parsed.data.taskId != null) {
    const [row] = await db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, parsed.data.taskId));
    if (!row) { res.status(400).json({ error: "Task not found" }); return; }
    task = { taskNumber: taskNumber(row.id), title: row.title };
  }

  const [announcement] = await db
    .insert(announcementsTable)
    .values({ message: parsed.data.message, taskId: parsed.data.taskId ?? null, createdBy: parsed.data.createdBy ?? null })
    .returning();

  let createdByName: string | null = null;
  if (announcement.createdBy != null) {
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, announcement.createdBy));
    createdByName = user?.name ?? null;
  }

  res.status(201).json(formatAnnouncement(announcement, createdByName, task));
});

router.delete("/announcements/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(announcementsTable).where(eq(announcementsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Announcement not found" }); return; }
  res.sendStatus(204);
});

export default router;
