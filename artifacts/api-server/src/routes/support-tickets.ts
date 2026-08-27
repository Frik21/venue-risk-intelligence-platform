import { Router, type IRouter } from "express";
import { db, supportTicketsTable, companiesTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "../lib/auth";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const TICKET_PRIORITIES = ["low", "normal", "high"] as const;
const TICKET_SOURCES = ["command_desk", "operators_note"] as const;

function formatTicket(
  row: typeof supportTicketsTable.$inferSelect,
  extra?: { companyName?: string | null; userName?: string | null },
) {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: extra?.companyName ?? null,
    userId: row.userId,
    userName: extra?.userName ?? null,
    subject: row.subject,
    description: row.description,
    source: row.source as (typeof TICKET_SOURCES)[number],
    status: row.status as (typeof TICKET_STATUSES)[number],
    priority: row.priority as (typeof TICKET_PRIORITIES)[number],
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const CreateTicketSchema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  source: z.enum(TICKET_SOURCES),
});

// The real "report an issue" intake - any authenticated company-scoped
// user (Command Desk or Operators Note, including a Solo Operator CPO -
// see lib/auth.ts's CPO_SURFACE_PATH_PREFIXES) can submit. Not
// Owner-restricted; the Owner has no companyId of their own to submit
// under anyway.
router.post("/support-tickets", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = CreateTicketSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({ companyId, userId: req.user!.id, ...parsed.data })
    .returning();
  res.status(201).json(formatTicket(ticket));
});

// The Owner's own IT inbox - deliberately cross-company (same
// aggregate-only-surface exception as routes/companies.ts, except here
// it's full ticket content, not just aggregates, since reading and
// acting on the ticket is the whole point). "Sent to all of IT" means
// visible here to any Owner-role account - no email delivery exists.
router.get("/support-tickets", requireRole("admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({ ticket: supportTicketsTable, companyName: companiesTable.name, userName: usersTable.name })
    .from(supportTicketsTable)
    .leftJoin(companiesTable, eq(supportTicketsTable.companyId, companiesTable.id))
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .orderBy(desc(supportTicketsTable.createdAt));
  res.json(rows.map((r) => formatTicket(r.ticket, { companyName: r.companyName, userName: r.userName })));
});

const UpdateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});

router.patch("/support-tickets/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateTicketSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Stamped the moment a ticket moves into a closed-out state -
  // matches the "stamped once, on the real transition" convention
  // already used elsewhere (tasks.completedAt, quotes.decidedAt).
  const resolvedAtUpdate =
    parsed.data.status === "resolved" || parsed.data.status === "closed" ? { resolvedAt: new Date() } : {};

  const [ticket] = await db
    .update(supportTicketsTable)
    .set({ ...parsed.data, ...resolvedAtUpdate })
    .where(eq(supportTicketsTable.id, id))
    .returning();
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json(formatTicket(ticket));
});

export default router;
