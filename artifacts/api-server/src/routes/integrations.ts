import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, companyIntegrationsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireCompanyId } from "../lib/resolve-company";
import { encryptApiKey, decryptApiKey, lastFourOf, isIntegrationEncryptionConfigured } from "../lib/integration-crypto";
import { INTEGRATION_PROVIDERS, isKnownProvider } from "../lib/integration-providers";

const router: IRouter = Router();

// Integrations - per direct product direction: a company connects a
// third-party platform (AlertMedia is the first real example, but the
// registry in lib/integration-providers.ts is designed so any future
// provider is an additive entry there, not a schema/route change) by
// pasting in its own API key, which then becomes an extra channel
// lib/notifications.ts's notifyManagement() dispatches through
// alongside the existing email/SMS/push fan-out.
//
// The decrypted key is NEVER sent back to the frontend after it's
// saved - every GET/list response below only ever includes
// apiKeyLastFour (e.g. "····4821"), matching this app's existing
// write-only-after-creation posture for other secrets (password
// hashes, Stripe's own "never store card details" rule).
function formatIntegration(row: typeof companyIntegrationsTable.$inferSelect, connectedByName: string | null) {
  const provider = INTEGRATION_PROVIDERS[row.provider];
  return {
    id: row.id,
    provider: row.provider,
    providerLabel: provider?.label ?? row.provider,
    apiKeyLastFour: row.apiKeyLastFour,
    enabled: row.enabled,
    connectedBy: row.connectedBy,
    connectedByName,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    lastErrorMessage: row.lastErrorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// The full provider catalog (id/label/description/apiKeyLabel, never
// dispatch - that's server-internal) so the frontend can render a
// "Connect" card for every known provider, not just ones already
// connected, and knows what to label the key input for each.
router.get("/integrations/providers", (_req, res): void => {
  res.json(
    Object.values(INTEGRATION_PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      apiKeyLabel: p.apiKeyLabel,
    })),
  );
});

router.get("/integrations", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const rows = await db
    .select({ integration: companyIntegrationsTable, connectedByName: usersTable.name })
    .from(companyIntegrationsTable)
    .leftJoin(usersTable, eq(companyIntegrationsTable.connectedBy, usersTable.id))
    .where(eq(companyIntegrationsTable.companyId, companyId));

  res.json({
    encryptionConfigured: isIntegrationEncryptionConfigured(),
    integrations: rows.map((r) => formatIntegration(r.integration, r.connectedByName)),
  });
});

const ConnectSchema = z.object({
  provider: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
});

router.post("/integrations", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = ConnectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (!isKnownProvider(parsed.data.provider)) { res.status(400).json({ error: "Unknown integration provider" }); return; }
  if (!isIntegrationEncryptionConfigured()) { res.status(503).json({ error: "Integrations are not connected yet - ask your administrator to configure INTEGRATION_ENCRYPTION_KEY" }); return; }

  const [existing] = await db
    .select({ id: companyIntegrationsTable.id })
    .from(companyIntegrationsTable)
    .where(and(eq(companyIntegrationsTable.companyId, companyId), eq(companyIntegrationsTable.provider, parsed.data.provider)));
  if (existing) { res.status(409).json({ error: "This provider is already connected - disconnect it first to use a different key" }); return; }

  const [row] = await db
    .insert(companyIntegrationsTable)
    .values({
      companyId,
      provider: parsed.data.provider,
      apiKeyEncrypted: encryptApiKey(parsed.data.apiKey),
      apiKeyLastFour: lastFourOf(parsed.data.apiKey),
      enabled: true,
      connectedBy: req.user!.id,
    })
    .returning();

  res.status(201).json(formatIntegration(row, req.user!.name));
});

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().trim().min(1).optional(),
});

router.patch("/integrations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.apiKey != null && !isIntegrationEncryptionConfigured()) {
    res.status(503).json({ error: "Integrations are not connected yet - ask your administrator to configure INTEGRATION_ENCRYPTION_KEY" });
    return;
  }

  const updates: Partial<typeof companyIntegrationsTable.$inferInsert> = {};
  if (parsed.data.enabled != null) updates.enabled = parsed.data.enabled;
  if (parsed.data.apiKey != null) {
    updates.apiKeyEncrypted = encryptApiKey(parsed.data.apiKey);
    updates.apiKeyLastFour = lastFourOf(parsed.data.apiKey);
    // A rotated key deserves a clean slate on its own error history -
    // the old key's failure (if any) says nothing about the new one.
    updates.lastErrorAt = null;
    updates.lastErrorMessage = null;
  }

  const [row] = await db
    .update(companyIntegrationsTable)
    .set(updates)
    .where(and(eq(companyIntegrationsTable.id, id), eq(companyIntegrationsTable.companyId, companyId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Integration not found" }); return; }

  const [connectedByUser] = row.connectedBy != null
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.connectedBy))
    : [];
  res.json(formatIntegration(row, connectedByUser?.name ?? null));
});

router.delete("/integrations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const [deleted] = await db
    .delete(companyIntegrationsTable)
    .where(and(eq(companyIntegrationsTable.id, id), eq(companyIntegrationsTable.companyId, companyId)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Integration not found" }); return; }
  res.sendStatus(204);
});

export default router;

// Exported for lib/notifications.ts's notifyManagement() to dispatch
// through every company's own enabled integrations as a third-party
// channel, alongside the existing email/SMS/push fan-out. Best-effort
// per integration - stamps lastUsedAt on success or lastErrorAt/
// lastErrorMessage on failure, never throws, so one misconfigured
// integration never blocks the others or the action that triggered
// this.
export async function dispatchToCompanyIntegrations(companyId: number, subject: string, message: string): Promise<void> {
  const rows = await db
    .select()
    .from(companyIntegrationsTable)
    .where(and(eq(companyIntegrationsTable.companyId, companyId), eq(companyIntegrationsTable.enabled, true)));
  if (rows.length === 0) return;

  await Promise.all(
    rows.map(async (row) => {
      const provider = INTEGRATION_PROVIDERS[row.provider];
      if (!provider) return; // a provider removed from the registry since it was connected - nothing to dispatch to
      try {
        const apiKey = decryptApiKey(row.apiKeyEncrypted);
        await provider.dispatch(apiKey, subject, message);
        await db.update(companyIntegrationsTable).set({ lastUsedAt: new Date() }).where(eq(companyIntegrationsTable.id, row.id));
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.error(`dispatchToCompanyIntegrations: ${row.provider} failed for company ${companyId}`, detail);
        await db.update(companyIntegrationsTable).set({ lastErrorAt: new Date(), lastErrorMessage: detail }).where(eq(companyIntegrationsTable.id, row.id));
      }
    }),
  );
}
