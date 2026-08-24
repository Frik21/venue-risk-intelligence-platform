import { Router, type IRouter } from "express";
import { eq, asc, desc, count, max } from "drizzle-orm";
import { db, companiesTable, usersTable, venuesTable, clientsTable, tasksTable, pricingConfigTable, pricingHistoryTable } from "@workspace/db";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import { getExchangeRate, currencyForCountry, SUPPORTED_CURRENCY_CODES } from "../lib/currency";

const router: IRouter = Router();
// Owner-only - the one surface a companyId: null session is allowed to
// use, and only for this aggregate-only data (see buildCompanyRows's
// own comment for the invariant this protects).
router.use(requireRole("admin"));

const STATUSES = ["trial", "active", "suspended", "cancelled"] as const;

// "team" (the default) or "solo_operator" - a single freelance CPO's
// own subscription, Operators Note only, no Management-side seats.
// Enforced server-side by lib/auth.ts's blockSoloOperatorFromManagement,
// not just a display label. Set at company creation, Master Console
// only for now - no self-serve signup path for this plan yet.
export const PLAN_TYPES = ["team", "solo_operator"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

// Single-plan model - no more Enterprise/Micro Enterprise tiers, per
// direct product direction. Every company gets this same fixed base
// per Management-side role; companiesTable's additionalXSeats columns
// track extra seats purchased beyond it, per role. Also exported for
// the frontend (registration form, Master Console) so the base numbers
// can't drift out of sync between the two.
export const BASE_SEATS_BY_ROLE = {
  manager: 8,
  operations: 5,
  finance: 5,
  human_resources: 5,
} as const;
export type ManagementRole = keyof typeof BASE_SEATS_BY_ROLE;
export const MANAGEMENT_ROLES = Object.keys(BASE_SEATS_BY_ROLE) as ManagementRole[];

// CPO seats (Operators note) follow the same base+additional shape but
// are tracked completely separately from the four Management roles
// above - per direct product direction, CPOs are their own seat-
// limited pool, not a fifth Management role. Only meaningful for a
// Team company - Solo Operator is hardcoded to exactly one CPO seat
// (routes/users.ts), unrelated to this.
export const CPO_BASE_SEATS = 12;

// The seven Owner-editable dollar figures on pricingConfigTable - kept
// as one list so the change-history endpoint (POST /companies/pricing/
// change below) can validate `field` against real column names without
// a separate place having to be kept in sync by hand. Per direct
// product direction, every seat role prices individually - no more one
// shared "price per additional seat" for all of Manager/Operations/
// Finance/HR/CPO.
export const PRICING_FIELDS = [
  "baseMonthlyPrice",
  "pricePerManagerSeat",
  "pricePerOperationsSeat",
  "pricePerFinanceSeat",
  "pricePerHumanResourcesSeat",
  "pricePerCpoSeat",
  "soloOperatorMonthlyPrice",
] as const;
export type PricingField = (typeof PRICING_FIELDS)[number];

// Maps each Management role to its own pricing column - lets
// buildCompanyRows/buildSeats (routes/users.ts) look up "what does an
// additional seat of this role cost" without a role-by-role if/else at
// every call site.
export const PRICE_FIELD_BY_ROLE: Record<ManagementRole, PricingField> = {
  manager: "pricePerManagerSeat",
  operations: "pricePerOperationsSeat",
  finance: "pricePerFinanceSeat",
  human_resources: "pricePerHumanResourcesSeat",
};
export const CPO_PRICE_FIELD: PricingField = "pricePerCpoSeat";

// Directional only - no billing integration exists. Owner-editable
// (GET/PATCH /companies/pricing below, backed by pricingConfigTable)
// rather than hardcoded, so the Owner can actually set these numbers
// instead of them being buried in code - still just what the Owner
// says they are, never derived from an actual invoice/subscription.
// Exported so routes/users.ts's own self-service seats endpoint can
// surface each role's per-seat price to a regular company session too
// (this data isn't tenant-sensitive, unlike everything else in this
// file - just a number every company already needs to see the cost of
// adding a seat).
export async function getOrCreatePricingConfig() {
  const [existing] = await db.select().from(pricingConfigTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(pricingConfigTable).values({}).returning();
  return created;
}

function estimatedMonthlyCharge(
  company: {
    planType: string;
    additionalManagerSeats: number;
    additionalOperationsSeats: number;
    additionalFinanceSeats: number;
    additionalHumanResourcesSeats: number;
    additionalCpoSeats: number;
  },
  pricing: typeof pricingConfigTable.$inferSelect,
) {
  if (company.planType === "solo_operator") return pricing.soloOperatorMonthlyPrice;
  return (
    pricing.baseMonthlyPrice +
    company.additionalManagerSeats * pricing.pricePerManagerSeat +
    company.additionalOperationsSeats * pricing.pricePerOperationsSeat +
    company.additionalFinanceSeats * pricing.pricePerFinanceSeat +
    company.additionalHumanResourcesSeats * pricing.pricePerHumanResourcesSeat +
    company.additionalCpoSeats * pricing.pricePerCpoSeat
  );
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
  const pricing = await getOrCreatePricingConfig();

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
        acc[role] = {
          used: roleUsage[role] ?? 0,
          base: BASE_SEATS_BY_ROLE[role],
          additional,
          limit: BASE_SEATS_BY_ROLE[role] + additional,
          pricePerSeat: pricing[PRICE_FIELD_BY_ROLE[role]],
        };
        return acc;
      },
      {} as Record<ManagementRole, { used: number; base: number; additional: number; limit: number; pricePerSeat: number }>,
    );

    const cpoUsed = cpoMap[c.id] ?? 0;

    return {
      id: c.id,
      name: c.name,
      status: c.status as (typeof STATUSES)[number],
      planType: c.planType as PlanType,
      isInternal: c.isInternal,
      seatsByRole,
      cpoCount: cpoUsed,
      cpoSeatUsage: {
        used: cpoUsed,
        base: CPO_BASE_SEATS,
        additional: c.additionalCpoSeats,
        limit: CPO_BASE_SEATS + c.additionalCpoSeats,
        pricePerSeat: pricing[CPO_PRICE_FIELD],
      },
      venueCount: venueMap[c.id] ?? 0,
      clientCount: clientMap[c.id] ?? 0,
      taskCount: taskMap[c.id] ?? 0,
      lastActivityAt: activityMap[c.id]?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      // Directional only - see the Owner-editable pricing config (GET/
      // PATCH /companies/pricing). What this company would be charged
      // under the current model, regardless of status - the summary
      // tile below is the one place this is actually gated to status:
      // "active".
      estimatedMonthlyCharge: estimatedMonthlyCharge(c, pricing),
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
      planType: companiesTable.planType,
      additionalManagerSeats: companiesTable.additionalManagerSeats,
      additionalOperationsSeats: companiesTable.additionalOperationsSeats,
      additionalFinanceSeats: companiesTable.additionalFinanceSeats,
      additionalHumanResourcesSeats: companiesTable.additionalHumanResourcesSeats,
      additionalCpoSeats: companiesTable.additionalCpoSeats,
    })
    .from(companiesTable);
  const pricing = await getOrCreatePricingConfig();

  const byStatus: Record<(typeof STATUSES)[number], number> = { trial: 0, active: 0, suspended: 0, cancelled: 0 };
  let monthlyRevenue = 0;
  for (const c of companies) {
    const status = c.status as (typeof STATUSES)[number];
    if (status in byStatus) byStatus[status]++;
    if (status === "active") monthlyRevenue += estimatedMonthlyCharge(c, pricing);
  }

  res.json({
    totalCompanies: companies.length,
    byStatus,
    // Directional figure only - see the Owner-editable pricing config.
    estimatedMonthlyRevenue: monthlyRevenue,
  });
});

