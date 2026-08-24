import { Router, type IRouter } from "express";
import { eq, asc, count, max } from "drizzle-orm";
import { db, companiesTable, usersTable, venuesTable, clientsTable, tasksTable } from "@workspace/db";
import { z } from "zod";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();
// Owner-only - the one surface a companyId: null session is allowed to
// use, and only for this aggregate-only data (see buildCompanyRows's
// own comment for the invariant this protects).
router.use(requireRole("admin"));

const STATUSES = ["trial", "active", "suspended", "cancelled"] as const;

// Single-plan model - no more Enterprise/Micro Enterprise tiers, per
// direct product direction. Every company gets this same fixed base
// per Management-side role; companiesTable's additionalXSeats columns
// track extra seats purchased beyond it, per role. CPO seats are
// explicitly out of scope for this model, left untouched. Also
// exported for the frontend (registration form, Owner Console) so the
// base numbers can't drift out of sync between the two.
export const BASE_SEATS_BY_ROLE = {
  manager: 8,
  operations: 5,
  finance: 5,
  human_resources: 5,
} as const;
type ManagementRole = keyof typeof BASE_SEATS_BY_ROLE;
const MANAGEMENT_ROLES = Object.keys(BASE_SEATS_BY_ROLE) as ManagementRole[];

// Directional only - no billing integration exists. A flat per-company
// base plus a flat price per additional seat purchased (any role),
// used purely to give the Owner a sense of platform revenue on the
// summary tile; never derived from an actual invoice/subscription.
const BASE_MONTHLY_PRICE = 1500;
const PRICE_PER_ADDITIONAL_SEAT = 40;

function additionalSeatsTotal(company: { additionalManagerSeats: number; additionalOperationsSeats: number; additionalFinanceSeats: number; additionalHumanResourcesSeats: number }) {
  return company.additionalManagerSeats + company.additionalOperationsSeats + company.additionalFinanceSeats + company.additionalHumanResourcesSeats;
}

