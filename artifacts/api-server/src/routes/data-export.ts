import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  clientsTable,
  clientActivitiesTable,
  vendorsTable,
  vendorActivitiesTable,
  tasksTable,
  quotesTable,
  invoicesTable,
  contractsTable,
  usersTable,
  officesTable,
  companiesTable,
} from "@workspace/db";
import { requireCompanyId } from "../lib/resolve-company";

const router: IRouter = Router();

// Subscriber's own data export - Following Roadmap Tier 3, item 31
// ("reduces lock-in fear, builds trust in the platform"). Deliberately
// scoped to this app's core business-record entities (the things a
// subscriber would actually think of as "my data" and want portable) -
// not a literal dump of all 40+ tables (operational/working data like
// checkins, field incident reports, risk assessments, audit logs,
// etc. is left out) - flagged as a scoping decision, not an
// oversight. A single JSON file (one key per entity) rather than a
// multi-file CSV bundle - simplest honest version that's still
// genuinely useful, matching this session's own "the honest, simple
// version" complexity budget for UI-adjacent features. Every query is
// scoped through req.user's own companyId - this never returns
// another tenant's data under any circumstance, same posture as every
// other route in this app.
router.get("/data-export", async (req, res): Promise<void> => {
  const companyId = requireCompanyId(req, res);
  if (companyId == null) return;

  const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId));

  const [clients, clientActivities, vendors, vendorActivities, tasks, quotes, invoices, contracts, users, offices] = await Promise.all([
    db.select().from(clientsTable).where(eq(clientsTable.companyId, companyId)),
    db.select().from(clientActivitiesTable).where(eq(clientActivitiesTable.companyId, companyId)),
    db.select().from(vendorsTable).where(eq(vendorsTable.companyId, companyId)),
    db.select().from(vendorActivitiesTable).where(eq(vendorActivitiesTable.companyId, companyId)),
    db.select().from(tasksTable).where(eq(tasksTable.companyId, companyId)),
    db.select().from(quotesTable).where(eq(quotesTable.companyId, companyId)),
    db.select().from(invoicesTable).where(eq(invoicesTable.companyId, companyId)),
    db.select().from(contractsTable).where(eq(contractsTable.companyId, companyId)),
    db.select().from(usersTable).where(eq(usersTable.companyId, companyId)),
    db.select().from(officesTable).where(eq(officesTable.companyId, companyId)),
  ]);

  // passwordHash is the one field from usersTable that must never
  // leave the server in any form, exported data included - everything
  // else about "my own team roster" is fair game.
  const safeUsers = users.map(({ passwordHash: _passwordHash, ...rest }) => rest);

  const bundle = {
    exportedAt: new Date().toISOString(),
    company: company?.name ?? null,
    clients,
    clientActivities,
    vendors,
    vendorActivities,
    tasks,
    quotes,
    invoices,
    contracts,
    users: safeUsers,
    offices,
  };

  const filename = `venueguard-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.json(bundle);
});

export default router;
