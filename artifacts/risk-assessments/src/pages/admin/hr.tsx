import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type OnboardingOverviewRecord, type OnboardingDocument, type User } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Users as UsersIcon, type LucideIcon } from "lucide-react";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { cn } from "@/lib/utils";

// Same 30-day heads-up window and expiry math as the Expiring
// Certifications card on /admin/onboarding (Following Roadmap Tier 1,
// item 4) - duplicated rather than shared since these are two small,
// page-local helpers, matching this codebase's existing convention for
// this kind of thing (see e.g. costs.tsx/invoices.tsx's own local
// formatMoney).
const EXPIRY_WARNING_DAYS = 30;
function daysUntilExpiry(expiryDate: string): number {
  return Math.ceil((new Date(expiryDate + "T00:00:00").getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-400" />
            {title}
          </h2>
          <Link href={action.href} className="text-xs text-blue-600 hover:underline shrink-0">
            {action.label}
          </Link>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "negative" }) {
  return (
    <div className={cn("border rounded-lg p-3", tone === "negative" ? "border-red-200 bg-red-50/50" : "border-slate-100")}>
      <div className={cn("text-lg font-mono tabular-nums font-bold", tone === "negative" ? "text-red-700" : "text-slate-900")}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

// Human Resources' own scoped view - Operator Database (onboarding)
// and Users (personnel) rolled into one dashboard, per direct product
// direction, confirmed via AskUserQuestion following the same pattern
// as /admin/finance. Deliberately not office-scoped for the
// onboarding half - operator_onboarding isn't an office-scoped entity
// anywhere else in this app either (see the Dashboard Trends note in
// CLAUDE.md). role: "human_resources" lands here after login/
// registration instead of the general Management Dashboard.
export default function HrDashboard() {
  const [selectedOfficeId] = useSelectedOfficeId();
  const { data: onboarding = [], isLoading: onboardingLoading } = useQuery<OnboardingOverviewRecord[]>({
    queryKey: ["onboarding"],
    queryFn: api.onboarding.listAll,
  });
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const { data: allDocuments = [] } = useQuery<(OnboardingDocument & { operatorName: string })[]>({
    queryKey: ["onboarding-documents-all"],
    queryFn: api.onboarding.listAllDocuments,
  });

  const inProgress = onboarding.filter((o) => o.status === "in_progress").length;
  const onboarded = onboarding.filter((o) => o.status === "onboarded").length;
  const denied = onboarding.filter((o) => o.status === "denied").length;

  const expiryDays = allDocuments.filter((d) => d.expiryDate != null).map((d) => daysUntilExpiry(d.expiryDate!));
  const expiredCerts = expiryDays.filter((d) => d < 0).length;
  const expiringCerts = expiryDays.filter((d) => d >= 0 && d <= EXPIRY_WARNING_DAYS).length;

  const users = filterByOffice(allUsers.filter((u) => u.role !== "cpo" && u.role !== "admin"), selectedOfficeId);
  const activeUsers = users.filter((u) => u.active);
  const byRole = {
    manager: activeUsers.filter((u) => u.role === "manager").length,
    finance: activeUsers.filter((u) => u.role === "finance").length,
    human_resources: activeUsers.filter((u) => u.role === "human_resources").length,
    operations: activeUsers.filter((u) => u.role === "operations").length,
  };

  const loading = onboardingLoading || usersLoading;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Human Resources</h1>
        <p className="text-sm text-slate-500 mt-0.5">Operator Database and Users at a glance</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionCard title="Operator Database" icon={UserPlus} action={{ href: "/admin/onboarding", label: "View all →" }}>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Pending" value={String(inProgress)} />
              <StatTile label="Onboarded" value={String(onboarded)} />
              <StatTile label="Denied" value={String(denied)} />
              <StatTile label="Certs expiring" value={String(expiringCerts)} tone={expiringCerts > 0 ? "negative" : undefined} />
              <StatTile label="Certs expired" value={String(expiredCerts)} tone={expiredCerts > 0 ? "negative" : undefined} />
            </div>
          </SectionCard>

          <SectionCard title="Users" icon={UsersIcon} action={{ href: "/admin/users", label: "View all →" }}>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Manager" value={String(byRole.manager)} />
              <StatTile label="Operations" value={String(byRole.operations)} />
              <StatTile label="Finance" value={String(byRole.finance)} />
              <StatTile label="Human Resources" value={String(byRole.human_resources)} />
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
