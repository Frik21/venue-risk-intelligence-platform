import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type DashboardSummary, type Task, type Venue, type User, type AssessmentSummary, type GlobalExpense } from "@/lib/api";
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
  ClipboardCheck,
  MapPinned,
  Plus,
  CheckCircle2,
  UserPlus,
  ClipboardPlus,
  UserCog,
  CalendarDays,
  DollarSign,
  FileWarning,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { getStatusColor, getStatusLabel, getPriorityColor, formatDate } from "@/lib/display-utils";

const TASK_STATUS_LABELS: Record<string, string> = {
  not_completed: "Not Completed",
  in_progress: "In Progress",
  completed: "Completed",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-slate-600 bg-slate-100 border-slate-200",
  medium: "text-blue-700 bg-blue-50 border-blue-200",
  high: "text-orange-700 bg-orange-50 border-orange-200",
  urgent: "text-red-700 bg-red-50 border-red-200",
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

function TaskRow({ task }: { task: Task }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div className="min-w-0">
        <span className="text-[9px] font-mono text-slate-400 border border-slate-200 px-1 py-0.5 rounded mr-1.5">{task.taskNumber}</span>
        <span className="font-medium text-slate-900">{task.title}</span>
        <p className="text-xs text-slate-400">
          {task.venueName ?? "No venue"}
          {task.assignedToName ? ` · ${task.assignedToName}` : " · Unassigned"}
          {task.dueDate && ` · Due ${formatDate(task.dueDate)}`}
        </p>
      </div>
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${PRIORITY_COLORS[task.priority] ?? ""}`}>
        {task.priority}
      </span>
    </div>
  );
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Management Dashboard - restructured per direct product direction to
// this exact 9-section hierarchy (of a much larger 23-item full
// information architecture - everything else lives on its own page,
// reachable via the sidebar, to avoid cluttering this landing screen):
// Management Overview -> Requires Attention -> Task Management ->
// CPO Deployment -> Schedule -> Task Readiness -> Costs ->
// Operational Footprint -> Outstanding Reports.
//
// CPO status (Deployed/Available) is computed, not a stored field -
// Deployed means "has a task in progress right now". Outstanding
// Reports has no backing data (report generation isn't persisted
// anywhere - see /reports) so it points at what does exist instead of
// showing fake numbers.
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
  const { data: expenses = [], isLoading: expensesLoading } = useQuery<GlobalExpense[]>({
    queryKey: ["expenses-all"],
    queryFn: api.expenses.listAll,
  });

  const today = startOfToday();
  const cpos = users.filter((u) => u.role === "cpo");

  const activeTasks = tasks.filter((t) => t.status === "in_progress");
  const upcomingTasks = tasks.filter((t) => t.status === "not_completed");
  const unassignedTasks = tasks.filter((t) => t.assignedTo == null && t.status !== "completed");
  const overdueTasks = tasks.filter((t) => t.status !== "completed" && t.dueDate && new Date(t.dueDate) < today);
  const attentionAlerts = (summary?.recentAlerts ?? []).filter(
    (a) => a.status === "pending" && (a.priority === "high" || a.priority === "critical"),
  );
  const attentionAssessments = assessments.filter((a) => a.status === "review_required" || a.status === "escalated");
  const attentionCount = overdueTasks.length + unassignedTasks.length + attentionAlerts.length + attentionAssessments.length;
  const outstandingAssessments = assessments.filter((a) => a.status !== "approved" && a.status !== "archived").length;

  const deployedCpos = cpos.filter((c) => tasks.some((t) => t.assignedTo === c.id && t.status === "in_progress"));
  const availableCpos = cpos.filter((c) => c.active && !deployedCpos.includes(c));

  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const scheduleWithDates = tasks.filter((t) => t.dueDate);
  const todaySchedule = scheduleWithDates.filter((t) => {
    const d = new Date(t.dueDate!); d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });
  const tomorrowSchedule = scheduleWithDates.filter((t) => {
    const d = new Date(t.dueDate!); d.setHours(0, 0, 0, 0);
    return d.getTime() === tomorrow.getTime();
  });

  const activePool = tasks.filter((t) => t.status !== "completed");
  const readyCount = activePool.filter((t) => t.planSubmittedAt).length;
  const readinessPct = activePool.length === 0 ? 100 : Math.round((readyCount / activePool.length) * 100);
  const tasksMissingPlan = activePool.filter((t) => !t.planSubmittedAt).slice(0, 5);

  const spendByCurrency = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.currency] = (acc[e.currency] ?? 0) + e.amount;
    return acc;
  }, {});
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthSpendByCurrency = expenses
    .filter((e) => e.incurredOn.startsWith(thisMonth))
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.currency] = (acc[e.currency] ?? 0) + e.amount;
      return acc;
    }, {});

  const footprintByCountry = Object.entries(
    venues.reduce<Record<string, { total: number; cities: Set<string> }>>((acc, v) => {
      const entry = (acc[v.country] ??= { total: 0, cities: new Set() });
      entry.total += 1;
      entry.cities.add(v.city);
      return acc;
    }, {}),
  ).sort((a, b) => b[1].total - a[1].total);
  const officeCount = venues.filter((v) => v.venueType === "office").length;

  const overviewLoading = summaryLoading || tasksLoading || assessmentsLoading;

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

      {/* 1. Management Overview */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Management Overview</h2>
        {overviewLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={ListChecks} label="Active Tasks" value={activeTasks.length} href="/tasks" />
            <StatCard icon={CalendarDays} label="Upcoming Tasks" value={upcomingTasks.length} href="/tasks" />
            <StatCard icon={UserPlus} label="Unassigned Tasks" value={unassignedTasks.length} href="/tasks" />
            <StatCard icon={AlertOctagon} label="Requires Attention" value={attentionCount} href="/tasks" />
            <StatCard icon={UserCog} label="CPOs Deployed" value={deployedCpos.length} href="/admin/cpo-deployment" />
            <StatCard icon={UserCog} label="CPOs Available" value={availableCpos.length} href="/admin/cpo-deployment" />
            <StatCard icon={ClipboardList} label="Outstanding Assessments" value={outstandingAssessments} href="/assessments" />
            <StatCard icon={Building2} label="Venues" value={venues.length} href="/venues" />
          </div>
        )}
      </div>

      {/* 2. Requires Attention */}
      <SectionCard title="Requires Attention" icon={AlertOctagon}>
        {overviewLoading ? (
          <Skeleton className="h-24" />
        ) : attentionCount === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            All clear - nothing needs attention right now.
          </div>
        ) : (
          <div className="space-y-3">
            {unassignedTasks.map((t) => (
              <div key={`unassigned-${t.id}`} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{t.title}</p>
                  <p className="text-xs text-slate-400">{t.venueName ?? "No venue"}</p>
                </div>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 text-orange-700 bg-orange-50 border-orange-200">
                  Unassigned
                </span>
              </div>
            ))}
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

      {/* 3. Task Management */}
      <SectionCard title="Task Management" icon={ClipboardPlus} action={{ href: "/tasks", label: "Open Task Board" }}>
        {tasksLoading ? (
          <Skeleton className="h-24" />
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-400">No tasks yet - assign one to get started.</p>
        ) : (
          <div className="space-y-3">
            {tasks.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} />)}
          </div>
        )}
      </SectionCard>

      {/* 4. CPO Deployment */}
      <SectionCard title="CPO Deployment" icon={UserCog} action={{ href: "/admin/cpo-deployment", label: "View all" }}>
        {tasksLoading ? (
          <Skeleton className="h-24" />
        ) : cpos.length === 0 ? (
          <p className="text-sm text-slate-400">No CPOs yet.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {deployedCpos.length} deployed · {availableCpos.length} available · {cpos.length - deployedCpos.length - availableCpos.length} off duty
            </p>
            {deployedCpos.length > 0 && (
              <div className="space-y-2">
                {deployedCpos.slice(0, 5).map((c) => {
                  const t = tasks.find((t) => t.assignedTo === c.id && t.status === "in_progress");
                  return (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{c.name}</span>
                      <span className="text-xs text-slate-400 truncate">{t?.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* 5. Schedule */}
      <SectionCard title="Schedule" icon={CalendarDays} action={{ href: "/admin/schedule", label: "View all" }}>
        {tasksLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Today ({todaySchedule.length})</p>
              {todaySchedule.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing scheduled.</p>
              ) : (
                <div className="space-y-2.5">{todaySchedule.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} />)}</div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Tomorrow ({tomorrowSchedule.length})</p>
              {tomorrowSchedule.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing scheduled.</p>
              ) : (
                <div className="space-y-2.5">{tomorrowSchedule.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} />)}</div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* 6. Task Readiness */}
      <SectionCard title="Task Readiness" icon={ClipboardCheck}>
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

      {/* 7. Costs */}
      <SectionCard title="Costs" icon={DollarSign} action={{ href: "/admin/costs", label: "View all" }}>
        {expensesLoading ? (
          <Skeleton className="h-20" />
        ) : expenses.length === 0 ? (
          <p className="text-sm text-slate-400">No expenses logged yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Total Spend</p>
              {Object.entries(spendByCurrency).map(([cur, total]) => (
                <p key={cur} className="text-lg font-bold text-slate-900">
                  {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cur}
                </p>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">This Month</p>
              {Object.keys(monthSpendByCurrency).length === 0 ? (
                <p className="text-sm text-slate-400">Nothing this month.</p>
              ) : (
                Object.entries(monthSpendByCurrency).map(([cur, total]) => (
                  <p key={cur} className="text-lg font-bold text-slate-900">
                    {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cur}
                  </p>
                ))
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* 8. Operational Footprint */}
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

      {/* 9. Outstanding Reports */}
      <SectionCard title="Outstanding Reports" icon={FileWarning} action={{ href: "/reports", label: "Open Reports" }}>
        <div className="flex flex-col items-center justify-center text-center py-6 px-4 border border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-500 max-w-sm">
            Report generation isn't tracked as a persisted record yet, so there's no real "outstanding vs submitted" count to show.
            See <Link href="/reports" className="text-blue-600 hover:underline">Reportable Assessments</Link> for what's ready to report on.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
