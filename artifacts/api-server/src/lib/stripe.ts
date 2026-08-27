import Stripe from "stripe";

// Real Stripe wiring, built now and connected later - per direct
// product direction ("build the real capability now and connect it
// late[r]... same as we did previously"), same pattern already used for
// the currency engine's Frankfurter API (lib/currency.ts): the code path
// is real and complete, but STRIPE_SECRET_KEY/STRIPE_PUBLISHABLE_KEY
// aren't set anywhere in this environment yet. Deliberately NOT a
// fail-fast startup check like DATABASE_URL/SESSION_SECRET (lib/db/src/
// index.ts) - going live with real billing is still a separate, later
// decision, so every caller checks isStripeConfigured() first and
// degrades to /register's existing non-functional stub panel instead of
// the server refusing to boot.
let client: Stripe | null | undefined;

function getStripeClient(): Stripe | null {
  if (client !== undefined) return client;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  client = secretKey ? new Stripe(secretKey) : null;
  return client;
}

export function isStripeConfigured(): boolean {
  return getStripeClient() !== null && !!process.env.STRIPE_PUBLISHABLE_KEY;
}

export function getStripePublishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY ?? null;
}

// Validates a card is real and chargeable without charging or storing
// it. No Stripe Customer is created and the resulting PaymentMethod is
// never attached to anything or referenced again once the browser
// round-trip completes - per direct product direction, VenueGuard must
// never keep card details on file, so every purchase (this signup flow,
// and any future one) re-collects and re-validates a card each time
// rather than saving one for reuse. usage: "on_session" (rather than the
// API default of "off_session") reflects that honestly - this
// PaymentMethod is never intended to be charged again later.
export async function createCardValidationSetupIntent(): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe is not connected yet");
  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["card"],
    usage: "on_session",
  });
  if (!setupIntent.client_secret) throw new Error("Stripe did not return a client secret");
  return setupIntent.client_secret;
}

// Server-side verification that a SetupIntent the frontend claims to
// have confirmed actually succeeded, called from POST /auth/register
// before creating the account - mirrors this codebase's existing
// "never trust a client-supplied claim about a security boundary"
// convention (e.g. routes/auth.ts's own callerIsOwner check reads the
// signed session cookie rather than a client flag).
export async function verifySetupIntentSucceeded(setupIntentId: string): Promise<boolean> {
  const stripe = getStripeClient();
  if (!stripe) return false;
  try {
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    return setupIntent.status === "succeeded";
  } catch {
    return false;
  }
}
