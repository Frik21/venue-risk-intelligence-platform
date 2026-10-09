// The pluggable provider registry behind Integrations (per direct
// product direction: "subscribers can insert other platforms API keys
// to connect to the management system... AlertMedia is just an
// example"). Adding a second real provider is adding one more entry to
// INTEGRATION_PROVIDERS below - nothing in the schema, routes, or
// frontend is specific to AlertMedia; routes/integrations.ts and
// pages/admin/integrations.tsx both only ever look providers up by id
// through this map.
//
// Each provider's dispatch() is the one thing that's actually
// provider-specific - a single authenticated call to that platform's
// own API, same "direct fetch, no SDK" posture lib/sms.ts/lib/push.ts
// already use for Twilio/OneSignal. Called from
// lib/notifications.ts's notifyManagement() as a third-party channel
// alongside the existing email/SMS/push fan-out, best-effort per
// company the same way those three already are.
export interface IntegrationProvider {
  id: string;
  label: string;
  description: string;
  apiKeyLabel: string;
  dispatch(apiKey: string, subject: string, message: string): Promise<void>;
}

async function dispatchAlertMedia(apiKey: string, subject: string, message: string): Promise<void> {
  const res = await fetch("https://api.alertmedia.com/v1/activities", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ subject, message }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AlertMedia send failed (${res.status}): ${detail}`);
  }
}

export const INTEGRATION_PROVIDERS: Record<string, IntegrationProvider> = {
  alertmedia: {
    id: "alertmedia",
    label: "AlertMedia",
    description: "Sends VenueGuard's panic alerts, overdue invoices, and expiring certifications into your AlertMedia activity feed as an additional notification channel.",
    apiKeyLabel: "AlertMedia API Key",
    dispatch: dispatchAlertMedia,
  },
};

export type IntegrationProviderId = keyof typeof INTEGRATION_PROVIDERS;

export function isKnownProvider(id: string): id is IntegrationProviderId {
  return id in INTEGRATION_PROVIDERS;
}
