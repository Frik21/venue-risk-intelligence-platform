import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Task, type TaskStatus, type TaskPriority } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Archive, ArchiveRestore, Users } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  not_completed: { label: "Not Completed", color: "text-red-700 bg-red-50 border-red-200" },
  in_progress: { label: "In Progress", color: "text-amber-700 bg-amber-50 border-amber-200" },
  completed: { label: "Completed", color: "text-green-700 bg-green-50 border-green-200" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: "Low", color: "text-slate-600 bg-slate-100 border-slate-200" },
  medium: { label: "Medium", color: "text-blue-700 bg-blue-50 border-blue-200" },
  high: { label: "High", color: "text-orange-700 bg-orange-50 border-orange-200" },
  urgent: { label: "Urgent", color: "text-red-700 bg-red-50 border-red-200" },
};

export default function TaskArchive() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks", { includeArchived: true }],
    queryFn: () => api.tasks.list({ includeArchived: true }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => api.tasks.update(id, { archived: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task restored" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const archivedTasks = tasks.filter((t) => t.archived);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Task Archive</h1>
        <p className="text-slate-500 text-sm mt-0.5">Tasks that have been archived / cancelled</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : archivedTasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Archive className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600">No archived tasks</h3>
            <p className="text-sm text-slate-400 mt-1">Tasks you archive from the Tasks page will show up here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {archivedTasks.map((task) => {
            const sc = STATUS_CONFIG[task.status];
            const pc = PRIORITY_CONFIG[task.priority];
            return (
              <Card key={task.id} className="opacity-75">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">{task.taskNumber}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase ${sc.color}`}>
                          {sc.label}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase ${pc.color}`}>
                          {pc.label}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase text-slate-500 bg-slate-100 border-slate-200">Archived</span>
                        {task.venueName && <span className="text-xs text-slate-500">{task.venueName}</span>}
                        {task.dueDate && <span className="text-xs text-slate-400 ml-auto">Due {formatDate(task.dueDate)}</span>}
                      </div>
                      <div className="font-semibold text-slate-900 text-sm mb-0.5">{task.title || "Untitled task"}</div>
                      {task.clientName && (
                        <p className="text-xs text-slate-500">Client: {task.clientName}{task.clientContact && ` (${task.clientContact})`}</p>
                      )}
                      <div className="flex items-center gap-1 text-xs mt-1.5">
                        <Users className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-500">
                          {task.assignedToNames.length > 0 ? task.assignedToNames.join(", ") : "Unassigned"}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => restoreMutation.mutate(task.id)}
                      disabled={restoreMutation.isPending}
                    >
                      <ArchiveRestore className="w-3.5 h-3.5 mr-1.5" /> Restore
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
