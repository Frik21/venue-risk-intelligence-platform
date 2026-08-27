import type { Request, Response } from "express";
import { db, companiesTable } from "@workspace/db";
import { asc } from "drizzle-orm";

// Callers pass the authenticated session's companyId (req.user.companyId
// - see lib/auth.ts's requireAuth) now that real login exists. The
// fallback-to-first-company path below only fires for the rare caller
// that genuinely has no company context yet; it is NOT a substitute
// for authorization - never pass client-supplied body/query data here.
export async function resolveCompanyId(companyId: number | null | undefined): Promise<number> {
  if (companyId != null) return companyId;
  const [first] = await db.select({ id: companiesTable.id }).from(companiesTable).orderBy(asc(companiesTable.id)).limit(1);
  if (!first) throw new Error("No company exists");
  return first.id;
}

// Guards a tenant-scoped route (any route that reads/writes a table
// with a company_id column) against the Owner's companyId: null
// session. The Owner only ever sees aggregate data via the dedicated
// /companies surface (routes/companies.ts) - never raw tenant rows
// through a route like this one, so rather than silently returning
// everything or nothing, this responds 400 and returns null. Callers
// must check for null and return early without querying.
export function requireCompanyId(req: Request, res: Response): number | null {
  const companyId = req.user!.companyId;
  if (companyId == null) {
    res.status(400).json({ error: "This endpoint requires a company-scoped user" });
    return null;
  }
  return companyId;
}
