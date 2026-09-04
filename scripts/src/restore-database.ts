// The "tested restore process" half of the automated-backups
// Outstanding item (backup-database.ts is the other half) - a backup
// nobody has ever restored from isn't a real backup, so this exists
// specifically to be run, not just written. Shells out to pg_restore
// against a dump produced by backup-database.ts's --format=custom
// output. Destructive by nature (drops and recreates every object
// pg_restore knows how to drop before recreating it), so this refuses
// to run without an explicit --yes flag rather than a bare
// confirmation prompt that's easy to reflexively hit "y" on.
//
// Usage:
//   pnpm --filter @workspace/scripts run restore-db -- /path/to/backup.dump --yes
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const confirmed = args.includes("--yes");

if (!file) {
  console.error("Usage: restore-database <path-to-backup.dump> --yes");
  process.exitCode = 1;
} else if (!existsSync(file)) {
  console.error(`Backup file not found: ${file}`);
  process.exitCode = 1;
} else if (!confirmed) {
  console.error(
    `This will overwrite every object in the target database (${process.env.DATABASE_URL}) with the contents of ${file}.\n` +
      `Re-run with --yes once you're certain this is the database you mean to restore into.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Restoring ${file} into ${process.env.DATABASE_URL}...`);
  const result = spawnSync(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "--dbname", process.env.DATABASE_URL, file],
    { stdio: "inherit" },
  );

  if (result.error) {
    console.error("Failed to run pg_restore - is it installed and on PATH?", result.error);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    console.error(`pg_restore exited with status ${result.status}`);
    process.exitCode = result.status ?? 1;
  } else {
    console.log("Restore complete.");
  }
}
