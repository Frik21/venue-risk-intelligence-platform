import { Router, type IRouter } from "express";
import { eq, asc, ne, count, max } from "drizzle-orm";
import { db, companiesTable, usersTable, venuesTable, clientsTable, tasksTable } from "@workspace/db";
import { z } from "zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
// Owner-only - the one surface a companyId: null session is allowed to
// use, and only for this aggregate-only data (see buildCompanyRows's
// own comment for the invariant this protects).
router.use(requireRole("admin"));

const TIERS = ["enterprise", "micro_enterprise"] as const;
const STATUSES = ["trial", "active", "suspended", "cancelled"] as const;

// Directional only - no billing integration exists. A static price-per-
// tier map used purely to give the Owner a sense of platform revenue on
// the summary tile; never derived from an actual invoice/subscription.
const TIER_MONTHLY_PRICE: Record<(typeof TIERS)[number], number> = {
  enterprise: 2500,
  micro_enterprise: 900,
};

// Everything in this file is deliberately aggregate-only - counts and
// timestamps grouped by company_id, never a row from a tenant table
// (no task titles, client names, quote amounts, etc.). This is the one
// hard architectural rule of the Owner surface: the platform's own
// owner can see how a subscriber is doing on paper, never what that
// subscriber is actually doing. See the CLAUDE.md note on the Owner
// page for why.
async function buildCompanyRows() {
  const companies = await db.select().from(companiesTable).orderBy(asc(companiesTable.name));

  const [managementCounts, cpoCounts, venueCounts, clientCounts, taskCounts, lastActivity] = await Promise.all([
    db
      .select({ companyId: usersTable.companyId, value: count() })
      .from(usersTable)
      .where(ne(usersTable.role, "cpo"))
      .groupBy(usersTable.companyId),
    db
      .select({ companyId: usersTable.companyId, value: count() })
      .from(usersTable)
      .where(eq(usersTable.role, "cpo"))
      .groupBy(usersTable.companyId),
    db.select({ companyId: venuesTable.companyId, value: count() }).from(venuesTable).groupBy(venuesTable.companyId),
    db.select({ companyId: clientsTable.companyId, value: count() }).from(clientsTable).groupBy(clientsTable.companyId),
    db.select({ companyId: tasksTable.companyId, value: count() }).from(tasksTable).groupBy(tasksTable.companyId),
    db.select({ companyId: tasksTable.companyId, value: max(tasksTable.updatedAt) }).from(tasksTable).groupBy(tasksTable.companyId),
  ]);

  const toMap = <T,>(rows: { companyId: number | null; value: T }[]) => {
    const map: Record<number, T> = {};
    for (const r of rows) if (r.companyId != null) map[r.companyId] = r.value;
    return map;
  };
  const managementMap = toMap(managementCounts);
  const cpoMap = toMap(cpoCounts);
  const venueMap = toMap(venueCounts);
  const clientMap = toMap(clientCounts);
  const taskMap = toMap(taskCounts);
  const activityMap = toMap(lastActivity);

  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    tier: c.tier as (typeof TIERS)[number],
    status: c.status as (typeof STATUSES)[number],
    managementUserCount: managementMap[c.id] ?? 0,
    cpoCount: cpoMap[c.id] ?? 0,
    venueCount: venueMap[c.id] ?? 0,
    clientCount: clientMap[c.id] ?? 0,
    taskCount: taskMap[c.id] ?? 0,
    lastActivityAt: activityMap[c.id]?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  }));
}

router.get("/companies", async (_req, res): Promise<void> => {
  res.json(await buildCompanyRows());
});

router.get("/companies/summary", async (_req, res): Promise<void> => {
  const companies = await db.select({ tier: companiesTable.tier, status: companiesTable.status }).from(companiesTable);

  const byStatus: Record<(typeof STATUSES)[number], number> = { trial: 0, active: 0, suspended: 0, cancelled: 0 };
  const byTier: Record<(typeof TIERS)[number], number> = { enterprise: 0, micro_enterprise: 0 };
  let monthlyRevenue = 0;
  for (const c of companies) {
    const status = c.status as (typeof STATUSES)[number];
    const tier = c.tier as (typeof TIERS)[number];
    if (status in byStatus) byStatus[status]++;
    if (tier in byTier) byTier[tier]++;
    if (status === "active") monthlyRevenue += TIER_MONTHLY_PRICE[tier] ?? 0;
  }

  res.json({
    totalCompanies: companies.length,
    byStatus,
    byTier,
    // Directional figure only - see TIER_MONTHLY_PRICE comment above.
    estimatedMonthlyRevenue: monthlyRevenue,
  });
});

router.get("/companies/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await buildCompanyRows();
  const row = rows.find((r) => r.id === id);
  if (!row) { res.status(404).json({ error: "Company not found" }); return; }
  res.json(row);
});

const CompanyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  tier: z.enum(TIERS).optional(),
  status: z.enum(STATUSES).optional(),
});

router.post("/companies", async (req, res): Promise<void> => {
  const parsed = CompanyInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [company] = await db
    .insert(companiesTable)
    .values({
      name: parsed.data.name,
      tier: parsed.data.tier ?? "enterprise",
      status: parsed.data.status ?? "trial",
    })
    .returning();

  res.status(201).json({ id: company.id, name: company.name, tier: company.tier, status: company.status, createdAt: company.createdAt.toISOString() });
});

const CompanyUpdateSchema = CompanyInputSchema.partial();

router.patch("/companies/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CompanyUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [company] = await db.update(companiesTable).set(parsed.data).where(eq(companiesTable.id, id)).returning();
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }

  res.json({ id: company.id, name: company.name, tier: company.tier, status: company.status, createdAt: company.createdAt.toISOString() });
});

export default router;
