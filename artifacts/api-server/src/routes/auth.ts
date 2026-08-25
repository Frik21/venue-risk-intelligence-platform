import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { db, usersTable, companiesTable, sessionsTable, officesTable } from "@workspace/db";
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  enterPreview,
  exitPreview,
  hashPassword,
  requireAuth,
  requireRole,
  verifyPassword,
} from "../lib/auth";
import { getOrCreatePricingConfig, trialEndsAtFor } from "./companies";
import { createCardValidationSetupIntent, getStripePublishableKey, isStripeConfigured, verifySetupIntentSucceeded } from "../lib/stripe";

// Deliberately NOT behind requireAuth (except /me and /change-password,
// gated per-route below) - registered in routes/index.ts before the
// central auth gate so login works with no session yet, and logout
// still works with a stale/expired cookie.
const router: IRouter = Router();

const isProduction = process.env.NODE_ENV === "production";
const cookieOptions = {
  httpOnly: true,
  signed: true,
  sameSite: "lax" as const,
  secure: isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// `effective` carries the session's actual companyId/isPreviewing (from
// req.user, which requireAuth already resolved) for callers that need
// it - login and change-password never have a preview active yet (a
// fresh/still-authenticating session), so they can omit it and fall
// back to the raw user row's own companyId.
async function formatSessionUser(row: typeof usersTable.$inferSelect, effective?: { companyId: number | null; isPreviewing: boolean }) {
  const companyId = effective?.companyId ?? row.companyId;
  const isPreviewing = effective?.isPreviewing ?? false;
  // A non-Owner session can't hit GET /companies (Owner-only) to learn
  // its own company's name for display, so it rides along on the
  // session payload instead - the one place a name, not just an id, is
  // needed outside the aggregate-only Owner surface. planType rides
  // along the same way - require-auth.tsx uses it to keep a
  // Solo Operator session inside /cpo without an extra round trip.
  let companyName: string | null = null;
  let planType: "team" | "solo_operator" | null = null;
  if (companyId != null) {
    const [company] = await db.select({ name: companiesTable.name, planType: companiesTable.planType }).from(companiesTable).where(eq(companiesTable.id, companyId));
    companyName = company?.name ?? null;
    planType = (company?.planType as "team" | "solo_operator" | undefined) ?? null;
  }
  return {
    id: row.id,
    companyId,
    companyName,
    planType,
    isPreviewing,
    name: row.name,
    email: row.email,
    role: row.role as "admin" | "manager" | "cpo" | "finance" | "human_resources" | "operations",
    avatarInitials: row.avatarInitials ?? null,
    mustChangePassword: row.mustChangePassword,
  };
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase()));
  // Same generic error whether the account doesn't exist, is inactive,
  // has no password set yet, or the password is wrong - never lets a
  // caller enumerate which emails have accounts.
  if (!user || !user.active || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const sessionId = await createSession(user.id);
  res.cookie(SESSION_COOKIE, sessionId, cookieOptions);
  res.json({ user: await formatSessionUser(user) });
});

// Unauthenticated - the /register page needs to show the base
// subscription price before a company/session exists at all, so this
// can't sit behind companies.ts's admin-only /companies/pricing. Only
// the two flat base figures (no per-seat prices, no history) - seats
// aren't collected at signup (see the RegisterSchema comment below),
// and always USD since there's no company/office yet for the currency
// engine to derive a local currency from.
router.get("/auth/pricing", async (_req, res): Promise<void> => {
  const pricing = await getOrCreatePricingConfig();
  res.json({ baseMonthlyPrice: pricing.baseMonthlyPrice, soloOperatorMonthlyPrice: pricing.soloOperatorMonthlyPrice });
});

// Unauthenticated - lets /register know at runtime whether a real
// Stripe account is actually connected (lib/stripe.ts), so it can show
// the real card-collection panel instead of the non-functional stub,
// with zero frontend redeploy needed once STRIPE_SECRET_KEY/
// STRIPE_PUBLISHABLE_KEY are set on the backend. publishableKey is safe
// to expose - it's meant to ship to the browser, unlike the secret key.
router.get("/auth/stripe/config", (_req, res): void => {
  res.json({ enabled: isStripeConfigured(), publishableKey: getStripePublishableKey() });
});

