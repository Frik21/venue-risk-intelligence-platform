import { db, companiesTable } from "@workspace/db";
import { asc } from "drizzle-orm";

// No real auth exists yet to resolve "which company is this request
// for" server-side (same situation as officeId's client-side-only
// scoping) - unlike officeId though, company_id is NOT NULL on every
// tenant table, so every insert needs a real value regardless. Callers
// pass companyId explicitly once the frontend's company switcher
// exists (see lib/company-scope.ts); until then, and for any caller
// that omits it, this resolves to the first company - identical
// fallback to settings.ts's own resolveCompanyId, single source of
// truth for "the default company" once one exists.
export async function resolveCompanyId(companyId: number | null | undefined): Promise<number> {
  if (companyId != null) return companyId;
  const [first] = await db.select({ id: companiesTable.id }).from(companiesTable).orderBy(asc(companiesTable.id)).limit(1);
  if (!first) throw new Error("No company exists");
  return first.id;
}
