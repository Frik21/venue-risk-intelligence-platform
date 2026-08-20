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
      // null only for role: "admin" (the platform Owner) - see
      // lib/db/src/schema/users.ts's companyId comment.
      companyId: number | null;
    };
  }
}
