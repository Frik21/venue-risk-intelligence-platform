import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Task, type TaskStatus, type TaskPriority, type Venue, type User } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ListChecks, Plus, ClipboardCheck, MoreVertical, Pencil, Copy, Archive, ArchiveRestore } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { NewTaskDialog } from "@/components/new-task-dialog";

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

function EditTaskDialog({ task, venues, users, onClose }: { task: Task; venues: Venue[]; users: User[]; onClose: () => void }) {
  const cpos = users.filter((u) => u.role === "cpo");
  const [form, setForm] = useState({
    venueId: String(task.venueId),
    assignedTo: task.assignedTo != null ? String(task.assignedTo) : "",
    title: task.title,
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
    priority: task.priority,
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.tasks.update(task.id, {
        venueId: Number(form.venueId),
        assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
        title: form.title,
        dueDate: form.dueDate || null,
        priority: form.priority as TaskPriority,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task updated" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold">Edit {task.taskNumber}</h2>
        <div>
          <Label>Venue *</Label>
          <Select value={form.venueId} onValueChange={(v) => set("venueId", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {venues.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Assign To (CPO)</Label>
          <Select value={form.assignedTo} onValueChange={(v) => set("assignedTo", v)}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              {cpos.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Task *</Label>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <Label>Due Date</Label>
          <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.venueId || !form.title.trim()}>
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function TasksList() {
  const [showNew, setShowNew] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks", { includeArchived: showArchived }],
    queryFn: () => api.tasks.list({ includeArchived: showArchived }),
  });
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const cpos = users.filter((u) => u.role === "cpo");

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => api.tasks.updateStatus(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task updated" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, assignedTo }: { id: number; assignedTo: number }) => api.tasks.update(id, { assignedTo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "CPO assigned" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => api.tasks.duplicate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task duplicated" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) => api.tasks.update(id, { archived }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: vars.archived ? "Task archived" : "Task restored" });
    },
  });

  return (
    <div className="space-y-5">
      {showNew && <NewTaskDialog venues={venues} users={users} onClose={() => setShowNew(false)} />}
      {editingTask && <EditTaskDialog task={editingTask} venues={venues} users={users} onClose={() => setEditingTask(null)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500 text-sm mt-0.5">Assign CPOs to complete structured work, tied to a venue</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Assign Task
        </Button>
      </div>

      <button
        onClick={() => setShowArchived((s) => !s)}
        className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
      >
        {showArchived ? "Hide archived tasks" : "Show archived tasks"}
      </button>

      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ListChecks className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600">No tasks yet</h3>
            <Button onClick={() => setShowNew(true)} className="mt-2"><Plus className="w-4 h-4 mr-1.5" />Assign Task</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const sc = STATUS_CONFIG[task.status];
            const pc = PRIORITY_CONFIG[task.priority];
            return (
              <Card key={task.id} className={cn(task.archived && "opacity-60")}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">{task.taskNumber}</span>
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", sc.color)}>
                          {sc.label}
                        </span>
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", pc.color)}>
                          {pc.label}
                        </span>
                        {task.archived && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase text-slate-500 bg-slate-100 border-slate-200">Archived</span>}
                        {task.venueName && <span className="text-xs text-slate-500">{task.venueName}</span>}
                        {task.dueDate && <span className="text-xs text-slate-400 ml-auto">Due {formatDate(task.dueDate)}</span>}
                      </div>
                      <div className="font-semibold text-slate-900 text-sm mb-0.5">{task.title}</div>
                      {task.assignedTo == null ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-orange-600 font-medium">Unassigned</span>
                          <Select onValueChange={(v) => assignMutation.mutate({ id: task.id, assignedTo: Number(v) })}>
                            <SelectTrigger className="h-6 text-xs w-40"><SelectValue placeholder="Assign a CPO..." /></SelectTrigger>
                            <SelectContent>
                              {cpos.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          Assigned to {task.assignedToName}
                          {task.assignedByName && ` by ${task.assignedByName}`}
                        </p>
                      )}
                      {task.planSubmittedAt ? (
                        <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                          <ClipboardCheck className="w-3 h-3" />
                          Plan submitted {new Date(task.planSubmittedAt).toLocaleString()}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                          <ClipboardCheck className="w-3 h-3" />
                          Plan not submitted yet
                        </p>
                      )}
                    </div>
                    <Select value={task.status} onValueChange={(v) => statusMutation.mutate({ id: task.id, status: v as TaskStatus })}>
                      <SelectTrigger className="w-40 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_completed">Not Completed</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingTask(task)}>
                          <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateMutation.mutate(task.id)}>
                          <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {task.archived ? (
                          <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: task.id, archived: false })}>
                            <ArchiveRestore className="w-3.5 h-3.5 mr-2" /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: task.id, archived: true })}>
                            <Archive className="w-3.5 h-3.5 mr-2" /> Cancel / Archive
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
