import { pgTable, text, serial, boolean, timestamp, integer, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// Third-party platform integrations, per direct product direction
// ("subscribers can insert other platforms API keys to connect to the
// management system... if they already have Alert Media they can use
// the API Keys insert it and it will form part of the alerts system as
// an example"). Deliberately a pluggable shape, not a table/route
// bespoke to AlertMedia - "provider" is a free-standing text column
// matched against a small backend registry (routes/integrations.ts's
// INTEGRATION_PROVIDERS), so a second real provider is an additive
// registry entry, never a schema/migration change. One row per
// company per provider (unique constraint below) - a company connects
// each provider at most once, matching how every other connect-later
// integration in this app (Stripe, Twilio, SMTP) is a single set of
// credentials, not several.
//
// The API key itself is NEVER stored in plaintext - apiKeyEncrypted
// holds an AES-256-GCM ciphertext (lib/integration-crypto.ts), keyed
// off a new INTEGRATION_ENCRYPTION_KEY env var, same "real wiring, env
// var optional until deployed" connect-later posture as every other
// secret-adjacent feature in this app. apiKeyLastFour is the one
// sliver of the real key ever kept in the clear - purely so the UI can
// show "····1234" to confirm which key is connected without the
// backend ever re-sending the real value after save, same
// "write-only after creation" posture this app's other secrets (e.g.
// password hashes) already follow.
export const companyIntegrationsTable = pgTable("company_integrations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "restrict" }),
  provider: text("provider").notNull(), // matched against INTEGRATION_PROVIDERS' registry keys, e.g. "alertmedia"
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  apiKeyLastFour: text("api_key_last_four").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  connectedBy: integer("connected_by").references(() => usersTable.id, { onDelete: "set null" }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_company_integrations_company_id").on(table.companyId),
  unique("company_integrations_company_id_provider_unique").on(table.companyId, table.provider),
]);

export const insertCompanyIntegrationSchema = createInsertSchema(companyIntegrationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyIntegration = z.infer<typeof insertCompanyIntegrationSchema>;
export type CompanyIntegration = typeof companyIntegrationsTable.$inferSelect;
