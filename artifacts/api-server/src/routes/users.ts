import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";
import { generateInitialPassword, hashPassword } from "../lib/auth";

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
  // seed a company's first Manager from the Owner Console - falling
  // back to resolveCompanyId's "first company" only if they omit it.
  const companyId =
    parsed.data.role === "admin"
      ? null
      : req.user!.role === "admin"
        ? await resolveCompanyId(parsed.data.companyId)
        : req.user!.companyId;

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
