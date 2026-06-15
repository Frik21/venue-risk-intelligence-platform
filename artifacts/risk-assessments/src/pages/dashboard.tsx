import { useQuery } from "@tanstack/react-query";
import { api, type DashboardSummary } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Building2,
  ClipboardList,
  AlertTriangle,
  Bell,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { getStatusColor, getStatusLabel, getPriorityColor, getRiskRatingLabel, getRiskRatingColor, timeAgo } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

function StatCard({ title, value, icon: Icon, color, href }: { title: string; value: number; icon: React.ElementType; color: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">{title}</p>
              <p className="text-3xl font-bold mt-1">{value}</p>
            </div>
            <div className={cn("p-2.5 rounded-lg", color)}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardSummary>({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="w-10 h-10 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
        <p className="text-muted-foreground">Please try refreshing the page.</p>
      </div>
    );
  }

  const statusGroups = [
    { key: "draft", label: "Draft", color: "bg-slate-400" },
    { key: "under_review", label: "Under Review", color: "bg-amber-400" },
    { key: "approved", label: "Approved", color: "bg-green-500" },
    { key: "monitoring", label: "Monitoring", color: "bg-blue-500" },
    { key: "review_required", label: "Review Required", color: "bg-orange-500" },
    { key: "escalated", label: "Escalated", color: "bg-red-500" },
    { key: "archived", label: "Archived", color: "bg-slate-300" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Operations Dashboard</h1>
        <p className="text-slate-500 mt-0.5 text-sm">Physical Venue Risk Assessment Intelligence Platform</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard title="Venues" value={data?.totalVenues ?? 0} icon={Building2} color="bg-blue-100 text-blue-600" href="/venues" />
            <StatCard title="Assessments" value={data?.totalAssessments ?? 0} icon={ClipboardList} color="bg-indigo-100 text-indigo-600" href="/assessments" />
            <StatCard title="Incidents" value={data?.totalIncidents ?? 0} icon={AlertTriangle} color="bg-orange-100 text-orange-600" href="/incidents" />
            <StatCard title="Pending Alerts" value={data?.pendingAlerts ?? 0} icon={Bell} color="bg-red-100 text-red-600" href="/alerts" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent assessments */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Assessments</CardTitle>
                <Link href="/assessments" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : !data?.recentAssessments?.length ? (
                <div className="text-center py-10 text-slate-400">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No assessments yet</p>
                  <Link href="/assessments/new" className="text-sm text-blue-600 hover:underline mt-1 block">Create first assessment →</Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.recentAssessments.map((a) => (
                    <Link key={a.id} href={`/assessments/${a.id}`}>
                      <div className="px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900 truncate text-sm">{a.title}</div>
                            <div className="text-xs text-slate-400 mt-0.5 truncate">
                              {a.venueName ? `${a.venueName}, ${a.venueCity}` : "No venue"} · {timeAgo(a.updatedAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {a.overallRating && (
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase", getRiskRatingColor(a.overallRating))}>
                                {getRiskRatingLabel(a.overallRating)}
                              </span>
                            )}
                            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", getStatusColor(a.status))}>
                              {getStatusLabel(a.status)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Status distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Assessment Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-32" /> : (
                <div className="space-y-2.5">
                  {statusGroups.map(({ key, label, color }) => {
                    const count = data?.assessmentsByStatus?.[key] ?? 0;
                    const total = data?.totalAssessments ?? 1;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={key}>
                        <div className="flex justify-between text-xs text-slate-600 mb-1">
                          <span>{label}</span>
                          <span className="font-mono font-medium">{count}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent alerts */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Alerts</CardTitle>
                <Link href="/alerts" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[1,2].map(i => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : !data?.recentAlerts?.length ? (
                <div className="py-6 text-center text-sm text-slate-400">No recent alerts</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.recentAlerts.map((alert) => (
                    <div key={alert.id} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 mt-0.5", getPriorityColor(alert.priority))}>
                          {alert.priority}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-800 truncate">{alert.title}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{alert.venueName} · {timeAgo(alert.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
