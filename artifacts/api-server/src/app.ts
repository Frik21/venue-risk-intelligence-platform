import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set. Did you forget to configure it?");
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Signed so the session cookie's value can't be tampered with
// client-side - see lib/auth.ts's requireAuth for how it's read.
app.use(cookieParser(process.env.SESSION_SECRET));
// Raised from Express's 100kb default so Expenses' receipt uploads
// (a base64 data: URL stored directly on the row - see
// lib/db/src/schema/expenses.ts for why there's no separate file
// storage) fit in a normal JSON body instead of needing a multipart
// upload pipeline.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const frontendPath = path.resolve(import.meta.dirname, "..", "..", "risk-assessments", "dist", "public");
app.use(express.static(frontendPath));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Catches anything thrown/rejected in a route (Express 5 auto-forwards
// async errors here) - logs the real error server-side but only ever
// sends a generic message to the browser. Without this, Express's
// default handler dumps the raw error (which for a DB error can
// include the failed query, column names, and literal parameter
// values like client names/phone numbers) straight into the response
// body.
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) { next(err); return; }
  req.log.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

export default app;
