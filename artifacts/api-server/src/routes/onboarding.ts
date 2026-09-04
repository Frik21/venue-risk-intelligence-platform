import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, operatorOnboardingTable, operatorDocumentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { ONBOARDING_CHECKLIST_ITEMS, DOCUMENT_TYPES } from "../lib/onboarding-checklist";
import { resolveCompanyId, requireCompanyId } from "../lib/resolve-company";
import { generateInitialPassword, hashPassword } from "../lib/auth";
import { checkSeatAvailable } from "./companies";

const router: IRouter = Router();
const DOCUMENT_TYPE_VALUES = DOCUMENT_TYPES.map((t) => t.value) as [string, ...string[]];
const ONBOARDING_STATUSES = ["in_progress", "onboarded", "denied"] as const;

// A mutually-exclusive group (see group on OnboardingChecklistItem)
// only counts as a single item toward completion - checking any one
// member of the group satisfies it, rather than requiring every item
// in it (which would be impossible once they're mutually exclusive).
function computeProgress(checklist: { key: string; checked: boolean }[]) {
  const groupChecked: Record<string, boolean> = {};
  const countedGroups = new Set<string>();
  let checkedCount = 0;
  let totalCount = 0;

  for (const item of checklist) {
    const group = ONBOARDING_CHECKLIST_ITEMS.find((i) => i.key === item.key)?.group;
    if (group) {
      groupChecked[group] = (groupChecked[group] ?? false) || item.checked;
      if (!countedGroups.has(group)) {
        countedGroups.add(group);
        totalCount += 1;
      }
    } else {
      totalCount += 1;
      if (item.checked) checkedCount += 1;
    }
  }
  for (const checked of Object.values(groupChecked)) {
    if (checked) checkedCount += 1;
  }
  return { checkedCount, totalCount };
}

