// Real SMS sending, built now and connected later - Following Roadmap
// Tier 3, item 29. Same connect-later pattern as Stripe/email/Sentry:
// the wiring is real and complete, but no Twilio credentials are set
// anywhere in this environment yet. Unlike email (SMTP is a genuine
// cross-provider standard), there's no equivalent generic protocol for
// SMS - Twilio is the de facto standard this targets directly, same
// reasoning that picked Stripe over a "generic payment processor"
// abstraction. Calls Twilio's REST API directly via fetch (no SDK) -
// it's a single authenticated POST, not worth a new dependency for.
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function getCredentials(): { accountSid: string; authToken: string; fromNumber: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  return accountSid && authToken && fromNumber ? { accountSid, authToken, fromNumber } : null;
}

export function isSmsConfigured(): boolean {
  return getCredentials() !== null;
}

export async function sendSms(to: string, body: string): Promise<void> {
  const creds = getCredentials();
  if (!creds) throw new Error("SMS is not connected yet");

  const res = await fetch(`${TWILIO_API_BASE}/Accounts/${creds.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
    },
    body: new URLSearchParams({ To: to, From: creds.fromNumber, Body: body }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`SMS send failed (${res.status}): ${detail}`);
  }
}
