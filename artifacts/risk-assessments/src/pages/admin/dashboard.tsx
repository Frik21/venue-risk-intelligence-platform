import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Task, type User, type Office, type Venue } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTaskDialog } from "@/components/new-task-dialog";
import {
  ClipboardPlus,
  UserCog,
  Building,
  Plus,
  Users as UsersIcon,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/lib/display-utils";

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

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
  });
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: offices = [], isLoading: officesLoading } = useQuery<Office[]>({ queryKey: ["offices"], queryFn: api.offices.list });

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

  const tasksLoaded = !tasksLoading && !usersLoading;

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
