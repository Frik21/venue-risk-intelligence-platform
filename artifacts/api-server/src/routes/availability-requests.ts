import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, availabilityRequestsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

function formatRequest(row: typeof availabilityRequestsTable.$inferSelect, cpoName: string | null, reviewedByName: string | null) {
  return {
    id: row.id,
    cpoId: row.cpoId,
    cpoName,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    status: row.status as "pending" | "approved" | "denied",
    reviewedBy: row.reviewedBy,
    reviewedByName,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    requestedAt: row.requestedAt.toISOString(),
  };
}

// CPO self-service availability/time-off requests - Following Roadmap
// Tier 3, item 34. Deliberately NOT gated by restrictWritesToRoles
// (item 30's granular-permissions middleware) - unlike that item's
// gated routers, writes here are legitimately split across two
// different actors on the same entity (a CPO creates their own
// request, HR/a Manager reviews it), which that middleware's single-
// allowlist shape doesn't cleanly express; same "left ungated,
// flagged rather than silently assumed complete" posture item 30's
// own Notes entry already called out for checkins.ts/task-equipment.ts.
//
// Company-wide GET, but a CPO session only ever sees its own requests
// - never another operator's - enforced server-side, not just by what
// the frontend happens to query for.
router.get("/availability-requests", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const isCpo = req.user!.role === "cpo";
  const rows = await db
    .select()
    .from(availabilityRequestsTable)
    .where(
      isCpo
        ? and(eq(availabilityRequestsTable.companyId, companyId), eq(availabilityRequestsTable.cpoId, req.user!.id))
        : eq(availabilityRequestsTable.companyId, companyId),
    )
    .orderBy(desc(availabilityRequestsTable.requestedAt));
  if (rows.length === 0) { res.json([]); return; }

  const userIds = [...new Set([...rows.map((r) => r.cpoId), ...rows.map((r) => r.reviewedBy).filter((id): id is number => id != null)])];
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const userMap: Record<number, string> = {};
  for (const u of users) if (userIds.includes(u.id)) userMap[u.id] = u.name;

  res.json(rows.map((r) => formatRequest(r, userMap[r.cpoId] ?? null, r.reviewedBy != null ? (userMap[r.reviewedBy] ?? null) : null)));
});

const CreateRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
});

// cpoId always from the session - a CPO can only ever request time off
// for themselves, same no-client-trust posture as every other
// CPO-authored entity in this app.
router.post("/availability-requests", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreateRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.endDate < parsed.data.startDate) { res.status(400).json({ error: "End date can't be before start date" }); return; }

  const cpoId = req.user!.id;
  const [row] = await db
    .insert(availabilityRequestsTable)
    .values({ companyId, cpoId, startDate: parsed.data.startDate, endDate: parsed.data.endDate, reason: parsed.data.reason ?? "" })
    .returning();

  const [cpo] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, cpoId));
  res.status(201).json(formatRequest(row, cpo?.name ?? null, null));
});

const ReviewSchema = z.object({ status: z.enum(["approved", "denied"]) });

// Review - Management-side only (a CPO reviewing their own request
// would defeat the point). Checked inline rather than through
// restrictWritesToRoles, since this router's own GET above already
// needed custom per-role logic beyond that middleware's shape - see
// the comment above.
router.patch("/availability-requests/:id", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  if (req.user!.role === "cpo") { res.status(403).json({ error: "Only Management can review a time-off request" }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ReviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .update(availabilityRequestsTable)
    .set({ status: parsed.data.status, reviewedBy: req.user!.id, reviewedAt: new Date() })
    .where(and(eq(availabilityRequestsTable.id, id), eq(availabilityRequestsTable.companyId, companyId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Request not found" }); return; }

  const [cpo] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.cpoId));
  const [reviewer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user!.id));
  res.json(formatRequest(row, cpo?.name ?? null, reviewer?.name ?? null));
});

export default router;
