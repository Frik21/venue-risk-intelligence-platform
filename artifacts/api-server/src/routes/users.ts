import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const UserInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "manager", "cpo"]),
  avatarInitials: z.string().optional(),
});

function formatUser(row: typeof usersTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as "admin" | "manager" | "cpo",
    avatarInitials: row.avatarInitials ?? null,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).where(eq(usersTable.active, true)).orderBy(usersTable.name);
  res.json(users.map(formatUser));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = UserInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const initials = parsed.data.avatarInitials ?? parsed.data.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const [user] = await db.insert(usersTable).values({ ...parsed.data, avatarInitials: initials }).returning();
  res.status(201).json(formatUser(user));
});

const UserUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  avatarInitials: z.string().max(4).optional(),
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

export default router;
