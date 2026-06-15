import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const UserInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "analyst", "reviewer", "viewer"]),
  avatarInitials: z.string().optional(),
});

function formatUser(row: typeof usersTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as "admin" | "analyst" | "reviewer" | "viewer",
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

export default router;
