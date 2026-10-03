import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable, companiesTable } from "@workspace/db";

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

// Resolves what an Owner (role: "admin") session's effective company
// should be - always and only the one company flagged
// companies.isInternal (the designated Test Company, set via the
// toggle on /owner), computed live on every call rather than stored on
// the session. Per direct product direction ("remove this completely
// ... always show my Test Company's data, no Preview concept at all")
// - this replaces the earlier enterPreview/exitPreview session-toggle
// mechanism entirely: there's nothing to start or stop anymore, an
// Owner session just always resolves this way. requireAuth calls this
// for every admin-role request; routes/auth.ts's login does the same
// so the very first login response already reflects it, with no
// separate client-side action needed.
export async function resolveAdminCompany(): Promise<{ companyId: number | null; planType: "team" | "solo_operator" | null }> {
  const [testCompany] = await db
    .select({ id: companiesTable.id, planType: companiesTable.planType })
    .from(companiesTable)
    .where(eq(companiesTable.isInternal, true));
  return { companyId: testCompany?.id ?? null, planType: (testCompany?.planType as "team" | "solo_operator" | undefined) ?? null };
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
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      companyId: usersTable.companyId,
      active: usersTable.active,
      ownPlanType: companiesTable.planType,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .leftJoin(companiesTable, eq(companiesTable.id, usersTable.companyId))
    .where(and(eq(sessionsTable.id, sessionId), gt(sessionsTable.expiresAt, new Date())));

  if (!row || !row.active) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // An Owner (role: "admin") session always resolves to the designated
  // Test Company automatically (resolveAdminCompany) - no per-session
  // toggle, nothing to enter or exit. Every other role uses its own
  // real companyId straight off the users row.
  let companyId = row.companyId;
  let isPreviewing = false;
  let planType = (row.ownPlanType as "team" | "solo_operator" | null) ?? null;
  if (row.role === "admin") {
    const admin = await resolveAdminCompany();
    companyId = admin.companyId;
    planType = admin.planType;
    isPreviewing = admin.companyId != null;
  }
  req.user = {
    id: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    companyId,
    isPreviewing,
    planType,
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

// Granular per-role permissions - Following Roadmap Tier 3, item 30
// ("today Finance/Operations/HR all have the same looseness on Command
// Desk; this locks that down as the company grows"). Deliberately
// narrow in two ways, both intentional given the roadmap item's own
// framing as a later, as-the-company-grows concern rather than a
// launch blocker: (1) only gates writes (POST/PATCH/DELETE) - every
// GET stays open to every Management role, same looseness as before,
// so nothing that only reads data (dashboards, cross-referencing a
// task while reviewing an invoice) regresses; (2) applied only to a
// curated set of the most clearly domain-specific write routes
// (per-router, see routes/index.ts), not a full per-endpoint
// permission matrix for all ~33 routers - that would be a much larger,
// riskier change than this pass's scope. Manager and Admin (Owner,
// including Preview mode) always pass regardless of allowedRoles -
// Manager stays the "runs the company" unrestricted role it already
// is everywhere else in this app, and Admin is VenueGuard's own
// platform role.
export function restrictWritesToRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === "GET") { next(); return; }
    const role = req.user?.role;
    if (role === "admin" || role === "manager" || (role != null && allowedRoles.includes(role))) { next(); return; }
    res.status(403).json({ error: "Your role doesn't have permission to make changes here." });
  };
}

// A "solo_operator" plan company (see companies.ts's schema comment) is
// a single freelance CPO's own subscription - Operators Note only, per
// direct product direction, no Management side at all. This is the
// server-side enforcement of that boundary (not just require-auth.tsx's
// frontend redirect, which alone would still let a direct API call
// through). Allowlist rather than denylist - built from the actual set
// of endpoints the CPO Operational Canvas (pages/dashboard.tsx) calls,
// so a router nobody audited can't accidentally leak Management data to
// a solo operator by omission. Mounted once in routes/index.ts, right
// after requireAuth, ahead of the ~33 route routers.
const CPO_SURFACE_PATH_PREFIXES = [
  "/weather",
  "/traffic",
  "/announcements",
  "/users",
  "/tasks",
  "/alerts",
  "/venues",
  "/plans",
  "/countries",
  "/support-tickets",
  "/checkins",
  "/emergency-info",
  "/field-incident-reports",
  "/after-action-reports",
  "/task-equipment",
  "/travel-logistics",
  "/task-location-pings",
  "/availability-requests",
];

export function blockSoloOperatorFromManagement(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.planType !== "solo_operator") { next(); return; }
  if (CPO_SURFACE_PATH_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    next();
    return;
  }
  res.status(403).json({ error: "This account is on the Solo Operator plan and can only access Operators Note" });
}
