import { Router, type IRouter } from "express";
import { db, usersTable, companiesTable } from "@workspace/db";
import { z } from "zod";
import { eq, desc, and, count } from "drizzle-orm";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";
import { generateInitialPassword, hashPassword } from "../lib/auth";
import {
  BASE_SEATS_BY_ROLE,
  CPO_BASE_SEATS,
  MANAGEMENT_ROLES,
  PRICE_FIELD_BY_ROLE,
  CPO_PRICE_FIELD,
  getOrCreatePricingConfig,
  type ManagementRole,
} from "./companies";

const router: IRouter = Router();

const UserInputSchema = z.object({
  companyId: z.number().int().nullable().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "manager", "cpo", "finance", "human_resources", "operations"]),
  avatarInitials: z.string().optional(),
  officeId: z.number().int().nullable().optional(),
});

function formatUser(row: typeof usersTable.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    email: row.email,
    role: row.role as "admin" | "manager" | "cpo" | "finance" | "human_resources" | "operations",
    avatarInitials: row.avatarInitials ?? null,
    active: row.active,
    dayRate: row.dayRate ?? null,
    nightRate: row.nightRate ?? null,
    officeId: row.officeId,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/users", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  const users = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.companyId, companyId), eq(usersTable.active, true)))
    .orderBy(usersTable.name);
  res.json(users.map(formatUser));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = UserInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Only an existing Owner can mint another Owner account - a company
  // Manager creating a user has no business ever setting role: "admin".
  if (parsed.data.role === "admin" && req.user!.role !== "admin") {
    res.status(403).json({ error: "Only an Owner can create another Owner account" });
    return;
  }

  const initials = parsed.data.avatarInitials ?? parsed.data.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  // admin (the platform Owner role) is never tied to a company - every
  // other role always is. A regular session can only ever create users
  // in its own company (the client-supplied companyId is ignored, not
  // trusted). The Owner is the one exception: they have no company of
  // their own, so *their* client-supplied companyId is what lets them
  // seed a company's first Manager from the Master Console - falling
  // back to resolveCompanyId's "first company" only if they omit it.
  const companyId =
    parsed.data.role === "admin"
      ? null
      : req.user!.role === "admin"
        ? await resolveCompanyId(parsed.data.companyId)
        : req.user!.companyId;

  // A Solo Operator company (see companies.ts's planType) is exactly
  // one CPO seat by definition - the Master Console's onboarding flow
  // only ever creates that one account, but nothing else stopped a
  // second POST /users(role: "cpo") against the same company. This is
  // that hard cap - the only other route that ever creates a "cpo" user
  // (the onboarding operational-access grant, routes/onboarding.ts)
  // isn't reachable at all for a Solo Operator company in the first
  // place, since Operator Database is a Management-side page.
  if (parsed.data.role === "cpo" && companyId != null) {
    const [company] = await db.select({ planType: companiesTable.planType }).from(companiesTable).where(eq(companiesTable.id, companyId));
    if (company?.planType === "solo_operator") {
      const [existing] = await db
        .select({ value: count() })
        .from(usersTable)
        .where(and(eq(usersTable.companyId, companyId), eq(usersTable.role, "cpo"), eq(usersTable.active, true)));
      if ((existing?.value ?? 0) >= 1) {
        res.status(409).json({ error: "A Solo Operator company can only have one CPO account" });
        return;
      }
    }
  }

  // Admin-generated, shown once in this response - no email
  // infrastructure exists yet to send a real invite/reset link.
  const initialPassword = generateInitialPassword();
  const passwordHash = await hashPassword(initialPassword);

  const [user] = await db
    .insert(usersTable)
    .values({ ...parsed.data, companyId, avatarInitials: initials, passwordHash, mustChangePassword: true })
    .returning();
  res.status(201).json({ ...formatUser(user), initialPassword });
});

