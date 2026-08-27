import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Task } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ListChecks, UserCog, CalendarDays, type LucideIcon } from "lucide-react";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";

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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-100 rounded-lg p-3">
      <div className="text-lg font-mono tabular-nums font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function inNextDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  const due = new Date(dateStr).getTime();
  const now = Date.now();
  return due >= now && due <= now + days * 24 * 60 * 60 * 1000;
}

// Operations' own scoped view - Tasks, Operator Deployment, and
// Schedule rolled into one dashboard, per direct product direction,
// confirmed via AskUserQuestion following the same pattern as
// /admin/finance and /admin/hr. Office-scoped like every other
// Command Desk list page. role: "operations" lands here after login/
// registration instead of the general Management Dashboard.
export default function OperationsDashboard() {
  const [selectedOfficeId] = useSelectedOfficeId();
  const { data: allTasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });
  const tasks = filterByOffice(allTasks, selectedOfficeId);

  const notCompleted = tasks.filter((t) => t.status === "not_completed").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const unassigned = tasks.filter((t) => t.assignedToIds.length === 0).length;

  const deployedTasks = tasks.filter((t) => t.status === "in_progress");
  const deployedCpoCount = new Set(deployedTasks.flatMap((t) => t.assignedToIds)).size;

  const dueThisWeek = tasks.filter((t) => t.status !== "completed" && inNextDays(t.dueDate, 7)).length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Operations</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tasks, Operator Deployment, and Schedule at a glance</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SectionCard title="Tasks" icon={ListChecks} action={{ href: "/tasks", label: "View all →" }}>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Not Started" value={String(notCompleted)} />
              <StatTile label="In Progress" value={String(inProgress)} />
              <StatTile label="Completed" value={String(completed)} />
              <StatTile label="Unassigned" value={String(unassigned)} />
            </div>
          </SectionCard>

          <SectionCard title="Operator Deployment" icon={UserCog} action={{ href: "/admin/cpo-deployment", label: "View all →" }}>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Operators deployed" value={String(deployedCpoCount)} />
              <StatTile label="Active tasks" value={String(deployedTasks.length)} />
            </div>
          </SectionCard>

          <SectionCard title="Schedule" icon={CalendarDays} action={{ href: "/admin/schedule", label: "View all →" }}>
            <div className="grid grid-cols-1 gap-3">
              <StatTile label="Due in the next 7 days" value={String(dueThisWeek)} />
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
