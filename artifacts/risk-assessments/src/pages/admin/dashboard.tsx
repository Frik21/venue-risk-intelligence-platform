import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type DashboardSummary, type Task } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  ClipboardList,
  AlertTriangle,
  Bell,
  ListChecks,
  Users,
  FolderOpen,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { getStatusColor, getStatusLabel, getPriorityColor, timeAgo } from "@/lib/display-utils";

const TASK_STATUS_LABELS: Record<string, string> = {
  not_completed: "Not Completed",
  in_progress: "In Progress",
  completed: "Completed",
};

const QUICK_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/venues", label: "Venues", icon: Building2 },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/alerts", label: "Alert Queue", icon: Bell },
  { href: "/evidence", label: "Evidence", icon: FolderOpen },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/admin/users", label: "Users", icon: Users },
];

function StatCard({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
        <CardContent className="p-4">
          <Icon className="w-5 h-5 text-blue-600 mb-2" />
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

// Manager/Admin home - a real landing page for that persona, built
// almost entirely from api.dashboard() (GET /dashboard/summary), which
// existed on the backend but had no page consuming it before this.
// Task counts are computed client-side from api.tasks.list() since the
// summary endpoint doesn't cover Tasks.
export default function AdminDashboard() {
  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: api.dashboard,
  });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
  });

  const taskCounts: Record<string, number> = {
    not_completed: tasks.filter((t) => t.status === "not_completed").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Operations at a glance.</p>
      </div>

      {summaryLoading || tasksLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard icon={Building2} label="Venues" value={summary?.totalVenues ?? 0} href="/venues" />
          <StatCard icon={ListChecks} label="Tasks" value={tasks.length} href="/tasks" />
          <StatCard icon={Bell} label="Pending Alerts" value={summary?.pendingAlerts ?? 0} href="/alerts" />
          <StatCard icon={ClipboardList} label="Assessments" value={summary?.totalAssessments ?? 0} href="/assessments" />
          <StatCard icon={AlertTriangle} label="Incidents" value={summary?.totalIncidents ?? 0} href="/incidents" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Tasks by Status</h2>
            {tasksLoading ? (
              <Skeleton className="h-24" />
            ) : tasks.length === 0 ? (
              <p className="text-sm text-slate-400">No tasks yet.</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(taskCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{TASK_STATUS_LABELS[status] ?? status}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Assessments by Status</h2>
            {summaryLoading ? (
              <Skeleton className="h-24" />
            ) : (summary?.totalAssessments ?? 0) === 0 ? (
              <p className="text-sm text-slate-400">No assessments yet.</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(summary?.assessmentsByStatus ?? {}).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{getStatusLabel(status)}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Recent Alerts</h2>
              <Link href="/alerts" className="text-xs text-blue-600 hover:underline">
                View all
              </Link>
            </div>
            {summaryLoading ? (
              <Skeleton className="h-32" />
            ) : (summary?.recentAlerts.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-400">No alerts yet.</p>
            ) : (
              <div className="space-y-3">
                {summary!.recentAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{alert.title}</p>
                      <p className="text-xs text-slate-400">
                        {alert.venueName ?? "Unknown venue"} &middot; {timeAgo(alert.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${getPriorityColor(alert.priority)}`}
                    >
                      {alert.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Recent Assessments</h2>
              <Link href="/assessments" className="text-xs text-blue-600 hover:underline">
                View all
              </Link>
            </div>
            {summaryLoading ? (
              <Skeleton className="h-32" />
            ) : (summary?.recentAssessments.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-400">No assessments yet.</p>
            ) : (
              <div className="space-y-3">
                {summary!.recentAssessments.map((assessment) => (
                  <div key={assessment.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{assessment.title}</p>
                      <p className="text-xs text-slate-400">
                        {assessment.venueName ?? "Unknown venue"} &middot; {timeAgo(assessment.updatedAt)}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${getStatusColor(assessment.status)}`}
                    >
                      {getStatusLabel(assessment.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {QUICK_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                  <link.icon className="w-4 h-4 text-slate-500 shrink-0" />
                  {link.label}
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