function formatOnboarding(row: typeof operatorOnboardingTable.$inferSelect, userName?: string | null) {
  const stored = (row.checklist as Record<string, boolean>) ?? {};
  const checklist = ONBOARDING_CHECKLIST_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    checked: stored[item.key] === true,
  }));
  const { checkedCount, totalCount } = computeProgress(checklist);
  return {
    id: row.id,
    userId: row.userId,
    userName: userName ?? row.candidateName,
    status: row.status as (typeof ONBOARDING_STATUSES)[number],
    checklist,
    checkedCount,
    totalCount,
    operationalAccessGrantedAt: row.operationalAccessGrantedAt?.toISOString() ?? null,
    lastVettedAt: row.lastVettedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatDocument(row: typeof operatorDocumentsTable.$inferSelect) {
  return {
    id: row.id,
    operatorOnboardingId: row.operatorOnboardingId,
    documentType: row.documentType as (typeof DOCUMENT_TYPES)[number]["value"],
    label: row.label,
    filename: row.filename ?? null,
    fileDataUrl: row.fileDataUrl ?? null,
    expiryDate: row.expiryDate ?? null,
    verified: row.verified,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const CreateOnboardingSchema = z.object({
  companyId: z.number().int().nullable().optional(),
  name: z.string().min(1),
  email: z.string().email(),
});

// Creates a pending onboarding candidate - deliberately does NOT
// create a real user account yet (see the schema comment on
// operatorOnboardingTable for why). The account only gets created
// once a Manager grants operational access via
// PATCH /onboarding/:id/operational-access (which itself requires
// Approved status first - see that route).
router.post("/onboarding", async (req, res): Promise<void> => {
  const parsed = CreateOnboardingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existingUser] = await db.select({ id: usersTable.id, active: usersTable.active, companyId: usersTable.companyId }).from(usersTable).where(eq(usersTable.email, parsed.data.email));

  // A genuinely live account already owns this email - block, same as
  // before.
  if (existingUser?.active) { res.status(409).json({ error: `A user with email "${parsed.data.email}" already exists` }); return; }

  // operatorOnboardingTable.userId is unique - if this inactive user
  // is somehow still linked to a live onboarding record (shouldn't
  // happen via the normal Remove flow, which deletes that row
  // outright, but could if a user was deactivated some other way),
  // linking a second record to them would trip that constraint.
  if (existingUser) {
    const [linkedRecord] = await db.select({ id: operatorOnboardingTable.id }).from(operatorOnboardingTable).where(eq(operatorOnboardingTable.userId, existingUser.id));
    if (linkedRecord) { res.status(409).json({ error: `A user with email "${parsed.data.email}" already exists` }); return; }
  }

  // email is UNIQUE on usersTable, so a *removed* operator (DELETE
  // /onboarding/:id deactivates rather than deletes their account, to
  // avoid cascading that delete into their historical tasks/
  // timesheets - see that route) leaves an inactive user row still
  // holding their email. Re-onboarding under the same email used to
  // hit the block above forever, even though the operator record
  // itself was gone - re-link to that same (still inactive) user
  // instead of trying to create a second row with an email the
  // database won't allow to duplicate. operational-access grant
  // reactivates it exactly like it already does for any other
  // pre-linked user.
  const companyId = await resolveCompanyId(req.user!.companyId);
  const [record] = await db
    .insert(operatorOnboardingTable)
    .values({
      companyId,
      candidateName: parsed.data.name,
      candidateEmail: parsed.data.email,
      checklist: {},
      userId: existingUser?.id ?? null,
    })
    .returning();

  res.status(201).json(formatOnboarding(record));
});

// Every operator's onboarding progress, most recently added first -
// powers the Operator Onboarding overview page. Also auto-provisions
// onboarding rows (defaulted to Approved + operational access already
// granted) for any CPO user that somehow has none yet - e.g. one
// created directly from the Users page rather than through Add
// Operator, which already has a real, active account so neither gate
// applies to them.
router.get("/onboarding", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;
  const cpos = await db.select().from(usersTable).where(and(eq(usersTable.role, "cpo"), eq(usersTable.companyId, companyId)));
  let records = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.companyId, companyId));

  const linkedUserIds = new Set(records.map((r) => r.userId).filter((id): id is number => id != null));
  // Only auto-provisions active CPOs - a removed operator (DELETE
  // /onboarding/:id deactivates their linked account, see below) must
  // stay gone rather than being silently recreated here on the very
  // next load just because their (now-inactive) user row still has
  // role "cpo" and no onboarding row of its own.
  const unlinked = cpos.filter((c) => c.active && !linkedUserIds.has(c.id));
  if (unlinked.length > 0) {
    const fallbackCompanyId = companyId;
    const inserted = await db
      .insert(operatorOnboardingTable)
      .values(unlinked.map((c) => ({
        companyId: c.companyId ?? fallbackCompanyId,
        userId: c.id,
        candidateName: c.name,
        candidateEmail: c.email,
        checklist: {},
        status: "onboarded" as const,
        operationalAccessGrantedAt: new Date(),
      })))
      .returning();
    records = [...records, ...inserted];
  }
  records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const userMap: Record<number, (typeof cpos)[number]> = {};
  for (const u of cpos) userMap[u.id] = u;

  const documents = await db.select({ operatorOnboardingId: operatorDocumentsTable.operatorOnboardingId }).from(operatorDocumentsTable);
  const docCountMap: Record<number, number> = {};
  for (const d of documents) docCountMap[d.operatorOnboardingId] = (docCountMap[d.operatorOnboardingId] ?? 0) + 1;

  res.json(
    records.map((r) => ({
      ...formatOnboarding(r, r.userId != null ? userMap[r.userId]?.name ?? null : null),
      documentCount: docCountMap[r.id] ?? 0,
    })),
  );
});

router.get("/onboarding/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [record] = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!record) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  let userName: string | null = null;
  if (record.userId != null) {
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, record.userId));
    userName = user?.name ?? null;
  }

  res.json(formatOnboarding(record, userName));
});

const ChecklistUpdateSchema = z.object({
  key: z.string(),
  checked: z.boolean(),
});

router.patch("/onboarding/:id/checklist", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ChecklistUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const itemDef = ONBOARDING_CHECKLIST_ITEMS.find((item) => item.key === parsed.data.key);
  if (!itemDef) {
    res.status(400).json({ error: `Unknown checklist item "${parsed.data.key}"` });
    return;
  }

  const [existing] = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!existing) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  const nextChecklist = { ...(existing.checklist as Record<string, boolean>), [parsed.data.key]: parsed.data.checked };
  // Mutually-exclusive group (Freelancer vs Long term contract) -
  // checking one clears the rest of its group.
  if (parsed.data.checked && itemDef.group) {
    for (const other of ONBOARDING_CHECKLIST_ITEMS) {
      if (other.group === itemDef.group && other.key !== itemDef.key) nextChecklist[other.key] = false;
    }
  }

  const [updated] = await db
    .update(operatorOnboardingTable)
    .set({ checklist: nextChecklist })
    .where(eq(operatorOnboardingTable.id, id))
    .returning();

  res.json(formatOnboarding(updated));
});

