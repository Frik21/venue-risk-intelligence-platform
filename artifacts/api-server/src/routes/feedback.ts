import crypto from "crypto";
import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, feedbackRequestsTable, tasksTable, companiesTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { requireCompanyId } from "../lib/resolve-company";
import { feedbackLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

function formatRequest(row: typeof feedbackRequestsTable.$inferSelect, requestedByName: string | null) {
  return {
    id: row.id,
    taskId: row.taskId,
    requestedBy: row.requestedBy,
    requestedByName,
    requestedAt: row.requestedAt.toISOString(),
    overallRating: row.overallRating,
    professionalismRating: row.professionalismRating,
    punctualityRating: row.punctualityRating,
    communicationRating: row.communicationRating,
    comment: row.comment,
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}

// Company-side (authenticated) surface: generate a link for a task,
// list what's been sent/received against it. Registered ahead of the
// central requireAuth gate (see routes/index.ts) so the public /feedback/:token
// routes below can stay reachable with no session - these two apply
// requireAuth themselves, same pattern routes/auth.ts already uses for
// mixing public and authenticated routes in one file.
router.get("/tasks/:id/feedback-requests", requireAuth, async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const taskId = Number(req.params.id);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(feedbackRequestsTable)
    .where(and(eq(feedbackRequestsTable.companyId, companyId), eq(feedbackRequestsTable.taskId, taskId)))
    .orderBy(desc(feedbackRequestsTable.requestedAt));
  if (rows.length === 0) { res.json([]); return; }

  const userIds = [...new Set(rows.map((r) => r.requestedBy))];
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const userMap: Record<number, string> = {};
  for (const u of users) if (userIds.includes(u.id)) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatRequest(r, userMap[r.requestedBy] ?? null)));
});

router.post("/tasks/:id/feedback-requests", requireAuth, async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const taskId = Number(req.params.id);
  if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [task] = await db.select({ id: tasksTable.id }).from(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.companyId, companyId)));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const id = crypto.randomBytes(24).toString("base64url");
  const requestedBy = req.user!.id;
  const [row] = await db
    .insert(feedbackRequestsTable)
    .values({ id, companyId, taskId, requestedBy })
    .returning();

  const [requestedByUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, requestedBy));
  res.status(201).json(formatRequest(row, requestedByUser?.name ?? null));
});

// Public (unauthenticated) surface - a client opens this link with no
// account and no session at all. Deliberately returns the bare
// minimum needed to render the form (task title, company name) rather
// than anything else about the task/company, and never trusts a
// client-supplied companyId/taskId - both are derived from the token
// row itself.
router.get("/feedback/:token", feedbackLimiter, async (req, res): Promise<void> => {
  const [row] = await db.select().from(feedbackRequestsTable).where(eq(feedbackRequestsTable.id, String(req.params.token)));
  if (!row) { res.status(404).json({ error: "This feedback link is invalid or has expired." }); return; }

  const [task] = await db.select({ title: tasksTable.title }).from(tasksTable).where(eq(tasksTable.id, row.taskId));
  const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, row.companyId));

  res.json({
    taskTitle: task?.title ?? "this job",
    companyName: company?.name ?? "the company",
    submitted: row.submittedAt != null,
  });
});

const SubmitFeedbackSchema = z.object({
  overallRating: z.number().int().min(1).max(5),
  professionalismRating: z.number().int().min(1).max(5),
  punctualityRating: z.number().int().min(1).max(5),
  communicationRating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

// Single-use, same "null until consumed, then locked" shape as
// password_reset_tokens.usedAt - a link that leaks (forwarded email,
// browser history) can't be replayed to overwrite a real answer.
router.post("/feedback/:token", feedbackLimiter, async (req, res): Promise<void> => {
  const [existing] = await db.select().from(feedbackRequestsTable).where(eq(feedbackRequestsTable.id, String(req.params.token)));
  if (!existing) { res.status(404).json({ error: "This feedback link is invalid or has expired." }); return; }
  if (existing.submittedAt != null) { res.status(409).json({ error: "Feedback has already been submitted for this link." }); return; }

  const parsed = SubmitFeedbackSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await db
    .update(feedbackRequestsTable)
    .set({
      overallRating: parsed.data.overallRating,
      professionalismRating: parsed.data.professionalismRating,
      punctualityRating: parsed.data.punctualityRating,
      communicationRating: parsed.data.communicationRating,
      comment: parsed.data.comment ?? "",
      submittedAt: new Date(),
    })
    .where(eq(feedbackRequestsTable.id, String(req.params.token)));

  res.status(204).end();
});

export default router;
