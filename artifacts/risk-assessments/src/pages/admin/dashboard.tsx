import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Task, type User, type Office, type Venue, type Quote, type Invoice, type Client, type OnboardingOverviewRecord } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTaskDialog } from "@/components/new-task-dialog";
import { TrendChart } from "@/components/trend-chart";
import { OperatorAvatar, OperatorOverflowBadge } from "@/components/operator-avatar";
import {
  ClipboardPlus,
  UserCog,
  Building,
  Plus,
  CheckCircle2,
  Activity,
  UserX,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/display-utils";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { dailyBuckets, countByDay, countOpenByDay, distinctByDay, mergeSeries, toSingleSeries, cumulativeWinRateByDay, toSingleSeriesNullable } from "@/lib/trend-buckets";
import { cn } from "@/lib/utils";

const ONBOARDING_DISMISSED_KEY = "venueguard-onboarding-checklist-dismissed";

// "Get started" banner for a brand-new company - Platform Maturity
// Roadmap, Tier 4, items 9+10. Each step ticks off automatically once
// that data genuinely exists (no separate "mark done" action to
// forget), and the whole banner disappears on its own once every step
// is done - same "vanishes once real data exists" convention this
// app's own placeholder content (MOCK_TASK, OPERATIONAL_ALERTS) already
// uses. "Hide this" is the one manual override, for a Manager who just
// doesn't want to see it regardless of progress.
function OnboardingChecklistBanner({
  offices, clients, onboardingRecords, tasks,
}: { offices: Office[]; clients: Client[]; onboardingRecords: OnboardingOverviewRecord[]; tasks: Task[] }) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true"; } catch { return false; }
  });
  const [working, setWorking] = useState(false);
  const { data: sampleData } = useQuery({ queryKey: ["sample-data-status"], queryFn: api.sampleData.status });

  const steps = [
    { key: "office", label: "Add an Office", done: offices.length > 0, href: "/admin/offices" },
    { key: "client", label: "Add a Client", done: clients.length > 0, href: "/admin/clients" },
    { key: "operator", label: "Onboard a CPO", done: onboardingRecords.some((r) => r.status === "onboarded"), href: "/admin/onboarding" },
    { key: "task", label: "Create a Task", done: tasks.length > 0, href: "/tasks" },
  ];
  const allDone = steps.every((s) => s.done);

  if (dismissed || allDone) return null;

  function dismiss() {
    try { localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true"); } catch { /* best-effort only */ }
    setDismissed(true);
  }

  async function refetchSeededEntities() {
    await Promise.all(
      ["offices", "clients", "tasks", "quotes", "sample-data-status"].map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
  }

  async function handleLoadSample() {
    setWorking(true);
    try {
      await api.sampleData.load();
      await refetchSeededEntities();
    } finally {
      setWorking(false);
    }
  }

  async function handleRemoveSample() {
    setWorking(true);
    try {
      await api.sampleData.remove();
      await refetchSeededEntities();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Get started with VenueGuard</h2>
            <p className="text-sm text-slate-500 mt-0.5">A few things to set up before your first real job.</p>
          </div>
          <button type="button" onClick={dismiss} className="text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap shrink-0">
            Hide this
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {steps.map((s) => (
            <Link
              key={s.key}
              href={s.href}
              className={cn(
                "flex items-center gap-2 text-sm rounded-lg border px-3 py-2 transition-colors",
                s.done ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300",
              )}
            >
              <CheckCircle2 className={cn("w-4 h-4 shrink-0", s.done ? "text-green-500" : "text-slate-300")} />
              {s.label}
            </Link>
          ))}
        </div>
        <div className="mt-4">
          {sampleData?.exists ? (
            <Button size="sm" variant="outline" onClick={handleRemoveSample} disabled={working}>
              {working ? "Removing..." : "Remove sample data"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleLoadSample} disabled={working}>
              {working ? "Loading..." : "Load sample data to explore"}
            </Button>
          )}
          {sampleData?.exists && (
            <span className="text-xs text-slate-400 ml-2">Look for "[Sample]" entries - remove them before going live for real.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-slate-600 bg-slate-100 border-slate-200",
  medium: "text-blue-700 bg-blue-50 border-blue-200",
  high: "text-orange-700 bg-orange-50 border-orange-200",
  urgent: "text-red-700 bg-red-50 border-red-200",
};

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

// A live current-value tile, not a trend line - for the two Trends
// metrics (Tasks Running, Operators on Tasks) the database only knows
// right now, not what it was on past days, so a fabricated "history"
// line would misrepresent data that doesn't exist. Same
// live-snapshot reasoning as "Operators in the Field" below.
function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
          <Icon className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
        <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}

function defaultSinceDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// Management Dashboard - a lean dispatch console, per direct product
// direction: "I want this dashboard to help the manager... focus on
// creating tasks for the operators, creating task requests including
// the costing of the request, assigning the tasks to the operators,
// which operator is assigned to which task, how many operators are in
// the field, office locations". Everything else that used to live
// here (Venues/Assessments/Risk intelligence/Recent Activity/Ask
// Intelligence/Reports) was explicitly called out as noise for this
// persona and removed - those are the CPO's/analyst's concerns, not
// the dispatching Manager's.
export default function AdminDashboard() {
  const [showNewTask, setShowNewTask] = useState(false);
  const [sinceDate, setSinceDate] = useState(defaultSinceDate());

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
  });
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: offices = [], isLoading: officesLoading } = useQuery<Office[]>({ queryKey: ["offices"], queryFn: api.offices.list });
  const { data: allQuotes = [] } = useQuery<Quote[]>({ queryKey: ["quotes"], queryFn: api.quotes.list });
  const { data: allInvoices = [] } = useQuery<Invoice[]>({ queryKey: ["invoices"], queryFn: api.invoices.list });
  const { data: allClients = [] } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });
  const { data: onboardingRecords = [] } = useQuery<OnboardingOverviewRecord[]>({ queryKey: ["onboarding"], queryFn: api.onboarding.listAll });
  const { data: allTimesheetEntries = [] } = useQuery({ queryKey: ["timesheet-all"], queryFn: api.timesheet.listAll });

  // Every entity below carries officeId - scoping the whole dashboard
  // (existing sections included) to the sidebar switcher, same as
  // every other admin page, per direct product direction ("select an
  // office and all the data from the allocated office"). Onboarding
  // records aren't office-scoped (that entity was out of scope for
  // the office-scoping feature), so Operators Onboarded stays
  // unfiltered.
  const [selectedOfficeId] = useSelectedOfficeId();
  const tasks = filterByOffice(allTasks, selectedOfficeId);
  const users = filterByOffice(allUsers, selectedOfficeId);
  const quotes = filterByOffice(allQuotes, selectedOfficeId);
  const invoices = filterByOffice(allInvoices, selectedOfficeId);
  const clients = filterByOffice(allClients, selectedOfficeId);

  const cpos = users.filter((u) => u.role === "cpo");
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");
  const usersById = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers]);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const openTasks = tasks
    .filter((t) => !t.archived && t.status !== "completed")
    .sort((a, b) => {
      const aGap = a.operatorsRequired - a.assignedToIds.length;
      const bGap = b.operatorsRequired - b.assignedToIds.length;
      if (aGap !== bGap) return bGap - aGap;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });

  const deployedCpos = cpos.filter((c) => tasks.some((t) => t.assignedToIds.includes(c.id) && t.status === "in_progress"));
  const availableCpos = cpos.filter((c) => c.active && !deployedCpos.includes(c));
  const offDutyCpos = cpos.filter((c) => !c.active);
  const tasksRunning = tasks.filter((t) => !t.archived && t.status === "in_progress").length;

  const tasksLoaded = !tasksLoading && !usersLoading;

  // Trend charts - see lib/trend-buckets.ts for why each is either a
  // "throughput" count (one stamped timestamp) or a "pending window"
  // count (two stamped timestamps bracketing an open period). Tasks
  // Running and Operators on Tasks aren't here - the database only
  // knows their current value, not a history, so they're the
  // StatTiles above instead of fabricated trend lines.
  const buckets = useMemo(() => dailyBuckets(new Date(`${sinceDate}T00:00:00`)), [sinceDate]);

  const tasksCompletedData = useMemo(
    () => toSingleSeries(buckets, countByDay(tasks, buckets, (t) => t.completedAt), "completed"),
    [buckets, tasks],
  );
  const quotesSentPendingData = useMemo(() => {
    const sent = countByDay(quotes, buckets, (q) => q.sentAt);
    const pending = countOpenByDay(quotes, buckets, (q) => q.sentAt, (q) => q.decidedAt);
    return mergeSeries(buckets, sent, "sent", pending, "pending");
  }, [buckets, quotes]);
  // Quote Win Rate - Following Roadmap Tier 2, item 12 ("approved /
  // sent over time", not just the Sent-vs-Pending counts above).
  // Cumulative % of decided quotes (approved vs rejected, by
  // decidedAt) that were won - see cumulativeWinRateByDay's own
  // comment for why cumulative rather than a per-day ratio.
  const quoteWinRateData = useMemo(() => {
    const decided = quotes.filter((q) => q.status === "approved" || q.status === "rejected");
    const rate = cumulativeWinRateByDay(decided, buckets, (q) => q.decidedAt, (q) => q.status === "approved");
    return toSingleSeriesNullable(buckets, rate, "winRate");
  }, [buckets, quotes]);
  const invoicesPendingData = useMemo(
    () => toSingleSeries(buckets, countOpenByDay(invoices, buckets, (i) => i.sentAt, (i) => i.paidAt), "pending"),
    [buckets, invoices],
  );
  const newClientsData = useMemo(
    () => toSingleSeries(buckets, countByDay(clients, buckets, (c) => c.createdAt), "onboarded"),
    [buckets, clients],
  );
  const operatorsOnboardedData = useMemo(
    () => toSingleSeries(buckets, countByDay(onboardingRecords, buckets, (o) => o.operationalAccessGrantedAt), "onboarded"),
    [buckets, onboardingRecords],
  );

  // Operator Utilization - Following Roadmap Tier 2, item 9 ("are CPOs
  // sitting idle or is work being turned down"). Scoped to the idle-
  // time half only (real data, timesheet_entries.date) - "work being
  // turned down" would need Accept/Decline to actually be persisted
  // server-side, which it isn't today (Operators Note's respondToTask
  // is local UI state only), so that half is flagged as a separate
  // follow-up rather than faked here. Office-scoped by filtering to
  // this office's own CPO ids, since the trimmed /timesheet response
  // carries no officeId of its own to filter by directly.
  const cpoIds = useMemo(() => new Set(cpos.map((c) => c.id)), [cpos]);
  const officeTimesheetEntries = useMemo(() => allTimesheetEntries.filter((e) => cpoIds.has(e.userId)), [allTimesheetEntries, cpoIds]);
  // Date-only strings ("YYYY-MM-DD") parsed at local noon rather than
  // handed straight to distinctByDay's own `new Date(iso)` - midnight
  // UTC (what a bare "YYYY-MM-DD" parses to) can land on the previous
  // calendar day for any timezone behind UTC, silently shifting every
  // entry back a day. Noon is never at risk of crossing a day
  // boundary either direction once read back in local time.
  const operatorUtilizationData = useMemo(
    () =>
      toSingleSeries(
        buckets,
        distinctByDay(officeTimesheetEntries, buckets, (e) => `${e.date}T12:00:00`, (e) => e.userId).map((deployed) =>
          cpos.length > 0 ? Math.round((deployed / cpos.length) * 100) : 0,
        ),
        "deployed",
      ),
    [buckets, officeTimesheetEntries, cpos.length],
  );

  // Per-operator: how many distinct days in the period they actually
  // logged hours, out of the period's total days - worst (most idle)
  // first, same sort-worst-first convention as Job Profitability/
  // Aging Receivables elsewhere in this app.
  const operatorUtilizationRows = useMemo(() => {
    const daysByUser: Record<number, Set<string>> = {};
    const hoursByUser: Record<number, number> = {};
    for (const e of officeTimesheetEntries) {
      if (e.date < sinceDate) continue;
      (daysByUser[e.userId] ??= new Set()).add(e.date);
      hoursByUser[e.userId] = (hoursByUser[e.userId] ?? 0) + e.hoursWorked;
    }
    return cpos
      .filter((c) => c.active)
      .map((c) => ({
        id: c.id,
        name: c.name,
        daysDeployed: daysByUser[c.id]?.size ?? 0,
        hours: hoursByUser[c.id] ?? 0,
      }))
      .sort((a, b) => a.daysDeployed - b.daysDeployed);
  }, [cpos, officeTimesheetEntries, sinceDate]);
  const daysInPeriod = buckets.length;

  return (
    <div className="space-y-6">
      {showNewTask && <NewTaskDialog venues={venues} users={users} onClose={() => setShowNewTask(false)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Management Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Dispatch, assignment, and field status at a glance.</p>
        </div>
        <Button onClick={() => setShowNewTask(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Task Request
        </Button>
      </div>

      <OnboardingChecklistBanner offices={offices} clients={allClients} onboardingRecords={onboardingRecords} tasks={allTasks} />

      {/* Trends */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400" /> Trends
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="trends-since" className="text-xs text-slate-500 whitespace-nowrap">Since</Label>
            <Input
              id="trends-since"
              type="date"
              className="h-8 text-xs w-36"
              value={sinceDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => e.target.value && setSinceDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <StatTile icon={ClipboardPlus} label="Tasks Running" value={tasksRunning} />
          <StatTile icon={UserCog} label="Operators on Tasks" value={deployedCpos.length} />
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Operations</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <TrendChart title="Tasks Completed" data={tasksCompletedData} lines={[{ key: "completed", label: "Completed", color: "#008300" }]} />
              <TrendChart title="Operator Utilization" data={operatorUtilizationData} lines={[{ key: "deployed", label: "% CPOs Deployed", color: "#0891b2" }]} />
              <TrendChart title="Operators Onboarded" data={operatorsOnboardedData} lines={[{ key: "onboarded", label: "Operators Onboarded", color: "#4a3aa7" }]} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Revenue</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <TrendChart
                title="Quotes: Sent vs Pending"
                data={quotesSentPendingData}
                lines={[
                  { key: "sent", label: "Sent", color: "#2a78d6" },
                  { key: "pending", label: "Pending", color: "#eb6834" },
                ]}
              />
              <TrendChart
                title="Quote Win Rate"
                data={quoteWinRateData}
                lines={[{ key: "winRate", label: "Win Rate", color: "#9333ea" }]}
                unit="%"
              />
              <TrendChart title="Invoices Pending" data={invoicesPendingData} lines={[{ key: "pending", label: "Pending", color: "#eda100" }]} />
              <TrendChart title="New Clients Onboarded" data={newClientsData} lines={[{ key: "onboarded", label: "New Clients", color: "#1baf7a" }]} />
            </div>
          </div>
        </div>
      </div>

      {/* Task Assignment */}
      <SectionCard title="Task Assignment" icon={ClipboardPlus} action={{ href: "/tasks", label: "Open Task Board" }}>
        {!tasksLoaded ? (
          <Skeleton className="h-40" />
        ) : openTasks.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            No open tasks - everything is assigned and complete.
          </div>
        ) : (
          <div className="space-y-1">
            {openTasks.slice(0, 8).map((task) => {
              const understaffed = task.assignedToIds.length < task.operatorsRequired;
              const isOverdue = !!task.dueDate && task.dueDate < todayStr;
              const roster = task.assignedToIds.map((id, i) => ({ id, name: task.assignedToNames[i] ?? "?" }));
              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start justify-between gap-3 text-sm border-l-4 pl-3 pr-1 py-2.5 rounded-r",
                    isOverdue ? "border-red-400 bg-red-50/50" : understaffed ? "border-orange-400 bg-orange-50/40" : "border-transparent",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-mono text-slate-400 border border-slate-200 px-1 py-0.5 rounded">{task.taskNumber}</span>
                      <span className="font-medium text-slate-900">{task.title}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${PRIORITY_COLORS[task.priority] ?? ""}`}>
                        {task.priority}
                      </span>
                      {isOverdue && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 text-red-700 bg-red-50 border-red-200 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {task.venueName ?? "No venue"}{task.clientName && ` · ${task.clientName}`}
                      {task.dueDate && ` · ${formatDate(task.dueDate)}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {roster.length > 0 ? (
                        <div className="flex items-center -space-x-1.5">
                          {roster.slice(0, 4).map((r) => (
                            <OperatorAvatar key={r.id} name={r.name} avatarInitials={usersById.get(r.id)?.avatarInitials} size="xs" />
                          ))}
                          {roster.length > 4 && <OperatorOverflowBadge count={roster.length - 4} />}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Unassigned</span>
                      )}
                      <span className={understaffed ? "text-orange-600 font-medium text-xs" : "text-slate-500 text-xs"}>
                        {task.assignedToIds.length}/{task.operatorsRequired}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Operators in the Field */}
      <SectionCard title="Operators in the Field" icon={UserCog} action={{ href: "/admin/cpo-deployment", label: "View all" }}>
        {!tasksLoaded ? (
          <Skeleton className="h-32" />
        ) : cpos.length === 0 ? (
          <p className="text-sm text-slate-400">No CPOs yet - add one from Users.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                {deployedCpos.length > 0 && <div className="bg-green-500" style={{ width: `${(deployedCpos.length / cpos.length) * 100}%` }} />}
                {availableCpos.length > 0 && <div className="bg-blue-400" style={{ width: `${(availableCpos.length / cpos.length) * 100}%` }} />}
                {offDutyCpos.length > 0 && <div className="bg-slate-300" style={{ width: `${(offDutyCpos.length / cpos.length) * 100}%` }} />}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> {deployedCpos.length} deployed</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" /> {availableCpos.length} available</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" /> {offDutyCpos.length} off duty</span>
              </div>
            </div>
            {deployedCpos.length > 0 && (
              <div className="space-y-2.5">
                {deployedCpos.map((c) => {
                  const t = tasks.find((t) => t.assignedToIds.includes(c.id) && t.status === "in_progress");
                  return (
                    <div key={c.id} className="flex items-center gap-2.5 text-sm">
                      <OperatorAvatar name={c.name} avatarInitials={c.avatarInitials} size="xs" />
                      <span className="text-slate-700 font-medium shrink-0">{c.name}</span>
                      <span className="text-xs text-slate-400 truncate">{t?.title} · {t?.venueName}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Operator Utilization - Following Roadmap Tier 2, item 9 */}
      <SectionCard title="Operator Utilization" icon={UserX}>
        {!tasksLoaded ? (
          <Skeleton className="h-32" />
        ) : operatorUtilizationRows.length === 0 ? (
          <p className="text-sm text-slate-400">No active CPOs yet.</p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-400 mb-1">Days deployed since {formatDate(sinceDate)} - most idle first.</p>
            {operatorUtilizationRows.map((r) => {
              const ratio = daysInPeriod > 0 ? r.daysDeployed / daysInPeriod : 0;
              const barColor = ratio < 0.15 ? "bg-red-400" : ratio < 0.4 ? "bg-amber-400" : "bg-emerald-500";
              return (
                <div key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="text-slate-700 w-28 truncate shrink-0">{r.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn("h-full rounded-full", barColor)} style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <span className={cn("text-xs tabular-nums shrink-0 w-28 text-right", ratio < 0.15 ? "text-red-600 font-medium" : "text-slate-500")}>
                    {r.daysDeployed}/{daysInPeriod}d · {r.hours.toFixed(1)}h
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Office Locations */}
      <SectionCard title="Office Locations" icon={Building} action={{ href: "/admin/offices", label: "View all" }}>
        {officesLoading ? (
          <Skeleton className="h-24" />
        ) : offices.length === 0 ? (
          <p className="text-sm text-slate-400">No offices added yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {offices.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{o.name}</span>
                <span className="text-xs text-slate-400">{o.city}, {o.country}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
