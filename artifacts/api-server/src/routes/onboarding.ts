import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, operatorOnboardingTable, operatorDocumentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { ONBOARDING_CHECKLIST_ITEMS, DOCUMENT_TYPES } from "../lib/onboarding-checklist";

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

  const [existingUser] = await db.select({ id: usersTable.id, active: usersTable.active }).from(usersTable).where(eq(usersTable.email, parsed.data.email));

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
  const [record] = await db
    .insert(operatorOnboardingTable)
    .values({
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
router.get("/onboarding", async (_req, res): Promise<void> => {
  const cpos = await db.select().from(usersTable).where(eq(usersTable.role, "cpo"));
  let records = await db.select().from(operatorOnboardingTable);

  const linkedUserIds = new Set(records.map((r) => r.userId).filter((id): id is number => id != null));
  // Only auto-provisions active CPOs - a removed operator (DELETE
  // /onboarding/:id deactivates their linked account, see below) must
  // stay gone rather than being silently recreated here on the very
  // next load just because their (now-inactive) user row still has
  // role "cpo" and no onboarding row of its own.
  const unlinked = cpos.filter((c) => c.active && !linkedUserIds.has(c.id));
  if (unlinked.length > 0) {
    const inserted = await db
      .insert(operatorOnboardingTable)
      .values(unlinked.map((c) => ({
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

  if (parsed.data.granted && userId == null) {
    const [dupe] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, existing.candidateEmail));
    if (dupe) { res.status(409).json({ error: `A user with email "${existing.candidateEmail}" already exists` }); return; }

    const initials = existing.candidateName.trim().split(/\s+/).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    const [user] = await db
      .insert(usersTable)
      .values({ name: existing.candidateName, email: existing.candidateEmail, role: "cpo", avatarInitials: initials })
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

  res.json(formatOnboarding(updated, userName));
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

  const [record] = await db.select({ id: operatorOnboardingTable.id }).from(operatorOnboardingTable).where(eq(operatorOnboardingTable.id, id));
  if (!record) { res.status(404).json({ error: "Onboarding record not found" }); return; }

  const typeLabel = DOCUMENT_TYPES.find((t) => t.value === parsed.data.documentType)?.label ?? "Document";
  const [doc] = await db
    .insert(operatorDocumentsTable)
    .values({
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
