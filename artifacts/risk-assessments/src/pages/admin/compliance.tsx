import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type OnboardingOverviewRecord, type OnboardingDocument, type TimesheetEntry, type FieldIncidentReport } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, IdCard, Clock, MessageSquareWarning, type LucideIcon } from "lucide-react";
import { formatDate } from "@/lib/display-utils";

// Same 30-day heads-up window and expiry math as the Expiring
// Certifications card on /admin/onboarding and the Certs tiles on
// /admin/hr - duplicated rather than shared, matching this codebase's
// existing convention for small page-local helpers.
const EXPIRY_WARNING_DAYS = 30;
function daysUntilExpiry(expiryDate: string): number {
  return Math.ceil((new Date(expiryDate + "T00:00:00").getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function RollupCard({
  title,
  icon: Icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  action: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-400" />
            {title}
            {count > 0 && (
              <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">{count}</span>
            )}
          </h2>
          <Link href={action.href} className="text-xs text-blue-600 hover:underline shrink-0">
            {action.label}
          </Link>
        </div>
        {count === 0 ? (
          <p className="text-sm text-slate-400">Nothing here right now.</p>
        ) : (
          <div className="space-y-2">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

// One compliance/risk rollup, instead of five separate pages - Following
// Roadmap Tier 2, item 10. Every row here already exists somewhere else
// in Command Desk (Operator Database, Tasks, Alerts) - this page adds
// nothing new to the data model, it's purely a cross-cutting view over
// four things a Manager would otherwise have to go check separately:
// expiring certs and pending onboarding (both Operator Database/HR),
// unapproved timesheets (Tasks/Finance), and unreviewed field incident
// reports (Alerts). Deliberately not office-scoped - none of its four
// source lists are office-scoped anywhere else in this app either
// (operator_onboarding isn't, and timesheet/field-incident-report
// company-wide endpoints carry no officeId to filter by).
export default function ComplianceRollup() {
  const { data: onboarding = [], isLoading: onboardingLoading } = useQuery<OnboardingOverviewRecord[]>({
    queryKey: ["onboarding"],
    queryFn: api.onboarding.listAll,
  });
  const { data: allDocuments = [], isLoading: documentsLoading } = useQuery<(OnboardingDocument & { operatorName: string })[]>({
    queryKey: ["onboarding-documents-all"],
    queryFn: api.onboarding.listAllDocuments,
  });
  const { data: timesheetEntries = [], isLoading: timesheetLoading } = useQuery<TimesheetEntry[]>({
    queryKey: ["timesheet-all"],
    queryFn: api.timesheet.listAll,
  });
  const { data: fieldIncidentReports = [], isLoading: incidentsLoading } = useQuery<FieldIncidentReport[]>({
    queryKey: ["field-incident-reports"],
    queryFn: api.fieldIncidentReports.list,
  });

  const loading = onboardingLoading || documentsLoading || timesheetLoading || incidentsLoading;

  const expiringDocs = allDocuments
    .filter((d) => d.expiryDate != null)
    .map((d) => ({ ...d, days: daysUntilExpiry(d.expiryDate!) }))
    .filter((d) => d.days <= EXPIRY_WARNING_DAYS)
    .sort((a, b) => a.days - b.days);

  const pendingOnboarding = onboarding.filter((o) => o.status === "in_progress");

  const unapprovedTimesheets = timesheetEntries
    .filter((e) => !e.approved)
    .sort((a, b) => a.date.localeCompare(b.date));

  const unreviewedIncidents = fieldIncidentReports
    .filter((r) => r.reviewedAt == null)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-slate-400" /> Compliance Rollup
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Expiring certs, pending onboarding, unapproved timesheets, and unreviewed incidents - one view instead of four separate pages.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RollupCard title="Expiring/Expired Certifications" icon={IdCard} count={expiringDocs.length} action={{ href: "/admin/onboarding", label: "Operator Database →" }}>
            {expiringDocs.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <span className="text-slate-700">{d.operatorName}</span>
                  <span className="text-slate-400"> · {d.label}</span>
                </div>
                <span className={d.days < 0 ? "text-red-700 font-medium text-xs shrink-0" : "text-amber-700 font-medium text-xs shrink-0"}>
                  {d.days < 0 ? `Expired ${Math.abs(d.days)}d ago` : `${d.days}d left`}
                </span>
              </div>
            ))}
          </RollupCard>

          <RollupCard title="Pending Onboarding" icon={IdCard} count={pendingOnboarding.length} action={{ href: "/admin/onboarding", label: "Operator Database →" }}>
            {pendingOnboarding.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                <span className="text-slate-700">{o.userName ?? "Unnamed candidate"}</span>
                <span className="text-xs text-slate-400 shrink-0">{o.checkedCount}/{o.totalCount} checklist items</span>
              </div>
            ))}
          </RollupCard>

          <RollupCard title="Unapproved Timesheets" icon={Clock} count={unapprovedTimesheets.length} action={{ href: "/tasks", label: "Tasks →" }}>
            {unapprovedTimesheets.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <span className="text-slate-700">{e.userName ?? "Unknown"}</span>
                  <span className="text-slate-400"> · {formatDate(e.date)}{e.taskTitle ? ` · ${e.taskTitle}` : ""}</span>
                </div>
                <span className="text-xs text-slate-500 tabular-nums shrink-0">{e.hoursWorked}h</span>
              </div>
            ))}
          </RollupCard>

          <RollupCard title="Unreviewed Field Incident Reports" icon={MessageSquareWarning} count={unreviewedIncidents.length} action={{ href: "/alerts", label: "Alerts →" }}>
            {unreviewedIncidents.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <span className="text-slate-700">{r.cpoName ?? "Unknown"}</span>
                  <span className="text-slate-400"> · {r.summary.slice(0, 60)}{r.summary.length > 60 ? "…" : ""}</span>
                </div>
                <span className="text-xs text-slate-500 shrink-0 uppercase">{r.severity}</span>
              </div>
            ))}
          </RollupCard>
        </div>
      )}
    </div>
  );
}
