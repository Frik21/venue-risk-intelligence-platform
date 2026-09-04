import * as Sentry from "@sentry/node";

// Real error tracking, built now and connected later - same
// build-now-connect-later pattern already used for Stripe (lib/
// stripe.ts) and the currency engine's Frankfurter API: the wiring is
// real and complete, but SENTRY_DSN isn't set anywhere in this
// environment yet. Deliberately NOT a fail-fast startup check like
// DATABASE_URL/SESSION_SECRET (lib/db/src/index.ts) - going live with
// real error monitoring is a separate, later decision, so every caller
// checks isErrorTrackingConfigured() first (or just calls captureError,
// which is a silent no-op when unconfigured) rather than the server
// refusing to boot.
let initialized = false;

export function initErrorTracking(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) return;
  Sentry.init({ dsn, environment: process.env.NODE_ENV ?? "production" });
  initialized = true;
}

export function isErrorTrackingConfigured(): boolean {
  return !!process.env.SENTRY_DSN;
}

// Safe to call unconditionally from any catch site - a no-op until
// SENTRY_DSN is actually set, same shape as this app's other
// connect-later integrations degrading gracefully rather than needing
// every call site to check first.
export function captureError(err: unknown): void {
  if (!initialized) return;
  Sentry.captureException(err);
}
