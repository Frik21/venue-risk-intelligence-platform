import app from "./app";
import { logger } from "./lib/logger";
import { startGdeltMonitor } from "./lib/gdelt-monitor";
import { startCheckinMonitor } from "./lib/checkin-monitor";
import { initErrorTracking, captureError } from "./lib/error-tracking";

// Real error tracking, built now and connected later - see lib/error-
// tracking.ts. A no-op until SENTRY_DSN is set. Initialized here
// (before app.listen) rather than inside app.ts, so it's armed before
// the background monitors below start too - a crash in one of those
// (outside any Express request, so app.ts's own error handler would
// never see it) is exactly the kind of failure this is meant to catch.
initErrorTracking();
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  captureError(err);
});
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
  captureError(reason);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startGdeltMonitor();
  startCheckinMonitor();
});
