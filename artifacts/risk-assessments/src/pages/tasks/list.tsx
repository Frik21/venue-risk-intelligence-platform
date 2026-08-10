import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Task, type TaskStatus, type TaskPriority, type QuotationStatus, type Venue, type User, type TimesheetEntry } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ListChecks, Plus, ClipboardCheck, MoreVertical, Pencil, Copy, Archive, ArchiveRestore, Users, Car, DollarSign, Clock, ChevronDown, ChevronUp, Check } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { NewTaskDialog, LocationCombobox, QuotationStatusPicker } from "@/components/new-task-dialog";
import { type TaskBucket, BUCKET_CONFIG, taskBucket } from "@/lib/task-bucket";

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

function EditTaskDialog({ task, venues, onClose }: { task: Task; venues: Venue[]; onClose: () => void }) {
  const [form, setForm] = useState({
    venueId: task.venueId != null ? String(task.venueId) : "",
    assigneeIds: task.assignedToIds,
    title: task.title,
    dueDate: task.dueDate ? task.dueDate.slice(0, 16) : "",
    endDate: task.endDate ? task.endDate.slice(0, 16) : "",
    priority: task.priority,
    quotationStatus: task.quotationStatus,
    clientName: task.clientName,
    clientContact: task.clientContact,
    clientRequirements: task.clientRequirements,
    operatorsRequired: String(task.operatorsRequired),
    vehiclesRequired: String(task.vehiclesRequired),
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.tasks.update(task.id, {
        venueId: form.venueId ? Number(form.venueId) : null,
        assigneeIds: form.assigneeIds,
        title: form.title,
        dueDate: form.dueDate || null,
        endDate: form.endDate || null,
        priority: form.priority as TaskPriority,
        quotationStatus: form.quotationStatus,
        clientName: form.clientName,
        clientContact: form.clientContact,
        clientRequirements: form.clientRequirements,
        operatorsRequired: Number(form.operatorsRequired) || 0,
        vehiclesRequired: Number(form.vehiclesRequired) || 0,
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">Edit {task.taskNumber}</h2>
        <div>
          <Label>Task</Label>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <Label>Location</Label>
          <LocationCombobox venues={venues} value={form.venueId} onChange={(v) => set("venueId", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Client Name *</Label>
            <Input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} />
          </div>
          <div>
            <Label>Client Contact *</Label>
            <Input value={form.clientContact} onChange={(e) => set("clientContact", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Client Requirements / Special Requests *</Label>
          <Textarea value={form.clientRequirements} onChange={(e) => set("clientRequirements", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start Date/Time</Label>
            <Input type="datetime-local" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>
          <div>
            <Label>End Date/Time</Label>
            <Input type="datetime-local" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Operators Needed</Label>
            <Input type="number" min={0} value={form.operatorsRequired} onChange={(e) => set("operatorsRequired", e.target.value)} />
          </div>
          <div>
            <Label>Vehicles Needed</Label>
            <Input type="number" min={0} value={form.vehiclesRequired} onChange={(e) => set("vehiclesRequired", e.target.value)} />
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
        </div>
        <div>
          <Label>Quotation Status</Label>
          <QuotationStatusPicker
            value={form.quotationStatus}
            onChange={(v) => setForm((f) => ({ ...f, quotationStatus: v }))}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Hours logged by this task's assigned CPO(s) - the CPO logs their
// own hours from Timesheet, but they don't count toward Personnel
// Costs until a Manager approves them here, per direct product
// direction ("the manager... collect[s] the hours... and add[s] it to
// the costs"). Fetched only while expanded.
function TaskHoursPanel({ taskId, currentManagerId }: { taskId: number; currentManagerId: number | undefined }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useQuery<TimesheetEntry[]>({
    queryKey: ["task-timesheet", taskId],
    queryFn: () => api.timesheet.listForTask(taskId),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.timesheet.approve(id, currentManagerId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-timesheet", taskId] });
      qc.invalidateQueries({ queryKey: ["personnel-costs"] });
      toast({ title: "Hours added to costing" });
    },
  });

  if (isLoading) return <Skeleton className="h-16 mt-2" />;
  if (entries.length === 0) return <p className="text-xs text-slate-400 mt-2">No hours logged against this task yet.</p>;

  return (
    <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <span className="font-medium text-slate-700">{entry.userName ?? "Unknown"}</span>
            <span className="text-slate-400"> · {formatDate(entry.date)} · {entry.dayHours}d + {entry.nightHours}n</span>
          </div>
          {entry.approved ? (
            <span className="flex items-center gap-1 text-green-600 shrink-0"><Check className="w-3 h-3" /> Added to costing</span>
          ) : (
            <Button
              size="sm"
              className="h-6 px-2 text-[11px] shrink-0"
              onClick={() => approveMutation.mutate(entry.id)}
              disabled={approveMutation.isPending || currentManagerId == null}
            >
              Add to Costing
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TasksList() {
  const [showNew, setShowNew] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedHoursTaskId, setExpandedHoursTaskId] = useState<number | null>(null);
  const [bucketFilter, setBucketFilter] = useState<TaskBucket | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks", { includeArchived: showArchived }],
    queryFn: () => api.tasks.list({ includeArchived: showArchived }),
  });
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const cpos = users.filter((u) => u.role === "cpo");
  // No real login/session in this app - same "default to the first
  // manager/admin found" convention used elsewhere (e.g. Profile
  // resolution on the CPO side).
  const currentManagerId = users.find((u) => u.role === "manager" || u.role === "admin")?.id;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => api.tasks.updateStatus(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task updated" });
    },
  });

  const addAssigneeMutation = useMutation({
    mutationFn: ({ task, cpoId }: { task: Task; cpoId: number }) =>
      api.tasks.update(task.id, { assigneeIds: [...task.assignedToIds, cpoId] }),
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

  // Bucket counts/filtering deliberately ignore archived tasks
  // regardless of the "Show archived" toggle, same reasoning as CPO
  // Deployment's status counts - archived tasks are cancelled/dead,
  // not part of the live Pending/Running/Completed picture.
  const activeTasks = tasks.filter((t) => !t.archived);
  const bucketCounts: Record<TaskBucket, number> = {
    pending_details: activeTasks.filter((t) => taskBucket(t) === "pending_details").length,
    pending_allocation: activeTasks.filter((t) => taskBucket(t) === "pending_allocation").length,
    running: activeTasks.filter((t) => taskBucket(t) === "running").length,
    completed: activeTasks.filter((t) => taskBucket(t) === "completed").length,
  };
  const visibleTasks = bucketFilter == null ? tasks : activeTasks.filter((t) => taskBucket(t) === bucketFilter);

  return (
    <div className="space-y-5">
      {showNew && <NewTaskDialog venues={venues} users={users} onClose={() => setShowNew(false)} />}
      {editingTask && <EditTaskDialog task={editingTask} venues={venues} onClose={() => setEditingTask(null)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500 text-sm mt-0.5">Task requests, assignments, and status - tied to a venue</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Task Request
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {(["pending_details", "pending_allocation", "running", "completed"] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBucketFilter((current) => (current === b ? null : b))}
            className="text-left"
            disabled={isLoading}
          >
            <Card className={cn("transition-colors", bucketFilter === b && "ring-2 ring-blue-500 border-blue-500")}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-slate-900">{isLoading ? "—" : bucketCounts[b]}</div>
                <div className="text-xs text-slate-500">{BUCKET_CONFIG[b].label}</div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {bucketFilter != null && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Showing only {BUCKET_CONFIG[bucketFilter].label.toLowerCase()} tasks
            <button onClick={() => setBucketFilter(null)} className="text-blue-600 hover:underline">Clear filter</button>
          </div>
        )}
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
        >
          {showArchived ? "Hide archived tasks" : "Show archived tasks"}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ListChecks className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600">No tasks yet</h3>
            <Button onClick={() => setShowNew(true)} className="mt-2"><Plus className="w-4 h-4 mr-1.5" />New Task Request</Button>
          </CardContent>
        </Card>
      ) : visibleTasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ListChecks className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600">No {BUCKET_CONFIG[bucketFilter!].label.toLowerCase()} tasks</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleTasks.map((task) => {
            const sc = STATUS_CONFIG[task.status];
            const pc = PRIORITY_CONFIG[task.priority];
            const bc = BUCKET_CONFIG[taskBucket(task)];
            const understaffed = task.assignedToIds.length < task.operatorsRequired;
            const availableToAdd = cpos.filter((u) => !task.assignedToIds.includes(u.id));
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
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", bc.color)}>
                          {bc.label}
                        </span>
                        {task.archived && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase text-slate-500 bg-slate-100 border-slate-200">Archived</span>}
                        {task.venueName && <span className="text-xs text-slate-500">{task.venueName}</span>}
                        {task.dueDate && <span className="text-xs text-slate-400 ml-auto">Due {formatDate(task.dueDate)}</span>}
                      </div>
                      <div className="font-semibold text-slate-900 text-sm mb-0.5">{task.title}</div>
                      {task.clientName && (
                        <p className="text-xs text-slate-500">Client: {task.clientName}{task.clientContact && ` (${task.clientContact})`}</p>
                      )}

                      <div className="flex items-center gap-3 flex-wrap mt-1.5">
                        <div className="flex items-center gap-1 text-xs">
                          <Users className="w-3 h-3 text-slate-400" />
                          <span className={understaffed ? "text-orange-600 font-medium" : "text-slate-500"}>
                            {task.assignedToNames.length > 0 ? task.assignedToNames.join(", ") : "Unassigned"}
                            {` (${task.assignedToIds.length}/${task.operatorsRequired})`}
                          </span>
                        </div>
                        {task.vehiclesRequired > 0 && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Car className="w-3 h-3 text-slate-400" /> {task.vehiclesRequired} vehicle{task.vehiclesRequired !== 1 ? "s" : ""}
                          </div>
                        )}
                        {task.estimatedCost != null && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <DollarSign className="w-3 h-3 text-slate-400" /> {task.estimatedCost.toLocaleString()} {task.estimatedCostCurrency}
                          </div>
                        )}
                      </div>

                      {understaffed && availableToAdd.length > 0 && (
                        <div className="mt-1.5">
                          <Select onValueChange={(v) => addAssigneeMutation.mutate({ task, cpoId: Number(v) })}>
                            <SelectTrigger className="h-6 text-xs w-44"><SelectValue placeholder="+ Add a CPO..." /></SelectTrigger>
                            <SelectContent>
                              {availableToAdd.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {task.planSubmittedAt ? (
                        <p className="text-xs text-green-600 flex items-center gap-1 mt-1.5">
                          <ClipboardCheck className="w-3 h-3" />
                          Plan submitted {new Date(task.planSubmittedAt).toLocaleString()}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1.5">
                          <ClipboardCheck className="w-3 h-3" />
                          Plan not submitted yet
                        </p>
                      )}

                      <button
                        onClick={() => setExpandedHoursTaskId((id) => (id === task.id ? null : task.id))}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1.5"
                      >
                        <Clock className="w-3 h-3" />
                        Hours logged
                        {expandedHoursTaskId === task.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {expandedHoursTaskId === task.id && (
                        <TaskHoursPanel taskId={task.id} currentManagerId={currentManagerId} />
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