async function buildSeats(companyId: number) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
  if (!company) return null;

  const counts = await db
    .select({ role: usersTable.role, value: count() })
    .from(usersTable)
    .where(and(eq(usersTable.companyId, companyId), eq(usersTable.active, true)))
    .groupBy(usersTable.role);
  const usedByRole: Partial<Record<ManagementRole, number>> = {};
  let cpoUsed = 0;
  for (const r of counts) {
    if (MANAGEMENT_ROLES.includes(r.role as ManagementRole)) usedByRole[r.role as ManagementRole] = r.value;
    else if (r.role === "cpo") cpoUsed = r.value;
  }

  // pricePerSeat rides along on each role's own usage object - the
  // Owner-set price (routes/companies.ts's pricing config) isn't
  // tenant-sensitive like the rest of that file, and a company adding
  // seats should be able to see what each one costs before committing
  // to it, not just the Owner. Per direct product direction, every
  // role prices individually now - no more one shared price for all of
  // Manager/Operations/Finance/HR/CPO.
  const pricing = await getOrCreatePricingConfig();

  const seatsByRole = MANAGEMENT_ROLES.reduce(
    (acc, role) => {
      const additional =
        role === "manager"
          ? company.additionalManagerSeats
          : role === "operations"
            ? company.additionalOperationsSeats
            : role === "finance"
              ? company.additionalFinanceSeats
              : company.additionalHumanResourcesSeats;
      acc[role] = {
        used: usedByRole[role] ?? 0,
        base: BASE_SEATS_BY_ROLE[role],
        additional,
        limit: BASE_SEATS_BY_ROLE[role] + additional,
        pricePerSeat: pricing[PRICE_FIELD_BY_ROLE[role]],
      };
      return acc;
    },
    {} as Record<ManagementRole, { used: number; base: number; additional: number; limit: number; pricePerSeat: number }>,
  );

  // CPO seats (Operators note) - same base+additional shape, tracked
  // completely separately from the four Management roles above, per
  // direct product direction. Only meaningful here since this whole
  // page (Command Desk) is unreachable for a Solo Operator company
  // anyway (blockSoloOperatorFromManagement), so no plan-type check
  // needed - a company that got this far is always Team.
  const cpoSeatUsage = {
    used: cpoUsed,
    base: CPO_BASE_SEATS,
    additional: company.additionalCpoSeats,
    limit: CPO_BASE_SEATS + company.additionalCpoSeats,
    pricePerSeat: pricing[CPO_PRICE_FIELD],
  };

  return { seatsByRole, cpoSeatUsage };
}

// Command Desk's own self-service seat view - distinct from the Owner
// Console's aggregate-only surface (routes/companies.ts, admin-only).
// Any Management-side role can view/adjust its own company's seats
// (both the four Management roles and CPO/Operators note), same
// looseness this whole page already has ("No team grouping or
// granular per-user permissions exist yet").
// Registered ahead of PATCH /users/:id below - "seats" would otherwise
// match that route's :id param first.
router.get("/users/seats", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const seats = await buildSeats(companyId);
  if (!seats) { res.status(404).json({ error: "Company not found" }); return; }
  res.json(seats);
});

const SeatsUpdateSchema = z.object({
  additionalManagerSeats: z.number().int().min(0).optional(),
  additionalOperationsSeats: z.number().int().min(0).optional(),
  additionalFinanceSeats: z.number().int().min(0).optional(),
  additionalHumanResourcesSeats: z.number().int().min(0).optional(),
  additionalCpoSeats: z.number().int().min(0).optional(),
});

router.patch("/users/seats", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = SeatsUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await db.update(companiesTable).set(parsed.data).where(eq(companiesTable.id, companyId));

  const seats = await buildSeats(companyId);
  if (!seats) { res.status(404).json({ error: "Company not found" }); return; }
  res.json(seats);
});

const UserUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  avatarInitials: z.string().max(4).optional(),
  // Unlike role/active below, home office isn't a permission field -
  // no separate admin-only endpoint needed for it.
  officeId: z.number().int().nullable().optional(),
});

// Self-service profile edit (Profile > Account Details) - deliberately
// doesn't accept role/active, which stay admin-managed elsewhere.
router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UserUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(formatUser(user));
});

const RatesUpdateSchema = z.object({
  dayRate: z.number().min(0).nullable().optional(),
  nightRate: z.number().min(0).nullable().optional(),
});

// Manager-set pay rate, deliberately separate from the self-service
// PATCH above - a CPO editing their own Account Details should never
// be able to set their own pay rate.
router.patch("/users/:id/rates", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = RatesUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json(formatUser(user));
});

export default router;
