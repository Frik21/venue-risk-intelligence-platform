// Closes the "automated production database backups + a tested
// restore process" Outstanding item's backup half (restore-database.ts
// is the other half). Shells out to pg_dump rather than reimplementing
// dump logic in JS - pg_dump is the real, battle-tested tool for this,
// already present in this environment (confirmed via `which pg_dump`
// before writing this). Custom format (-Fc) rather than plain SQL -
// compressed, and the only format pg_restore can do a selective/
// parallel restore from later if that's ever needed.
//
// "Automated" here means "a script that can be pointed at cron/a
// systemd timer/a managed platform's scheduled-job feature," not a
// scheduler this repo runs itself - there's no always-on process in
// this codebase that would be the right place to own a cron loop (the
// existing background monitors, lib/gdelt-monitor.ts/lib/checkin-
// monitor.ts, live inside the API server process and stop when it
// does, which is fine for their own polling but wrong for a backup
// that must survive a redeploy). Actually wiring a scheduler to this
// script is a deployment decision - same shape as uptime monitoring's
// "GET /healthz exists, pointing an external pinger at it is a
// deployment task" in the Notes entry right above this one.
//
// Usage:
//   pnpm --filter @workspace/scripts run backup-db
//   BACKUP_DIR=/var/backups/venueguard pnpm --filter @workspace/scripts run backup-db
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const backupDir = process.env.BACKUP_DIR ?? path.resolve(process.cwd(), "backups");
mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(backupDir, `venueguard-${timestamp}.dump`);

console.log(`Backing up database to ${outFile}...`);
const result = spawnSync("pg_dump", ["--format=custom", "--file", outFile, process.env.DATABASE_URL], {
  stdio: "inherit",
});

if (result.error) {
  console.error("Failed to run pg_dump - is it installed and on PATH?", result.error);
  process.exitCode = 1;
} else if (result.status !== 0) {
  console.error(`pg_dump exited with status ${result.status}`);
  process.exitCode = result.status ?? 1;
} else {
  const { size } = statSync(outFile);
  console.log(`Backup complete: ${outFile} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}
