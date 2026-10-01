import { Download, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const EXPORTED_ENTITIES = [
  "Clients (and activity log)",
  "Vendors (and activity log)",
  "Tasks",
  "Quotes",
  "Invoices",
  "Contracts",
  "Team roster (Managers, Finance, HR, Operations, CPOs - no passwords)",
  "Offices",
];

// Subscriber's own data export - Following Roadmap Tier 3, item 31
// ("reduces lock-in fear, builds trust in the platform"). A plain
// authenticated link to GET /data-export (routes/data-export.ts) - the
// browser's own session cookie carries the auth, same as any other
// same-origin navigation, so no fetch/blob plumbing is needed here.
// Scoped to this app's core business-record entities, not a literal
// dump of all 40+ tables - see that route's own comment for the full
// reasoning on what's included/excluded.
export default function DataExportPage() {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Download className="w-5 h-5 text-slate-400" /> Data Export
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Your company's own data, yours to keep - no lock-in.</p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Download every record this company owns on VenueGuard as a single JSON file. This includes:
          </p>
          <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
            {EXPORTED_ENTITIES.map((e) => <li key={e}>{e}</li>)}
          </ul>
          <p className="text-xs text-slate-400 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            Scoped strictly to your own company - this export can never include another subscriber's data.
          </p>
          <Button asChild>
            <a href="/api/data-export" download>
              <Download className="w-4 h-4 mr-1.5" /> Download My Data
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