// Unauthenticated - creates the SetupIntent /register's real Stripe
// panel confirms client-side to validate a card is real without
// charging or storing it (see lib/stripe.ts's own comment on why no
// Customer/PaymentMethod is ever persisted).
router.post("/auth/stripe/setup-intent", async (_req, res): Promise<void> => {
  if (!isStripeConfigured()) { res.status(503).json({ error: "Stripe is not connected yet" }); return; }
  try {
    const clientSecret = await createCardValidationSetupIntent();
    res.json({ clientSecret });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to start card validation" });
  }
});

const RegisterSchema = z
  .object({
    // "team" (default) or "solo_operator" - per direct product
    // direction, self-serve signup now covers both plans, not just
    // Team. companyName is conditionally required below (Solo
    // Operator is for an individual, not a company - same convention
    // the Owner Console's own onboarding dialog already follows).
    planType: z.enum(["team", "solo_operator"]).default("team"),
    companyName: z.string().trim().max(200).optional(),
    // Optional - Team only (Solo Operator has no offices at all, no
    // Management side to manage them from). Just city+country, the two
    // fields that actually matter: country is what the currency engine
    // (lib/currency.ts's resolveCurrency) derives a company's currency
    // from via its earliest office, so filling this in at signup gives
    // Command Desk's seat prices a real currency signal from day one
    // instead of falling back to USD until someone adds an office by
    // hand later.
    officeCity: z.string().trim().max(200).optional(),
    officeCountry: z.string().trim().max(200).optional(),
    // "Position" on the signup form - which of the four Management
    // roles the person signing up actually is. Team only; Solo
    // Operator's single account is always role: "cpo", not one of these.
    role: z.enum(["manager", "operations", "finance", "human_resources"]).default("manager"),
    name: z.string().trim().min(1).max(200),
    email: z.string().email(),
    password: z.string().min(8),
    // Extra seats beyond the fixed per-role base (see companies.ts's
    // BASE_SEATS_BY_ROLE/CPO_BASE_SEATS) - optional, defaults to 0 for
    // every role. Meaningless for Solo Operator (hard-capped to
    // exactly one CPO seat regardless), so simply ignored for that plan.
    additionalManagerSeats: z.number().int().min(0).optional(),
    additionalOperationsSeats: z.number().int().min(0).optional(),
    additionalFinanceSeats: z.number().int().min(0).optional(),
    additionalHumanResourcesSeats: z.number().int().min(0).optional(),
    additionalCpoSeats: z.number().int().min(0).optional(),
    // Id of the SetupIntent /register's real Stripe panel confirmed
    // client-side (see lib/stripe.ts) - only present once a real Stripe
    // account is connected. Verified server-side below rather than
    // trusted as a client claim, same "never trust a client-supplied
    // security-relevant flag" convention this route already follows for
    // callerIsOwner.
    stripeSetupIntentId: z.string().optional(),
  })
  .refine((d) => d.planType !== "team" || !!d.companyName?.trim(), {
    message: "Company name is required",
    path: ["companyName"],
  });

