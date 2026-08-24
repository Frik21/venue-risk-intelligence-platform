// One-off migration: introduces multi-company tenancy on a database
// that may already hold real production data. Deliberately does NOT
// rely on `drizzle-kit push` to add the new NOT NULL/UNIQUE
// company_id columns directly - push has no way to backfill existing
// rows with a real value, so on a populated database it can only ask
// to either fail or truncate the table, which would destroy real
// data. Instead this script performs the entire migration itself, in
// the only order that's safe against existing rows:
//
//   1. Create `companies` and add every company_id column as nullable
//      (raw SQL, idempotent - safe to re-run).
//   2. Seed a "Default Company" + the one companyId:null Owner
//      account, then backfill every other existing row to that
//      company (existing drizzle-orm logic, unchanged).
//   3. Flip every company_id column to NOT NULL (except users, which
//      stays nullable - see below) and add the FK/unique constraints
//      the committed schema expects (raw SQL, idempotent).
//
// After this script, the live schema already matches
// lib/db/src/schema/*.ts exactly, so a subsequent `drizzle-kit push`
// for company_id is a no-op - there's no need to run push before or
// after this script.
//
// Run once:
//   pnpm --filter @workspace/scripts run backfill-company-id
import { isNull, eq, and, ne } from "drizzle-orm";
import {
  db,
  pool,
  companiesTable,
  usersTable,
  officesTable,
  companySettingsTable,
  venuesTable,
  clientsTable,
  clientActivitiesTable,
  quotesTable,
  assessmentsTable,
  assessmentVersionsTable,
  riskMatrixTable,
  auditLogTable,
  risksTable,
  incidentsTable,
  evidenceTable,
  alertsTable,
  osintEventsTable,
  venueSearchPhrasesTable,
  routesTable,
  routeFindingsTable,
  tasksTable,
  plansTable,
  venueRiskAssessmentsTable,
  taskRoutesTable,
  timesheetEntriesTable,
  expensesTable,
  taskAssignmentsTable,
  operatorOnboardingTable,
  operatorDocumentsTable,
  vendorsTable,
  vendorActivitiesTable,
  invoicesTable,
  payRunsTable,
  announcementsTable,
} from "@workspace/db";

// Every non-users table that gained a company_id column, paired with
// its table object - a flat list so backfilling is one loop rather
// than 32 hand-written UPDATE statements. `users` is handled
// separately (see main()) since admin-role rows must never get a
// companyId, and its column stays nullable forever.
const TABLES_WITH_COMPANY_ID = [
  { name: "offices", table: officesTable },
  { name: "company_settings", table: companySettingsTable },
  { name: "venues", table: venuesTable },
  { name: "clients", table: clientsTable },
  { name: "client_activities", table: clientActivitiesTable },
  { name: "quotes", table: quotesTable },
  { name: "assessments", table: assessmentsTable },
  { name: "assessment_versions", table: assessmentVersionsTable },
  { name: "risk_matrix", table: riskMatrixTable },
  { name: "audit_log", table: auditLogTable },
  { name: "risks", table: risksTable },
  { name: "incidents", table: incidentsTable },
  { name: "evidence", table: evidenceTable },
  { name: "alerts", table: alertsTable },
  { name: "osint_events", table: osintEventsTable },
  { name: "venue_search_phrases", table: venueSearchPhrasesTable },
  { name: "routes", table: routesTable },
  { name: "route_findings", table: routeFindingsTable },
  { name: "tasks", table: tasksTable },
  { name: "plans", table: plansTable },
  { name: "venue_risk_assessments", table: venueRiskAssessmentsTable },
  { name: "task_routes", table: taskRoutesTable },
  { name: "timesheet_entries", table: timesheetEntriesTable },
  { name: "expenses", table: expensesTable },
  { name: "task_assignments", table: taskAssignmentsTable },
  { name: "operator_onboarding", table: operatorOnboardingTable },
  { name: "operator_documents", table: operatorDocumentsTable },
  { name: "vendors", table: vendorsTable },
  { name: "vendor_activities", table: vendorActivitiesTable },
  { name: "invoices", table: invoicesTable },
  { name: "pay_runs", table: payRunsTable },
  { name: "announcements", table: announcementsTable },
] as const;

