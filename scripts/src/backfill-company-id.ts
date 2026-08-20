// One-off migration: introduces multi-company tenancy. Seeds a single
// "Default Company" that absorbs every pre-existing row (this app was
// single-tenant until now, so nothing else could plausibly own that
// data), and seeds one admin-role Owner account with companyId: null
// (admin was just repurposed into the platform-owner role and removed
// from the company-side Users page picker - without this seed there'd
// be no way to reach the new Owner page at all).
//
// Run once, after `pnpm --filter @workspace/db run push` has added the
// nullable company_id columns, and before flipping them to NOT NULL:
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

// Every table that gained a company_id column, paired with its table
// object - a flat list so backfilling is one loop rather than 31
// hand-written UPDATE statements. `users` is handled separately (see
// main()) since admin-role rows must never get a companyId.
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

async function main() {
  let [defaultCompany] = await db.select().from(companiesTable).where(eq(companiesTable.name, "Default Company"));
  if (!defaultCompany) {
    [defaultCompany] = await db
      .insert(companiesTable)
      .values({ name: "Default Company", tier: "enterprise", status: "active" })
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
  console.log(`  backfilled users: ${usersResult.rowCount ?? 0} rows`);

  for (const { name, table } of TABLES_WITH_COMPANY_ID) {
    const result = await db
      .update(table)
      .set({ companyId: defaultCompany.id })
      .where(isNull(table.companyId));
    console.log(`  backfilled ${name}: ${result.rowCount ?? 0} rows`);
  }
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
