// Real push notifications, built now and connected later - Platform
// Maturity Roadmap, Tier 1, item 1. Companion to the backend's
// lib/push.ts - loads OneSignal's browser SDK via a plain <script>
// tag (no npm package wrapper is meaningfully simpler than this) and
// logs the session's own user id in as OneSignal's "external user
// id", so the backend can later target this exact browser by that
// same id (routes/push.ts, lib/notifications.ts). A no-op whenever
// the backend reports push isn't connected yet - same connect-later
// degrade as every other integration in this app (Stripe, Sentry).
import { api } from "./api";

declare global {
  interface Window {
    OneSignalDeferred?: ((OneSignal: any) => void | Promise<void>)[];
  }
}

const ONESIGNAL_SCRIPT_ID = "onesignal-sdk";
const ONESIGNAL_SCRIPT_SRC = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

let initPromise: Promise<void> | null = null;

function loadOneSignalScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(ONESIGNAL_SCRIPT_ID)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = ONESIGNAL_SCRIPT_ID;
    script.src = ONESIGNAL_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load OneSignal SDK"));
    document.head.appendChild(script);
  });
}

function ensureInitialized(appId: string): Promise<void> {
  if (!initPromise) {
    initPromise = loadOneSignalScript().then(
      () =>
        new Promise<void>((resolve) => {
          window.OneSignalDeferred = window.OneSignalDeferred ?? [];
          window.OneSignalDeferred.push(async (OneSignal) => {
            await OneSignal.init({ appId });
            resolve();
          });
        }),
    );
  }
  return initPromise;
}

// Called once a Management-side session is known (see lib/auth.tsx) -
// a CPO session never calls this, push notifications are
// Management-only for now (lib/notifications.ts's notifyManagement()).
// Best-effort: a failure here (an ad blocker, notifications denied,
// no network) must never break login or anything else in the app.
export async function registerPushUser(userId: number): Promise<void> {
  try {
    const { enabled, appId } = await api.push.config();
    if (!enabled || !appId) return;
    await ensureInitialized(appId);
    window.OneSignalDeferred!.push((OneSignal) => OneSignal.login(String(userId)));
  } catch (e) {
    console.error("registerPushUser failed", e);
  }
}