// company_settings is the one table where the final column is also
// UNIQUE (one settings row per company) and cascades on company
// delete, unlike every other table's RESTRICT - must match
// schema/company-settings.ts exactly.
const CASCADE_TABLES = new Set(["company_settings"]);

async function addNullableColumns() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'trial',
      additional_manager_seats INTEGER NOT NULL DEFAULT 0,
      additional_operations_seats INTEGER NOT NULL DEFAULT 0,
      additional_finance_seats INTEGER NOT NULL DEFAULT 0,
      additional_human_resources_seats INTEGER NOT NULL DEFAULT 0,
      is_internal BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER;`);
  for (const { name } of TABLES_WITH_COMPANY_ID) {
    await pool.query(`ALTER TABLE ${name} ADD COLUMN IF NOT EXISTS company_id INTEGER;`);
  }
  console.log("Step 1/3: companies table + nullable company_id columns ensured");
}

async function applyConstraints() {
  for (const { name } of TABLES_WITH_COMPANY_ID) {
    const onDelete = CASCADE_TABLES.has(name) ? "CASCADE" : "RESTRICT";
    await pool.query(`ALTER TABLE ${name} ALTER COLUMN company_id SET NOT NULL;`);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE ${name}
          ADD CONSTRAINT ${name}_company_id_companies_id_fk
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE ${onDelete};
      EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
      END $$;
    `);
  }
  // users.company_id stays nullable (admin/Owner rows), but still gets the FK.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE users
        ADD CONSTRAINT users_company_id_companies_id_fk
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
    END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE company_settings ADD CONSTRAINT company_settings_company_id_unique UNIQUE (company_id);
    EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
    END $$;
  `);
  console.log("Step 3/3: NOT NULL + FK/unique constraints applied");
}

async function main() {
  await addNullableColumns();

  let [defaultCompany] = await db.select().from(companiesTable).where(eq(companiesTable.name, "Default Company"));
  if (!defaultCompany) {
    [defaultCompany] = await db
      .insert(companiesTable)
      .values({ name: "Default Company", status: "active" })
      .returning();
  }
  console.log(`Default company: id=${defaultCompany.id}`);

  // Seeded before the users backfill below (not after) so a re-run of
  // this script can never sweep a freshly-seeded Owner row into the
  // default company - it's excluded by role, not by insertion order.
  const [existingOwner] = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
  if (!existingOwner) {
    await db.insert(usersTable).values({
      name: "VenueGuard Owner",
      email: "owner@venueguard.internal",
      role: "admin",
      avatarInitials: "VG",
      companyId: null,
    });
    console.log("Seeded initial Owner account (owner@venueguard.internal)");
  } else {
    console.log(`Owner account already exists: id=${existingOwner.id}`);
  }

  // users is handled separately from TABLES_WITH_COMPANY_ID: every
  // non-admin user gets backfilled, but admin (Owner) rows must stay
  // companyId: null forever - they're not tied to any one company.
  const usersResult = await db
    .update(usersTable)
    .set({ companyId: defaultCompany.id })
    .where(and(isNull(usersTable.companyId), ne(usersTable.role, "admin")));
  console.log(`Step 2/3: backfilled users: ${usersResult.rowCount ?? 0} rows`);

  for (const { name, table } of TABLES_WITH_COMPANY_ID) {
    const result = await db
      .update(table)
      .set({ companyId: defaultCompany.id })
      .where(isNull(table.companyId));
    console.log(`  backfilled ${name}: ${result.rowCount ?? 0} rows`);
  }

  await applyConstraints();
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
