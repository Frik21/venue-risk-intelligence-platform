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
      // session, but overridden to the internal test company's id while
      // the Owner is in Preview mode (see previewCompanyId below), so
      // every existing tenant-scoped route (resolveCompanyId/
      // requireCompanyId) works unchanged with no per-route awareness
      // of preview mode at all.
      companyId: number | null;
      // True only when companyId above came from an active Preview
      // session rather than the user's own real company assignment.
      isPreviewing: boolean;
      // The EFFECTIVE company's plan type - null for a plain Owner
      // session (companyId null, not previewing). "solo_operator"
      // drives the Management-route block in lib/auth.ts's requireAuth.
      planType: "team" | "solo_operator" | null;
    };
  }
}
