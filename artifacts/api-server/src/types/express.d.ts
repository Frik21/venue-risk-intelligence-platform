// Populated by requireAuth (see lib/auth.ts) once a session cookie has
// been verified - every route registered after the auth gate in
// routes/index.ts can assume req.user exists.
declare namespace Express {
  export interface Request {
    user?: {
      id: number;
      name: string;
      email: string;
      role: string;
      // The EFFECTIVE company for this request - null for a plain Owner
      // session with no Test Company designated yet, otherwise resolved
      // live on every request to whichever company is flagged
      // companies.isInternal (see lib/auth.ts's resolveAdminCompany), so
      // every existing tenant-scoped route (resolveCompanyId/
      // requireCompanyId) works unchanged with no per-route awareness of
      // this at all. A regular company-scoped user's own companyId,
      // unaffected.
      companyId: number | null;
      // True only for an Owner (role: "admin") session, and only once
      // companyId above resolved to a real Test Company.
      isPreviewing: boolean;
      // The EFFECTIVE company's plan type - null for a plain Owner
      // session (companyId null, no Test Company designated).
      // "solo_operator" drives the Management-route block in
      // lib/auth.ts's requireAuth.
      planType: "team" | "solo_operator" | null;
    };
  }
}
