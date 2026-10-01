// Real push notifications, built now and connected later - Platform
// Maturity Roadmap, Tier 1, item 1. Closes the scope item 29's own
// "Real notifications" entry explicitly deferred ("scoped to email +
// SMS, not push... a much bigger, separate build"). Same connect-later
// pattern as Stripe/Sentry/SMTP/Twilio - the wiring is real and
// complete, but no OneSignal credentials are set anywhere in this
// environment yet.
//
// Uses OneSignal (a hosted push service, not raw Web Push/VAPID
// directly) - chosen over rolling a bare Web Push implementation
// because OneSignal also covers native mobile push for free if
// Operators Note is ever wrapped as a real app later (Tier 1, item 2
// on this same roadmap), without a second integration. Calls
// OneSignal's REST API directly via fetch (no SDK) - a single
// authenticated POST, same reasoning lib/sms.ts already gave for
// Twilio.
//
// Targeting is by "external user id" - OneSignal's own mechanism for
// correlating a subscribed browser/device back to an app-level user
// id, set client-side via `OneSignal.login(String(user.id))` once a
// session exists (see main.tsx). This file never touches raw push
// subscriptions/device tokens itself - that's OneSignal's job once a
// browser has opted in.
const ONESIGNAL_API_BASE = "https://onesignal.com/api/v1";

function getCredentials(): { appId: string; apiKey: string } | null {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  return appId && apiKey ? { appId, apiKey } : null;
}

export function isPushConfigured(): boolean {
  return getCredentials() !== null;
}

export function getOneSignalAppId(): string | null {
  return process.env.ONESIGNAL_APP_ID ?? null;
}

export async function sendPushNotification(userIds: number[], title: string, message: string): Promise<void> {
  const creds = getCredentials();
  if (!creds) throw new Error("Push notifications are not connected yet");
  if (userIds.length === 0) return;

  const res = await fetch(`${ONESIGNAL_API_BASE}/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${creds.apiKey}`,
    },
    body: JSON.stringify({
      app_id: creds.appId,
      include_external_user_ids: userIds.map(String),
      channel_for_external_user_ids: "push",
      headings: { en: title },
      contents: { en: message },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Push send failed (${res.status}): ${detail}`);
  }
}
