import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Real error tracking, built now and connected later - same pattern as
// the backend's lib/error-tracking.ts (and, before that, Stripe/the
// currency engine): a no-op until VITE_SENTRY_DSN is actually set at
// build time, so this degrades to nothing rather than needing its own
// feature flag once a real DSN exists.
const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, environment: import.meta.env.MODE });
}

createRoot(document.getElementById("root")!).render(<App />);
