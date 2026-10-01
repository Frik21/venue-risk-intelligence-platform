import { db, pool, companiesTable, usersTable, sessionsTable } from "@workspace/db";
import { hashPassword } from "../lib/auth";

export type TestUserRole = "admin" | "manager" | "cpo" | "finance" | "human_resources" | "operations";

// Shared fixtures for the real-Postgres test suite (Platform Maturity
// Roadmap, Tier 3, item 7) - scoped to this app's shared infrastructure
// (auth, tenant isolation, seat limits), not a full-coverage suite.
// Every test file calls resetDb() before each test so tests never leak
// state into each other, same isolation guarantee a real production
// request gets from always being scoped to its own company.
export async function resetDb(): Promise<void> {
  // RESTART IDENTITY so inserted ids are predictable across tests;
  // CASCADE so every table referencing these (clients, tasks,
  // principals, sessions, etc.) is cleared too without having to list
  // every one by hand here.
  await pool.query("TRUNCATE TABLE companies, users RESTART IDENTITY CASCADE");
}

export async function createCompany(overrides: Partial<typeof companiesTable.$inferInsert> = {}) {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: "Test Company", ...overrides })
    .returning();
  return company;
}

export async function createUser(
  companyId: number | null,
  role: TestUserRole,
  overrides: Partial<typeof usersTable.$inferInsert> & { password?: string } = {},
) {
  const { password = "correct-horse-battery-staple", ...rest } = overrides;
  const [user] = await db
    .insert(usersTable)
    .values({
      name: "Test User",
      email: `${role}-${Math.random().toString(36).slice(2)}@test.local`,
      role,
      companyId,
      active: true,
      passwordHash: await hashPassword(password),
      ...rest,
    })
    .returning();
  return { user, password };
}

// Inserts a session row directly (bypassing the real login flow/rate
// limiter) and returns a Cookie header value a supertest agent can set
// to act as that user - the same signed-cookie shape lib/auth.ts's
// createSession produces, since cookie-parser's signing is a pure
// HMAC of the value and SESSION_SECRET (set identically in
// vitest.config.ts), not request-specific state.
export async function sessionCookie(userId: number): Promise<string> {
  const crypto = await import("crypto");
  const id = crypto.randomBytes(32).toString("base64url");
  await db.insert(sessionsTable).values({ id, userId, expiresAt: new Date(Date.now() + 86_400_000) });
  // Express's res.cookie(..., {signed: true}) (routes/auth.ts's own
  // cookieOptions) produces `s:` + cookie-signature's sign(value,
  // secret) - replicated here rather than pulling in a dependency,
  // since it's one HMAC line and this is the only place that needs it.
  const hmac = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(id).digest("base64").replace(/=+$/, "");
  return `vg_session=s:${id}.${hmac}`;
}
