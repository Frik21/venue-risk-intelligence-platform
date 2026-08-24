import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { db, usersTable, companiesTable, sessionsTable } from "@workspace/db";
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

const TIERS = ["enterprise", "micro_enterprise"] as const;

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
  // needed outside the aggregate-only Owner surface.
  let companyName: string | null = null;
  if (companyId != null) {
    const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId));
    companyName = company?.name ?? null;
  }
  return {
    id: row.id,
    companyId,
    companyName,
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

const RegisterSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  tier: z.enum(TIERS).optional(),
  name: z.string().trim().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8),
});

// Self-service company signup - the only path into VenueGuard that
// doesn't require an existing Owner/Manager to onboard you by hand.
// Creates a brand-new company (status: "trial", matching every other
// company-creation path - see companies.ts's POST /companies) and its
// first user as role: "manager" (the natural "runs their own company"
// role among the four company-side roles - "admin" is reserved for
// the platform Owner and is never reachable from here). Unlike
// admin-created users, the password is the one the person just typed
// themselves, so there's no initialPassword/mustChangePassword song
// and dance - they're logged straight into their new company.
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

  const [company] = await db
    .insert(companiesTable)
    .values({ name: parsed.data.companyName, tier: parsed.data.tier ?? "enterprise", status: "trial", isInternal: false })
    .returning();

  const initials = parsed.data.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(usersTable)
    .values({
      companyId: company.id,
      name: parsed.data.name,
      email,
      role: "manager",
      avatarInitials: initials,
      passwordHash,
      mustChangePassword: false,
    })
    .returning();

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
// (not just the Owner Console UI only showing a Preview button on that
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
