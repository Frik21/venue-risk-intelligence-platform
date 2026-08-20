import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, usersTable, companiesTable } from "@workspace/db";
import { SESSION_COOKIE, createSession, destroySession, hashPassword, requireAuth, verifyPassword } from "../lib/auth";

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

async function formatSessionUser(row: typeof usersTable.$inferSelect) {
  // A non-Owner session can't hit GET /companies (Owner-only) to learn
  // its own company's name for display, so it rides along on the
  // session payload instead - the one place a name, not just an id, is
  // needed outside the aggregate-only Owner surface.
  let companyName: string | null = null;
  if (row.companyId != null) {
    const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, row.companyId));
    companyName = company?.name ?? null;
  }
  return {
    id: row.id,
    companyId: row.companyId,
    companyName,
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
  res.json({ user: await formatSessionUser(user) });
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
