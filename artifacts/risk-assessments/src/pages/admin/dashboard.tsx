import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Task, type User, type Office, type Venue, type Quote, type Invoice, type Client, type OnboardingOverviewRecord } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTaskDialog } from "@/components/new-task-dialog";
import { TrendChart } from "@/components/trend-chart";
import {
  ClipboardPlus,
  UserCog,
  Building,
  Plus,
  Users as UsersIcon,
  CheckCircle2,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/display-utils";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { dailyBuckets, countByDay, countOpenByDay, mergeSeries, toSingleSeries } from "@/lib/trend-buckets";

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <TrendChart title="Tasks Completed" data={tasksCompletedData} lines={[{ key: "completed", label: "Completed", color: "#008300" }]} />
          <TrendChart
            title="Quotes: Sent vs Pending"
            data={quotesSentPendingData}
            lines={[
              { key: "sent", label: "Sent", color: "#2a78d6" },
              { key: "pending", label: "Pending", color: "#eb6834" },
            ]}
          />
          <TrendChart title="Invoices Pending" data={invoicesPendingData} lines={[{ key: "pending", label: "Pending", color: "#eda100" }]} />
          <TrendChart title="New Clients Onboarded" data={newClientsData} lines={[{ key: "onboarded", label: "New Clients", color: "#1baf7a" }]} />
          <TrendChart title="Operators Onboarded" data={operatorsOnboardedData} lines={[{ key: "onboarded", label: "Operators Onboarded", color: "#4a3aa7" }]} />
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
          <div className="space-y-3">
            {openTasks.slice(0, 8).map((task) => {
              const understaffed = task.assignedToIds.length < task.operatorsRequired;
              return (
                <div key={task.id} className="flex items-start justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-mono text-slate-400 border border-slate-200 px-1 py-0.5 rounded">{task.taskNumber}</span>
                      <span className="font-medium text-slate-900">{task.title}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase shrink-0 ${PRIORITY_COLORS[task.priority] ?? ""}`}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {task.venueName ?? "No venue"}{task.clientName && ` · ${task.clientName}`}
                      {task.dueDate && ` · ${formatDate(task.dueDate)}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <UsersIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className={understaffed ? "text-orange-600 font-medium text-xs" : "text-slate-500 text-xs"}>
                        {task.assignedToNames.length > 0 ? task.assignedToNames.join(", ") : "Unassigned"}
                        {` (${task.assignedToIds.length}/${task.operatorsRequired})`}
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
            <p className="text-sm text-slate-600">
              {deployedCpos.length} deployed · {availableCpos.length} available · {offDutyCpos.length} off duty
            </p>
            {deployedCpos.length > 0 && (
              <div className="space-y-2">
                {deployedCpos.map((c) => {
                  const t = tasks.find((t) => t.assignedToIds.includes(c.id) && t.status === "in_progress");
                  return (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{c.name}</span>
                      <span className="text-xs text-slate-400 truncate">{t?.title} · {t?.venueName}</span>
                    </div>
                  );
                })}
              </div>
            )}
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
