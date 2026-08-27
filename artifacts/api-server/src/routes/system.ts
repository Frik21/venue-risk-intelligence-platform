import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

const startedAt = Date.now();

// Owner-only - this is the Owner's own technical status view of the
// platform (the "IT" tile on /quick-access), not a subscriber-facing
// feature and not a separate IT role/account - per direct product
// direction, confirmed this is for the Owner themselves. Applied
// per-route (not a router-wide router.use()) because this router is
// mounted with no path prefix in routes/index.ts - a blanket
// router.use(requireRole(...)) here would intercept every request that
// falls through to this router in the chain, not just /system/*, 403ing
// non-admins on any route registered later that isn't matched earlier.

// Deliberately modest - real error tracking/uptime monitoring (Sentry
// or similar) is still on CLAUDE.md's Outstanding/Roadmap and doesn't
// exist yet, so this only reports what's actually checkable today: is
// the database reachable, and basic process/runtime facts. Not a
// substitute for real monitoring, just honest visibility until that's
// built.
router.get("/system/status", requireRole("admin"), async (_req, res): Promise<void> => {
  let dbStatus: "ok" | "error" = "ok";
  let dbError: string | null = null;
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : "Unknown error";
  }

  res.json({
    dbStatus,
    dbError,
    serverUptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV ?? "unknown",
    serverTime: new Date().toISOString(),
  });
});

export default router;
