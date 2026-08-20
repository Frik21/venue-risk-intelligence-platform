import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, usersTable, companiesTable } from "@workspace/db";
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
