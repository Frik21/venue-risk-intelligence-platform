import { Router, type IRouter } from "express";
import { getOneSignalAppId, isPushConfigured } from "../lib/push";

const router: IRouter = Router();

// Lets Command Desk know at runtime whether a real OneSignal account is
// connected, and if so what App ID to initialize the browser SDK with
// (public/safe to expose, same posture as Stripe's publishable key) -
// zero frontend redeploy needed once real credentials are set on the
// backend. Authenticated-only (registered after requireAuth in
// routes/index.ts) since push is Management-only for now (see
// lib/notifications.ts) - no CPO session ever needs this.
router.get("/push/config", (_req, res): void => {
  res.json({ enabled: isPushConfigured(), appId: getOneSignalAppId() });
});

export default router;
