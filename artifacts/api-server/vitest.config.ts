import { defineConfig } from "vitest/config";

// Defaults match the scratch Postgres a local dev/CI run stands up for
// this suite (see .github/workflows/ci.yml) - overridable via real env
// vars so a different test database can be pointed at without editing
// this file. @workspace/db throws at import time if DATABASE_URL is
// missing, so these must be set before any test file is collected,
// not just before tests run - hence setting them here in the config
// itself rather than in a setupFile (which loads too late).
process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/venueguard_test";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-production-use";
// Keeps test output to pass/fail results - every request these tests
// make would otherwise log a pino line (see lib/logger.ts).
process.env.LOG_LEVEL ??= "silent";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Real-database tests (Tier 3, item 7 scoping decision) share one
    // Postgres connection pool - running files in parallel would let
    // one file's table truncation race another's inserts. Sequential
    // is slower but correct; this suite is small enough that it
    // doesn't matter yet.
    fileParallelism: false,
  },
});
