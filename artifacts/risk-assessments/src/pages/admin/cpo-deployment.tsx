import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Task, type User } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Mail, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { taskBucket } from "@/lib/task-bucket";

type DeployStatus = "deployed" | "available" | "off_duty";

const STATUS_CONFIG: Record<DeployStatus, { label: string; color: string }> = {
  deployed: { label: "Deployed", color: "text-blue-700 bg-blue-50 border-blue-200" },
  available: { label: "Available", color: "text-green-700 bg-green-50 border-green-200" },
  off_duty: { label: "Off Duty", color: "text-slate-500 bg-slate-100 border-slate-200" },
};

// CPO Deployment - status is computed, not a field anyone sets by
// hand: Deployed = has at least one Running task (see lib/task-bucket.ts
// - assigned to this CPO, details complete, not yet completed), Off
// Duty = inactive user account, Available = active with no Running
// task. Assigning a CPO via Assign Task moves that task straight from
// Pending Allocation to Running, which is what flips this CPO to
// Deployed - no separate step. Qualifications/certifications aren't
// tracked anywhere in the schema yet, so they're not shown here rather
// than faked.
export default function CpoDeployment() {
  const [statusFilter, setStatusFilter] = useState<DeployStatus | null>(null);
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });
  const qc = useQueryClient();
  const { toast } = useToast();

  const assignMutation = useMutation({
    mutationFn: ({ taskId, cpoId }: { taskId: number; cpoId: number }) => api.tasks.update(taskId, { assigneeIds: [cpoId] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task assigned" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cpos = users.filter((u) => u.role === "cpo");
  const isLoading = usersLoading || tasksLoading;
  // Same pool for every CPO - Pending Allocation tasks are unassigned by
  // definition (see taskBucket), so there's no "already covered" case to
  // filter out here, unlike CPO options on an understaffed task.
  const pendingAllocationTasks = tasks.filter((t) => taskBucket(t) === "pending_allocation");

  const rows = cpos.map((cpo) => {
    const cpoTasks = tasks.filter((t) => t.assignedToIds.includes(cpo.id) && !t.archived);
    const runningTasks = cpoTasks
      .filter((t) => taskBucket(t) === "running")
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    const current = runningTasks[0];
    const upcoming = runningTasks.slice(1);

    const status: DeployStatus = !cpo.active ? "off_duty" : current ? "deployed" : "available";

    return { cpo, current, upcoming, taskCount: cpoTasks.length, status };
  });

  const counts = {
    deployed: rows.filter((r) => r.status === "deployed").length,
    available: rows.filter((r) => r.status === "available").length,
    off_duty: rows.filter((r) => r.status === "off_duty").length,
  };

  const visibleRows = statusFilter == null ? rows : rows.filter((r) => r.status === statusFilter);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Operator Deployment</h1>
        <p className="text-slate-500 text-sm mt-0.5">Status, current assignment, and upcoming assignments for every CPO</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(["deployed", "available", "off_duty"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter((current) => (current === s ? null : s))}
            className="text-left"
            disabled={isLoading}
          >
            <Card className={cn("transition-colors", statusFilter === s && "ring-2 ring-blue-500 border-blue-500")}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-slate-900">{isLoading ? "—" : counts[s]}</div>
                <div className="text-xs text-slate-500">{STATUS_CONFIG[s].label}</div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {statusFilter != null && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          Showing only {STATUS_CONFIG[statusFilter].label.toLowerCase()} operators
          <button onClick={() => setStatusFilter(null)} className="text-blue-600 hover:underline">Clear filter</button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No CPOs yet</h3>
            <p className="text-sm text-slate-400">Add a CPO user from <Link href="/admin/users" className="text-blue-600 hover:underline">Users</Link>.</p>
          </CardContent>
        </Card>
      ) : visibleRows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No {STATUS_CONFIG[statusFilter!].label.toLowerCase()} operators</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleRows.map(({ cpo, current, upcoming, taskCount, status }) => (
            <Card key={cpo.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {cpo.avatarInitials ?? cpo.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-900 text-sm">{cpo.name}</span>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", STATUS_CONFIG[status].color)}>
                        {STATUS_CONFIG[status].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-400 mb-2">
                      <Mail className="w-3 h-3" /> {cpo.email}
                    </div>
                    {current ? (
                      <p className="text-xs text-slate-700">
                        <span className="text-slate-400">Current assignment:</span> {current.title} — {current.venueName ?? "No venue"}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">No current assignment</p>
                    )}
                    {upcoming.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">
                        {upcoming.length} upcoming: {upcoming.slice(0, 2).map((t) => t.title).join(", ")}{upcoming.length > 2 ? ", …" : ""}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-2">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span>{taskCount} task{taskCount !== 1 ? "s" : ""} total</span>
                    </div>
                    {status === "available" && (
                      <Select
                        onValueChange={(v) => assignMutation.mutate({ taskId: Number(v), cpoId: cpo.id })}
                        disabled={assignMutation.isPending}
                      >
                        <SelectTrigger className="h-7 w-44 text-xs ml-auto">
                          <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                          <SelectValue placeholder="Assign Task" />
                        </SelectTrigger>
                        <SelectContent>
                          {pendingAllocationTasks.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-slate-400">No tasks pending allocation</div>
                          ) : (
                            pendingAllocationTasks.map((t) => (
                              <SelectItem key={t.id} value={String(t.id)}>{t.taskNumber} · {t.title}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