// Self-service signup - the only path into VenueGuard that doesn't
// require an existing Owner/Manager to onboard you by hand. Creates a
// brand-new company (status: "trial", matching every other
// company-creation path - see companies.ts's POST /companies) and its
// first user. For "team" (the default), that's whichever of the four
// Management roles the "Position" field picked (defaults to "manager"
// - "admin" is reserved for the platform Owner and is never reachable
// from here). For "solo_operator", it's role: "cpo" instead - the
// company row is named after the person directly (no separate
// companyName field, same convention the Owner Console's own
// onboarding dialog uses), and since this is a brand-new company with
// no other users yet, the "exactly one CPO" hard cap (routes/users.ts's
// POST /users) can never be an issue here. Unlike admin-created users,
// the password is the one the person just typed themselves, so
// there's no initialPassword/mustChangePassword song and dance -
// they're logged straight in (a Solo Operator session then lands on
// /cpo automatically, per require-auth.tsx).
//
// Exception: if the caller already has a valid Owner session (checked
// against the real signed cookie below, not a client-supplied flag -
// this is the actual trust boundary, not just UI framing), the
// company/user are still created for real, but the Owner's own
// session is left completely untouched - no new cookie is set. This
// is what lets the Owner run through the real signup form from inside
// /owner (require-auth.tsx exempts them from the usual "already
// logged in, skip this page" redirect) without it silently logging
// them out of their own account.
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const email = parsed.data.email.toLowerCase();
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(409).json({ error: "An account with that email already exists" }); return; }

  // A card is only required for the "subscribe now" signup path, not
  // the 14-day free trial (which deliberately collects no card at all,
  // per direct product direction) - so this can't be gated on
  // isStripeConfigured() alone the way it used to be, since a trial
  // signup legitimately has no stripeSetupIntentId even with Stripe
  // connected. Whenever the frontend does send one, it's still
  // re-verified server-side rather than trusted as a client claim,
  // matching this route's existing no-client-trust posture (e.g.
  // callerIsOwner below).
  if (parsed.data.stripeSetupIntentId && !(await verifySetupIntentSucceeded(parsed.data.stripeSetupIntentId))) {
    res.status(400).json({ error: "Card validation is required" });
    return;
  }

  const isSoloOperator = parsed.data.planType === "solo_operator";
  const [company] = await db
    .insert(companiesTable)
    .values({
      name: isSoloOperator ? parsed.data.name : parsed.data.companyName!,
      planType: parsed.data.planType,
      status: "trial",
      trialEndsAt: trialEndsAtFor("trial"),
      isInternal: false,
      additionalManagerSeats: parsed.data.additionalManagerSeats ?? 0,
      additionalOperationsSeats: parsed.data.additionalOperationsSeats ?? 0,
      additionalFinanceSeats: parsed.data.additionalFinanceSeats ?? 0,
      additionalHumanResourcesSeats: parsed.data.additionalHumanResourcesSeats ?? 0,
      additionalCpoSeats: parsed.data.additionalCpoSeats ?? 0,
    })
    .returning();

  const initials = parsed.data.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(usersTable)
    .values({
      companyId: company.id,
      name: parsed.data.name,
      email,
      role: isSoloOperator ? "cpo" : parsed.data.role,
      avatarInitials: initials,
      passwordHash,
      mustChangePassword: false,
    })
    .returning();

  // Optional Team-only office at signup (see the schema comment above)
  // - skipped entirely for Solo Operator (no offices concept there) or
  // if left blank. managerId points at the account that was just
  // created, matching the "office has a manager" convention Command
  // Desk's own Offices page already follows.
  if (!isSoloOperator && parsed.data.officeCity?.trim() && parsed.data.officeCountry?.trim()) {
    await db.insert(officesTable).values({
      companyId: company.id,
      name: `${parsed.data.officeCity.trim()} HQ`,
      city: parsed.data.officeCity.trim(),
      country: parsed.data.officeCountry.trim(),
      managerId: user.id,
    });
  }

  const existingSessionId = req.signedCookies?.[SESSION_COOKIE];
  let callerIsOwner = false;
  if (existingSessionId && typeof existingSessionId === "string") {
    const [callerRow] = await db
      .select({ role: usersTable.role })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(and(eq(sessionsTable.id, existingSessionId), gt(sessionsTable.expiresAt, new Date())));
    callerIsOwner = callerRow?.role === "admin";
  }

  if (!callerIsOwner) {
    const sessionId = await createSession(user.id);
    res.cookie(SESSION_COOKIE, sessionId, cookieOptions);
  }

  res.status(201).json({ user: await formatSessionUser(user), loggedIn: !callerIsOwner });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  if (sessionId && typeof sessionId === "string") await destroySession(sessionId);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, signed: true, sameSite: "lax", secure: isProduction });
  res.status(204).end();
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  res.json({ user: await formatSessionUser(user, { companyId: req.user!.companyId, isPreviewing: req.user!.isPreviewing }) });
});

// Lets the Owner browse the Management/CPO pages for testing/QA,
// scoped to the internal test company only - never a real subscriber.
// The isInternal check here is the actual enforcement of that boundary
// (not just the Master Console UI only showing a Preview button on that
// one row) - a request for any other company's id is rejected outright.
router.post("/auth/preview/:companyId", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const companyId = Number(req.params.companyId);
  if (isNaN(companyId)) { res.status(400).json({ error: "Invalid company id" }); return; }

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
  if (!company || !company.isInternal) {
    res.status(403).json({ error: "Preview is only available for the designated internal test company" });
    return;
  }

  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  await enterPreview(sessionId, companyId);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  res.json({ user: await formatSessionUser(user!, { companyId, isPreviewing: true }) });
});

router.post("/auth/preview/exit", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  await exitPreview(sessionId);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  res.json({ user: await formatSessionUser(user!, { companyId: user!.companyId, isPreviewing: false }) });
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user || !user.passwordHash || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json({ user: await formatSessionUser(updated) });
});

export default router;
