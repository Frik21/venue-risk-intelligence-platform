import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";

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

export default app;
