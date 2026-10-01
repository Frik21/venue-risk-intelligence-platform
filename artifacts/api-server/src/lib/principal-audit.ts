import { db, principalAccessLogTable } from "@workspace/db";

// Audit logging for Principal Protection Profile access - Platform
// Maturity Roadmap, Tier 2, item 4. One row per principal per access -
// a single `GET` that returns three principals logs three rows, since
// the point is "who looked at THIS person's record," not "who hit
// this endpoint." Fire-and-forget by design: a failure here must never
// block the actual read/write it's logging, same posture as
// lib/notifications.ts's best-effort sends.
export async function logPrincipalAccess(
  companyId: number,
  userId: number,
  action: "viewed" | "created" | "updated" | "deleted",
  principals: { id: number; name: string }[],
  accessedViaTaskId?: number,
): Promise<void> {
  if (principals.length === 0) return;
  try {
    await db.insert(principalAccessLogTable).values(
      principals.map((p) => ({
        companyId,
        principalId: p.id,
        principalName: p.name,
        userId,
        action,
        accessedViaTaskId: accessedViaTaskId ?? null,
      })),
    );
  } catch (e) {
    console.error("logPrincipalAccess failed", e);
  }
}
