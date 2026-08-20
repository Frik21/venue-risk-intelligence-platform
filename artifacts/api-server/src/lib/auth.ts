import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";

export const SESSION_COOKIE = "vg_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Sliding-expiry threshold - a session isn't refreshed on every single
// request, only once it's more than this old, to avoid a DB write per
// request for an otherwise-idle browser tab.
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Generates a human-typeable one-time password for admin-created
// accounts (POST /users, onboarding operational-access grant) - shown
// once in the response, never stored in plaintext. Avoids ambiguous
// characters (0/O, 1/l/I) since this is read off a screen and typed
// in by hand at first login.
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function generateInitialPassword(length = 12): string {
  let out = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  return out;
}

export async function createSession(userId: number): Promise<string> {
  const id = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  await db.insert(sessionsTable).values({
    id,
    userId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return id;
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
}

// Puts an Owner (role: "admin") session into Preview mode, scoped to
// the internal test company - see companies.isInternal's comment and
// POST /auth/preview/:companyId in routes/auth.ts, which is the only
// caller and is the one place that validates the target is actually
// flagged isInternal before this is ever called.
export async function enterPreview(sessionId: string, companyId: number): Promise<void> {
  await db.update(sessionsTable).set({ previewCompanyId: companyId }).where(eq(sessionsTable.id, sessionId));
}

export async function exitPreview(sessionId: string): Promise<void> {
  await db.update(sessionsTable).set({ previewCompanyId: null }).where(eq(sessionsTable.id, sessionId));
}

// Attaches req.user from the signed session cookie, or 401s. Mounted
// once in routes/index.ts, after the unauthenticated auth/health
// routers and before every other route - see that file for why a
// single router.use() here covers ~33 route files without touching
// each one individually.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  if (!sessionId || typeof sessionId !== "string") {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [row] = await db
    .select({
      sessionId: sessionsTable.id,
      lastSeenAt: sessionsTable.lastSeenAt,
      previewCompanyId: sessionsTable.previewCompanyId,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      companyId: usersTable.companyId,
      active: usersTable.active,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(eq(sessionsTable.id, sessionId), gt(sessionsTable.expiresAt, new Date())));

  if (!row || !row.active) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // previewCompanyId only ever gets set on an admin-role session (see
  // enterPreview) and only ever to a company with isInternal: true (see
  // POST /auth/preview/:companyId) - overriding companyId here is what
  // makes every existing tenant-scoped route work for a previewing
  // Owner with zero per-route changes.
  const isPreviewing = row.previewCompanyId != null;
  req.user = {
    id: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    companyId: isPreviewing ? row.previewCompanyId : row.companyId,
    isPreviewing,
  };

  const now = new Date();
  if (now.getTime() - row.lastSeenAt.getTime() > REFRESH_THRESHOLD_MS) {
    // Fire-and-forget - a slow/failed refresh shouldn't block the request.
    void db
      .update(sessionsTable)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(sessionsTable.id, sessionId));
  }

  next();
}

// Role-gate factory for the handful of routes that need more than
// plain authentication (e.g. companies.ts's Owner-only surface).
// Must run after requireAuth.
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