const StatusUpdateSchema = z.object({
  status: z.enum(ONBOARDING_STATUSES),
});

// Manager-set decision - purely the vetting outcome, NOT what creates
// or activates the account (see PATCH .../operational-access for
// that). Denying is the one exception: it always cuts off access
// immediately, revoking any operational access grant and deactivating
// the account if one exists, regardless of how it got there.
router.patch("/onboarding/:id/status", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = StatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!existing) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  const denying = parsed.data.status === "denied";
  if (denying && existing.userId != null) {
    await db.update(usersTable).set({ active: false }).where(eq(usersTable.id, existing.userId));
  }

  const [updated] = await db
    .update(operatorOnboardingTable)
    .set({ status: parsed.data.status, operationalAccessGrantedAt: denying ? null : existing.operationalAccessGrantedAt })
    .where(eq(operatorOnboardingTable.id, id))
    .returning();

  const userName = existing.userId != null
    ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, existing.userId)))[0]?.name ?? null
    : null;

  res.json(formatOnboarding(updated, userName));
});

// Re-vetting/background-check renewal cadence - Following Roadmap
// Tier 3, item 22. Explicit action a Manager takes whenever a
// background check is actually redone, distinct from the checklist's
// one-time "background_check" item checked during initial onboarding
// (see the schema's own comment on lastVettedAt) - can be called
// repeatedly over an operator's tenure.
router.patch("/onboarding/:id/mark-vetted", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!existing) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  const [updated] = await db
    .update(operatorOnboardingTable)
    .set({ lastVettedAt: new Date() })
    .where(eq(operatorOnboardingTable.id, id))
    .returning();

  const userName = existing.userId != null
    ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, existing.userId)))[0]?.name ?? null
    : null;

  res.json(formatOnboarding(updated, userName));
});

const OperationalAccessSchema = z.object({
  granted: z.boolean(),
});

// This is the actual gate on being usable as a CPO - Operator View,
// task assignment, etc. all read from the users table, so this is
// where the real account gets created (on first grant) and
// activated/deactivated (on every later toggle). Deliberately
// separate from the Approved/Pending/Denied decision above: an
// operator can be fully vetted and Approved but still have no real
// access until a Manager takes this explicit second step.
router.patch("/onboarding/:id/operational-access", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = OperationalAccessSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!existing) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  if (parsed.data.granted && existing.status !== "onboarded") {
    res.status(400).json({ error: "Operator must be Approved before granting operational access" });
    return;
  }

  let userId = existing.userId;
  let initialPassword: string | null = null;

  if (parsed.data.granted && userId == null) {
    const [dupe] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, existing.candidateEmail));
    if (dupe) { res.status(409).json({ error: `A user with email "${existing.candidateEmail}" already exists` }); return; }

    // Seat-limit enforcement - this is the CPO-creation path for a Team
    // company (a Solo Operator's own CPO is never onboarded through
    // here - Operator Database is a Management-side page, unreachable
    // for that plan). Only meaningful the first time a company crosses
    // its base+additional CPO seat count.
    const seatCheck = await checkSeatAvailable(existing.companyId, "cpo");
    if (!seatCheck.ok) {
      res.status(403).json({
        error: `CPO seat limit reached (${seatCheck.used}/${seatCheck.limit} used) - buy additional CPO seats on the Users page before granting operational access.`,
      });
      return;
    }

    const initials = existing.candidateName.trim().split(/\s+/).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    // Admin-generated, shown once - same as POST /users, no email
    // infrastructure exists yet to send a real invite.
    initialPassword = generateInitialPassword();
    const passwordHash = await hashPassword(initialPassword);
    const [user] = await db
      .insert(usersTable)
      .values({
        name: existing.candidateName,
        email: existing.candidateEmail,
        role: "cpo",
        avatarInitials: initials,
        companyId: existing.companyId,
        passwordHash,
        mustChangePassword: true,
      })
      .returning();
    userId = user.id;
  } else if (userId != null) {
    await db.update(usersTable).set({ active: parsed.data.granted }).where(eq(usersTable.id, userId));
  }

  const [updated] = await db
    .update(operatorOnboardingTable)
    .set({ operationalAccessGrantedAt: parsed.data.granted ? new Date() : null, userId })
    .where(eq(operatorOnboardingTable.id, id))
    .returning();

  const userName = userId != null
    ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)))[0]?.name ?? null
    : null;

  res.json({ ...formatOnboarding(updated, userName), initialPassword });
});

