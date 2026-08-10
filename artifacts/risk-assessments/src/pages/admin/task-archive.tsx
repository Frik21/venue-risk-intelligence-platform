import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Task, type TaskStatus, type TaskPriority, type QuotationStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Archive, Eye, Users, Car, DollarSign, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/display-utils";

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

const QUOTATION_LABEL: Record<QuotationStatus, string> = {
  approved: "Quotation Approved",
  awaiting_approval: "Quotation Awaiting Approval",
  denied: "Quotation Denied",
};

function ViewTaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const sc = STATUS_CONFIG[task.status];
  const pc = PRIORITY_CONFIG[task.priority];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8 p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold">{task.taskNumber}</h2>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase ${sc.color}`}>{sc.label}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase ${pc.color}`}>{pc.label}</span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase text-slate-500 bg-slate-100 border-slate-200">Archived</span>
        </div>

        <div>
          <div className="font-semibold text-slate-900">{task.title || "Untitled task"}</div>
          {task.venueName && <p className="text-sm text-slate-500">{task.venueName}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-400">Start</div>
            <div>{task.dueDate ? formatDate(task.dueDate) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">End</div>
            <div>{task.endDate ? formatDate(task.endDate) : "—"}</div>
          </div>
        </div>

        <div className="text-sm space-y-1">
          <div><span className="text-xs text-slate-400">Client:</span> {task.clientName || "—"}{task.clientContact && ` (${task.clientContact})`}</div>
          {task.clientRequirements && (
            <div><span className="text-xs text-slate-400">Requirements:</span> {task.clientRequirements}</div>
          )}
          <div><span className="text-xs text-slate-400">Assigned by:</span> {task.assignedByName || "—"}</div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            {task.assignedToNames.length > 0 ? task.assignedToNames.join(", ") : "Unassigned"} ({task.assignedToIds.length}/{task.operatorsRequired})
          </div>
          {task.vehiclesRequired > 0 && (
            <div className="flex items-center gap-1">
              <Car className="w-3.5 h-3.5 text-slate-400" /> {task.vehiclesRequired} vehicle{task.vehiclesRequired !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {task.estimatedCost != null && (
          <div className="flex items-center gap-1 text-sm">
            <DollarSign className="w-3.5 h-3.5 text-slate-400" /> {task.estimatedCost.toLocaleString()} {task.estimatedCostCurrency}
          </div>
        )}

        <div className="text-sm text-slate-600">{QUOTATION_LABEL[task.quotationStatus]}</div>

        {task.completionNote && (
          <div className="text-sm">
            <div className="text-xs text-slate-400">Completion note</div>
            <div>{task.completionNote}</div>
          </div>
        )}

        <div className="pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export default function TaskArchive() {
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks", { includeArchived: true }],
    queryFn: () => api.tasks.list({ includeArchived: true }),
  });

  const archivedTasks = tasks.filter((t) => t.archived);
  const query = search.trim().toLowerCase();
  const visibleTasks = query === ""
    ? archivedTasks
    : archivedTasks.filter((t) =>
        t.taskNumber.toLowerCase().includes(query) ||
        t.title.toLowerCase().includes(query) ||
        t.clientName.toLowerCase().includes(query) ||
        (t.venueName ?? "").toLowerCase().includes(query)
      );

  return (
    <div className="space-y-5">
      {viewingTask && <ViewTaskDialog task={viewingTask} onClose={() => setViewingTask(null)} />}

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Task Archive</h1>
        <p className="text-slate-500 text-sm mt-0.5">Tasks that have been archived / cancelled</p>
      </div>

      {archivedTasks.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archived tasks..."
            className="pl-9"
          />
        </div>
      )}

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
      ) : visibleTasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600">No archived tasks match "{search}"</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleTasks.map((task) => {
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
                      onClick={() => setViewingTask(task)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> View
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
