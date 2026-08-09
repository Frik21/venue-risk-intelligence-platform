import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type DashboardSummary, type Task, type Venue, type User, type AssessmentSummary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { NewTaskDialog } from "@/components/new-task-dialog";
import {
  Building2,
  ClipboardList,
  AlertTriangle,
  Bell,
  ListChecks,
  AlertOctagon,
  Activity,
  CalendarClock,
  ClipboardCheck,
  MapPinned,
  Rss,
  Sparkles,
  Plus,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { getStatusColor, getStatusLabel, getPriorityColor, timeAgo, formatDate } from "@/lib/display-utils";

const TASK_STATUS_LABELS: Record<string, string> = {
  not_completed: "Not Completed",
  in_progress: "In Progress",
  completed: "Completed",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  not_completed: "text-red-700 bg-red-50 border-red-200",
  in_progress: "text-amber-700 bg-amber-50 border-amber-200",
  completed: "text-green-700 bg-green-50 border-green-200",
};

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

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: { href: string; label: string };
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
          {action && (
            <Link href={action.href} className="text-xs text-blue-600 hover:underline shrink-0">
              {action.label}
            </Link>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ComingSoonCard({ title, icon: Icon, description }: { title: string; icon: LucideIcon; description: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <Icon className="w-4 h-4 text-slate-400" />
          {title}
        </h2>
        <div className="flex flex-col items-center justify-center text-center py-8 px-4 border border-dashed border-slate-200 rounded-lg">
          <Icon className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 max-w-xs">{description}</p>
          <Badge variant="secondary" className="mt-3 text-[10px] uppercase">Coming Soon</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-slate-900 truncate">{task.title}</p>
        <p className="text-xs text-slate-400">
          {task.venueName ?? "No venue"}
          {task.assignedToName && ` · ${task.assignedToName}`}
          {task.dueDate && ` · Due ${formatDate(task.dueDate)}`}
        </p>
      </div>
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${TASK_STATUS_COLORS[task.status] ?? ""}`}
      >
        {TASK_STATUS_LABELS[task.status] ?? task.status}
      </span>
    </div>
  );
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Management Dashboard - the Manager/Admin persona's landing page,
// restructured to the fixed 9-section main-screen layout from direct
// product direction (a 20-item full information architecture, with
// only these 9 immediately visible to avoid clutter - the rest live
// on their own pages, reachable via the sidebar). Everything below is
// computed from data that already exists (Tasks, Assessments, Alerts,
// the dashboard summary) - "Operational Footprint" and "Ask
// Intelligence" have no backing feature yet, so they show an honest
// "Coming Soon" state rather than fake data.
export default function AdminDashboard() {
  const [showNewTask, setShowNewTask] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: api.dashboard,
  });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
  });
  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery<AssessmentSummary[]>({
    queryKey: ["assessments"],
    queryFn: api.assessments.list,
  });
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });

  const today = startOfToday();

  const overdueTasks = tasks.filter((t) => t.status !== "completed" && t.dueDate && new Date(t.dueDate) < today);
  const attentionAlerts = (summary?.recentAlerts ?? []).filter(
    (a) => a.status === "pending" && (a.priority === "high" || a.priority === "critical"),
  );
  const attentionAssessments = assessments.filter((a) => a.status === "review_required" || a.status === "escalated");
  const attentionCount = overdueTasks.length + attentionAlerts.length + attentionAssessments.length;

  const activeOps = tasks.filter((t) => t.status === "in_progress");
  const upcomingOps = tasks
    .filter((t) => t.status === "not_completed")
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 6);

  const activePool = tasks.filter((t) => t.status !== "completed");
  const readyCount = activePool.filter((t) => t.planSubmittedAt).length;
  const readinessPct = activePool.length === 0 ? 100 : Math.round((readyCount / activePool.length) * 100);
  const tasksMissingPlan = activePool.filter((t) => !t.planSubmittedAt).slice(0, 5);

  const footprintByCountry = Object.entries(
    venues.reduce<Record<string, { total: number; cities: Set<string> }>>((acc, v) => {
      const entry = (acc[v.country] ??= { total: 0, cities: new Set() });
      entry.total += 1;
      entry.cities.add(v.city);
      return acc;
    }, {}),
  ).sort((a, b) => b[1].total - a[1].total);
  const officeCount = venues.filter((v) => v.venueType === "office").length;

  const activityFeed = [
    ...(summary?.recentAlerts ?? []).map((a) => ({
      key: `alert-${a.id}`,
      time: a.createdAt,
      icon: Bell,
      label: a.title,
      meta: a.venueName ?? "Unknown venue",
      badge: a.priority,
      badgeClass: getPriorityColor(a.priority),
    })),
    ...(summary?.recentAssessments ?? []).map((a) => ({
      key: `assessment-${a.id}`,
      time: a.updatedAt,
      icon: ClipboardList,
      label: a.title,
      meta: a.venueName ?? "Unknown venue",
      badge: getStatusLabel(a.status),
      badgeClass: getStatusColor(a.status),
    })),
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {showNewTask && <NewTaskDialog venues={venues} users={users} onClose={() => setShowNewTask(false)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Management Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Operations at a glance.</p>
        </div>
        <Button onClick={() => setShowNewTask(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Task
        </Button>
      </div>

      {/* 1. Executive Overview */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Executive Overview</h2>
        {summaryLoading || tasksLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}
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
      </div>

      {/* 2. Requires Attention */}
      <SectionCard title="Requires Attention" icon={AlertOctagon}>
        {summaryLoading || tasksLoading || assessmentsLoading ? (
          <Skeleton className="h-24" />
        ) : attentionCount === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            All clear - nothing needs attention right now.
          </div>
        ) : (
          <div className="space-y-3">
            {overdueTasks.map((t) => (
              <div key={`overdue-${t.id}`} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{t.title}</p>
                  <p className="text-xs text-slate-400">{t.venueName ?? "No venue"} · {t.assignedToName ?? "Unassigned"}</p>
                </div>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 text-red-700 bg-red-50 border-red-200">
                  Overdue{t.dueDate && ` · ${formatDate(t.dueDate)}`}
                </span>
              </div>
            ))}
            {attentionAlerts.map((a) => (
              <div key={`alert-${a.id}`} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{a.title}</p>
                  <p className="text-xs text-slate-400">{a.venueName ?? "Unknown venue"} · Pending alert</p>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${getPriorityColor(a.priority)}`}>
                  {a.priority}
                </span>
              </div>
            ))}
            {attentionAssessments.map((a) => (
              <div key={`assessment-${a.id}`} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{a.title}</p>
                  <p className="text-xs text-slate-400">{a.venueName ?? "Unknown venue"}</p>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${getStatusColor(a.status)}`}>
                  {getStatusLabel(a.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 3. Active Operations */}
      <SectionCard title="Active Operations" icon={Activity} action={{ href: "/tasks", label: "View all" }}>
        {tasksLoading ? (
          <Skeleton className="h-24" />
        ) : activeOps.length === 0 ? (
          <p className="text-sm text-slate-400">No operations in progress right now.</p>
        ) : (
          <div className="space-y-3">{activeOps.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} />)}</div>
        )}
      </SectionCard>

      {/* 4. Upcoming Operations */}
      <SectionCard title="Upcoming Operations" icon={CalendarClock} action={{ href: "/tasks", label: "View all" }}>
        {tasksLoading ? (
          <Skeleton className="h-24" />
        ) : upcomingOps.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing scheduled.</p>
        ) : (
          <div className="space-y-3">{upcomingOps.map((t) => <TaskRow key={t.id} task={t} />)}</div>
        )}
      </SectionCard>

      {/* 5. Risk Assessments */}
      <SectionCard title="Risk Assessments" icon={ClipboardList} action={{ href: "/assessments", label: "View all" }}>
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
      </SectionCard>

      {/* 6. Operational Plan Readiness */}
      <SectionCard title="Operational Plan Readiness" icon={ClipboardCheck}>
        {tasksLoading ? (
          <Skeleton className="h-24" />
        ) : activePool.length === 0 ? (
          <p className="text-sm text-slate-400">No active or upcoming operations to plan for.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-slate-600">{readyCount} of {activePool.length} operations have a submitted plan</span>
                <span className="font-semibold text-slate-900">{readinessPct}%</span>
              </div>
              <Progress value={readinessPct} />
            </div>
            {tasksMissingPlan.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Missing a plan</p>
                {tasksMissingPlan.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{t.title}</p>
                      <p className="text-xs text-slate-400">{t.venueName ?? "No venue"} · {t.assignedToName ?? "Unassigned"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* 7. Operational Footprint */}
      <SectionCard title="Operational Footprint" icon={MapPinned} action={{ href: "/venues", label: "View all" }}>
        {venues.length === 0 ? (
          <p className="text-sm text-slate-400">No venues yet.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {venues.length} venue{venues.length !== 1 ? "s" : ""} across {footprintByCountry.length} countr{footprintByCountry.length !== 1 ? "ies" : "y"}
              {officeCount > 0 && ` · ${officeCount} office${officeCount !== 1 ? "s" : ""}`}
            </p>
            <div className="space-y-2.5">
              {footprintByCountry.slice(0, 6).map(([country, info]) => (
                <div key={country} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{country} <span className="text-slate-400">({[...info.cities].slice(0, 3).join(", ")}{info.cities.size > 3 ? ", …" : ""})</span></span>
                  <Badge variant="secondary">{info.total}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* 8. Recent Activity */}
      <SectionCard title="Recent Activity" icon={Rss}>
        {summaryLoading ? (
          <Skeleton className="h-32" />
        ) : activityFeed.length === 0 ? (
          <p className="text-sm text-slate-400">No recent activity.</p>
        ) : (
          <div className="space-y-3">
            {activityFeed.map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-2 text-sm">
                <div className="flex items-start gap-2 min-w-0">
                  <item.icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.meta} &middot; {timeAgo(item.time)}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${item.badgeClass}`}>
                  {item.badge}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 9. Ask Intelligence */}
      <ComingSoonCard
        title="Ask Intelligence"
        icon={Sparkles}
        description="Coming soon - ask natural-language questions about your operations and get instant, sourced answers."
      />
    </div>
  );
}