// Fully removes the candidate/operator - their documents cascade-delete
// with them (see onDelete: "cascade" on operator_documents' FK). If a
// real CPO account was already created for them (operational access
// was granted at some point), that account is deactivated rather than
// deleted outright - deleting it could break FK references from their
// existing task assignments/timesheet history elsewhere, the same
// reason denying an operator (PATCH .../status) only deactivates too.
router.delete("/onboarding/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!existing) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  if (existing.userId != null) {
    await db.update(usersTable).set({ active: false }).where(eq(usersTable.id, existing.userId));
  }
  await db.delete(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));

  res.sendStatus(204);
});

router.get("/onboarding/:id/documents", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select()
    .from(operatorDocumentsTable)
    .where(eq(operatorDocumentsTable.operatorOnboardingId, id))
    .orderBy(desc(operatorDocumentsTable.createdAt));

  res.json(rows.map(formatDocument));
});

const DocumentInputSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPE_VALUES),
  label: z.string().max(200).optional(),
  filename: z.string().max(500).optional(),
  fileDataUrl: z.string().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate must be YYYY-MM-DD").optional(),
});

router.post("/onboarding/:id/documents", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = DocumentInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [record] = await db.select({ id: operatorOnboardingTable.id, companyId: operatorOnboardingTable.companyId }).from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!record) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  const typeLabel = DOCUMENT_TYPES.find((t) => t.value === parsed.data.documentType)?.label ?? "Document";
  const [doc] = await db
    .insert(operatorDocumentsTable)
    .values({
      companyId: record.companyId,
      operatorOnboardingId: id,
      documentType: parsed.data.documentType,
      label: parsed.data.label || typeLabel,
      filename: parsed.data.filename,
      fileDataUrl: parsed.data.fileDataUrl,
      expiryDate: parsed.data.expiryDate,
    })
    .returning();

  res.status(201).json(formatDocument(doc));
});

// Company-wide, across every operator - powers the Expiring
// Certifications view on /admin/onboarding and the HR dashboard's own
// stat tiles (Following Roadmap Tier 1, item 4: "certification/license
// expiry tracking per operator per jurisdiction"). Every other document
// route above is scoped to one operator's own onboarding record; this
// is the one place a Manager sees expiry across the whole roster at
// once, which is the entire point - a lapsed PSIRA/SIA registration
// buried in one operator's own file is easy to miss until it's already
// a problem.
router.get("/onboarding-documents", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const docs = await db.select().from(operatorDocumentsTable).where(eq(operatorDocumentsTable.companyId, companyId)).orderBy(desc(operatorDocumentsTable.createdAt));
  const onboardingIds = [...new Set(docs.map((d) => d.operatorOnboardingId))];
  const records = onboardingIds.length
    ? await db
        .select({ id: operatorOnboardingTable.id, candidateName: operatorOnboardingTable.candidateName, userId: operatorOnboardingTable.userId })
        .from(operatorOnboardingTable)
        .where(inArray(operatorOnboardingTable.id, onboardingIds))
    : [];
  const userIds = records.map((r) => r.userId).filter((id): id is number => id != null);
  const users = userIds.length ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds)) : [];
  const userNameMap: Record<number, string> = {};
  for (const u of users) userNameMap[u.id] = u.name;
  const operatorNameMap: Record<number, string> = {};
  for (const r of records) operatorNameMap[r.id] = (r.userId != null ? userNameMap[r.userId] : undefined) ?? r.candidateName;

  res.json(docs.map((d) => ({ ...formatDocument(d), operatorName: operatorNameMap[d.operatorOnboardingId] ?? "Unknown operator" })));
});

const DocumentUpdateSchema = DocumentInputSchema.partial().extend({
  verified: z.boolean().optional(),
});

router.patch("/onboarding-documents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = DocumentUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [doc] = await db.update(operatorDocumentsTable).set(parsed.data).where(eq(operatorDocumentsTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  res.json(formatDocument(doc));
});

router.delete("/onboarding-documents/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(operatorDocumentsTable).where(eq(operatorDocumentsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Document not found" }); return; }

  res.sendStatus(204);
});

export default router;