// Everything in this file is deliberately aggregate-only - counts and
// timestamps grouped by company_id, never a row from a tenant table
// (no task titles, client names, quote amounts, etc.). This is the one
// hard architectural rule of the Owner surface: the platform's own
// owner can see how a subscriber is doing on paper, never what that
// subscriber is actually doing. See the CLAUDE.md note on the Owner
// page for why.
async function buildCompanyRows() {
  const companies = await db.select().from(companiesTable).orderBy(asc(companiesTable.name));

  const [managementCountsByRole, cpoCounts, venueCounts, clientCounts, taskCounts, lastActivity] = await Promise.all([
    // Grouped by role too (not just company) so each Management role's
    // usage can be checked against its own base+additional limit -
    // non-Management roles (cpo, admin) come back here too but are
    // filtered out below via MANAGEMENT_ROLES.includes(...).
    db
      .select({ companyId: usersTable.companyId, role: usersTable.role, value: count() })
      .from(usersTable)
      .groupBy(usersTable.companyId, usersTable.role),
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
  // Per-role usage: company id -> role -> count.
  const managementByRoleMap: Record<number, Partial<Record<ManagementRole, number>>> = {};
  for (const r of managementCountsByRole) {
    if (r.companyId == null || !MANAGEMENT_ROLES.includes(r.role as ManagementRole)) continue;
    (managementByRoleMap[r.companyId] ??= {})[r.role as ManagementRole] = r.value;
  }
  const cpoMap = toMap(cpoCounts);
  const venueMap = toMap(venueCounts);
  const clientMap = toMap(clientCounts);
  const taskMap = toMap(taskCounts);
  const activityMap = toMap(lastActivity);

  return companies.map((c) => {
    const roleUsage = managementByRoleMap[c.id] ?? {};
    const seatsByRole = MANAGEMENT_ROLES.reduce(
      (acc, role) => {
        const additional =
          role === "manager"
            ? c.additionalManagerSeats
            : role === "operations"
              ? c.additionalOperationsSeats
              : role === "finance"
                ? c.additionalFinanceSeats
                : c.additionalHumanResourcesSeats;
        acc[role] = { used: roleUsage[role] ?? 0, base: BASE_SEATS_BY_ROLE[role], additional, limit: BASE_SEATS_BY_ROLE[role] + additional };
        return acc;
      },
      {} as Record<ManagementRole, { used: number; base: number; additional: number; limit: number }>,
    );

    return {
      id: c.id,
      name: c.name,
      status: c.status as (typeof STATUSES)[number],
      isInternal: c.isInternal,
      seatsByRole,
      cpoCount: cpoMap[c.id] ?? 0,
      venueCount: venueMap[c.id] ?? 0,
      clientCount: clientMap[c.id] ?? 0,
      taskCount: taskMap[c.id] ?? 0,
      lastActivityAt: activityMap[c.id]?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  });
}

router.get("/companies", async (_req, res): Promise<void> => {
  res.json(await buildCompanyRows());
});

router.get("/companies/summary", async (_req, res): Promise<void> => {
  const companies = await db
    .select({
      status: companiesTable.status,
      additionalManagerSeats: companiesTable.additionalManagerSeats,
      additionalOperationsSeats: companiesTable.additionalOperationsSeats,
      additionalFinanceSeats: companiesTable.additionalFinanceSeats,
      additionalHumanResourcesSeats: companiesTable.additionalHumanResourcesSeats,
    })
    .from(companiesTable);

  const byStatus: Record<(typeof STATUSES)[number], number> = { trial: 0, active: 0, suspended: 0, cancelled: 0 };
  let monthlyRevenue = 0;
  for (const c of companies) {
    const status = c.status as (typeof STATUSES)[number];
    if (status in byStatus) byStatus[status]++;
    if (status === "active") monthlyRevenue += BASE_MONTHLY_PRICE + additionalSeatsTotal(c) * PRICE_PER_ADDITIONAL_SEAT;
  }

  res.json({
    totalCompanies: companies.length,
    byStatus,
    // Directional figure only - see BASE_MONTHLY_PRICE/PRICE_PER_ADDITIONAL_SEAT comment above.
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
  status: z.enum(STATUSES).optional(),
  isInternal: z.boolean().optional(),
  additionalManagerSeats: z.number().int().min(0).optional(),
  additionalOperationsSeats: z.number().int().min(0).optional(),
  additionalFinanceSeats: z.number().int().min(0).optional(),
  additionalHumanResourcesSeats: z.number().int().min(0).optional(),
});

function formatCompanyRecord(company: typeof companiesTable.$inferSelect) {
  return {
    id: company.id,
    name: company.name,
    status: company.status,
    isInternal: company.isInternal,
    additionalManagerSeats: company.additionalManagerSeats,
    additionalOperationsSeats: company.additionalOperationsSeats,
    additionalFinanceSeats: company.additionalFinanceSeats,
    additionalHumanResourcesSeats: company.additionalHumanResourcesSeats,
    createdAt: company.createdAt.toISOString(),
  };
}

router.post("/companies", async (req, res): Promise<void> => {
  const parsed = CompanyInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [company] = await db
    .insert(companiesTable)
    .values({
      name: parsed.data.name,
      status: parsed.data.status ?? "trial",
      isInternal: parsed.data.isInternal ?? false,
      additionalManagerSeats: parsed.data.additionalManagerSeats ?? 0,
      additionalOperationsSeats: parsed.data.additionalOperationsSeats ?? 0,
      additionalFinanceSeats: parsed.data.additionalFinanceSeats ?? 0,
      additionalHumanResourcesSeats: parsed.data.additionalHumanResourcesSeats ?? 0,
    })
    .returning();

  res.status(201).json(formatCompanyRecord(company));
});

const CompanyUpdateSchema = CompanyInputSchema.partial();

router.patch("/companies/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CompanyUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [company] = await db.update(companiesTable).set(parsed.data).where(eq(companiesTable.id, id)).returning();
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }

  res.json(formatCompanyRecord(company));
});

export default router;