function formatPricingConfig(row: typeof pricingConfigTable.$inferSelect) {
  return {
    baseMonthlyPrice: row.baseMonthlyPrice,
    pricePerManagerSeat: row.pricePerManagerSeat,
    pricePerOperationsSeat: row.pricePerOperationsSeat,
    pricePerFinanceSeat: row.pricePerFinanceSeat,
    pricePerHumanResourcesSeat: row.pricePerHumanResourcesSeat,
    pricePerCpoSeat: row.pricePerCpoSeat,
    soloOperatorMonthlyPrice: row.soloOperatorMonthlyPrice,
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/companies/pricing", async (_req, res): Promise<void> => {
  res.json(formatPricingConfig(await getOrCreatePricingConfig()));
});

function formatPricingHistory(row: typeof pricingHistoryTable.$inferSelect) {
  return {
    id: row.id,
    field: row.field as PricingField,
    previousValue: row.previousValue,
    newValue: row.newValue,
    percentageChange: row.percentageChange,
    changedAt: row.changedAt.toISOString(),
  };
}

router.get("/companies/pricing/history", async (_req, res): Promise<void> => {
  const rows = await db.select().from(pricingHistoryTable).orderBy(desc(pricingHistoryTable.changedAt));
  res.json(rows.map(formatPricingHistory));
});

export const PRICING_CURRENCY_CODES = SUPPORTED_CURRENCY_CODES;

// Backs the Master Console's own "which currency am I working in"
// selector (pages/owner/subscriptions.tsx) - lets the Owner view/set
// prices in a currency other than the canonical USD everything is
// actually stored in (pricingConfigTable, pricing_history). The
// frontend converts both directions around this rate; the backend
// itself never receives or stores anything but USD, so nothing here
// changes what /companies/pricing/change actually persists.
router.get("/companies/pricing/fx", async (req, res): Promise<void> => {
  const code = String(req.query.currency ?? "USD").toUpperCase();
  if (!(SUPPORTED_CURRENCY_CODES as readonly string[]).includes(code)) {
    res.status(400).json({ error: "Unsupported currency" });
    return;
  }
  const rate = await getExchangeRate(code);
  res.json({ code, rate });
});

// Backs the Master Console's "use my location" button - the CPO
// Operational Canvas already has a real location engine (browser
// geolocation + reverse geocoding, see components/location-search.tsx's
// resolveCurrentLocation) that resolves a country name; this endpoint
// is the missing link turning that country into a currency the working-
// currency selector can actually use, via the same map the subscriber-
// facing engine resolves through - not a second implementation.
router.get("/companies/pricing/currency-for-country", async (req, res): Promise<void> => {
  const country = String(req.query.country ?? "");
  const code = country ? currencyForCountry(country) : null;
  const supported = code != null && (SUPPORTED_CURRENCY_CODES as readonly string[]).includes(code);
  res.json({ code: supported ? code : null });
});

// One field per call, either as a direct new dollar value ("set the
// current price") or as a percentage change ("increase by X%") - per
// direct product direction, the Master Console needs both. Whichever is
// given, the other is derived server-side so pricing_history's own
// record of what happened can never disagree with what actually got
// saved to pricingConfigTable. percentageChange is stored as entered
// when given directly (not re-derived from the rounded newValue, which
// would drift); when newValue is given directly instead, percentageChange
// is computed from it (0 if previousValue was itself 0 - nothing to
// express as a percentage of zero).
const PricingChangeSchema = z
  .object({
    field: z.enum(PRICING_FIELDS),
    newValue: z.number().int().min(0).optional(),
    percentageChange: z.number().finite().optional(),
  })
  .refine((d) => (d.newValue != null) !== (d.percentageChange != null), {
    message: "Provide exactly one of newValue or percentageChange",
  });

router.post("/companies/pricing/change", async (req, res): Promise<void> => {
  const parsed = PricingChangeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const current = await getOrCreatePricingConfig();
  const previousValue = current[parsed.data.field];

  let newValue: number;
  let percentageChange: number;
  if (parsed.data.newValue != null) {
    newValue = parsed.data.newValue;
    percentageChange = previousValue === 0 ? 0 : ((newValue - previousValue) / previousValue) * 100;
  } else {
    percentageChange = parsed.data.percentageChange!;
    newValue = Math.max(0, Math.round(previousValue * (1 + percentageChange / 100)));
  }

  const [updatedConfig] = await db
    .update(pricingConfigTable)
    .set({ [parsed.data.field]: newValue })
    .where(eq(pricingConfigTable.id, current.id))
    .returning();
  const [entry] = await db
    .insert(pricingHistoryTable)
    .values({ field: parsed.data.field, previousValue, newValue, percentageChange })
    .returning();

  res.json({ config: formatPricingConfig(updatedConfig), entry: formatPricingHistory(entry) });
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
  planType: z.enum(PLAN_TYPES).optional(),
  isInternal: z.boolean().optional(),
  additionalManagerSeats: z.number().int().min(0).optional(),
  additionalOperationsSeats: z.number().int().min(0).optional(),
  additionalFinanceSeats: z.number().int().min(0).optional(),
  additionalHumanResourcesSeats: z.number().int().min(0).optional(),
  additionalCpoSeats: z.number().int().min(0).optional(),
});

function formatCompanyRecord(company: typeof companiesTable.$inferSelect) {
  return {
    id: company.id,
    name: company.name,
    status: company.status,
    planType: company.planType,
    isInternal: company.isInternal,
    additionalManagerSeats: company.additionalManagerSeats,
    additionalOperationsSeats: company.additionalOperationsSeats,
    additionalFinanceSeats: company.additionalFinanceSeats,
    additionalHumanResourcesSeats: company.additionalHumanResourcesSeats,
    additionalCpoSeats: company.additionalCpoSeats,
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
      planType: parsed.data.planType ?? "team",
      isInternal: parsed.data.isInternal ?? false,
      additionalManagerSeats: parsed.data.additionalManagerSeats ?? 0,
      additionalOperationsSeats: parsed.data.additionalOperationsSeats ?? 0,
      additionalFinanceSeats: parsed.data.additionalFinanceSeats ?? 0,
      additionalHumanResourcesSeats: parsed.data.additionalHumanResourcesSeats ?? 0,
      additionalCpoSeats: parsed.data.additionalCpoSeats ?? 0,
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
