import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Task, type TaskStatus, type TaskPriority, type Venue, type User, type Client, type TimesheetEntry } from "@/lib/api";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ListChecks, Plus, MoreVertical, Pencil, Copy, Archive, ArchiveRestore, Users, Car, DollarSign, Clock, ChevronDown, ChevronUp, Check, Search, Shield, Receipt } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { NewTaskDialog, LocationCombobox, QuotationStatusPicker, ClientCombobox } from "@/components/new-task-dialog";
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
    clientId: task.clientId,
    clientName: task.clientName,
    clientContact: task.clientContact,
    clientRequirements: task.clientRequirements,
    operatorsRequired: String(task.operatorsRequired),
    armedRequired: task.armedRequired,
    vehiclesRequired: String(task.vehiclesRequired),
    checkInIntervalMinutes: task.checkInIntervalMinutes != null ? String(task.checkInIntervalMinutes) : "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });

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
        clientId: form.clientId,
        clientName: form.clientName,
        clientContact: form.clientContact,
        clientRequirements: form.clientRequirements,
        operatorsRequired: Number(form.operatorsRequired) || 0,
        armedRequired: form.armedRequired,
        vehiclesRequired: Number(form.vehiclesRequired) || 0,
        checkInIntervalMinutes: form.checkInIntervalMinutes ? Number(form.checkInIntervalMinutes) : null,
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
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
        <div>
          <Label>Client</Label>
          <ClientCombobox
            clients={clients}
            clientId={form.clientId}
            onSelect={(c) =>
              setForm((f) => ({
                ...f,
                clientId: c?.id ?? null,
                clientName: c ? c.name : f.clientName,
                clientContact: c ? (c.email || c.phone) : f.clientContact,
              }))
            }
          />
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
            <label className="flex items-center gap-2 text-xs text-slate-600 mt-1.5 cursor-pointer">
              <Checkbox
                checked={form.armedRequired}
                onCheckedChange={(v) => setForm((f) => ({ ...f, armedRequired: v === true }))}
              />
              Armed
            </label>
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
        <div>
          <Label>Check-In Interval (minutes)</Label>
          <Input
            type="number"
            min={1}
            placeholder="No scheduled check-ins"
            value={form.checkInIntervalMinutes}
            onChange={(e) => set("checkInIntervalMinutes", e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            While this task is In Progress, each assigned CPO is expected to check in this often - leave blank for no scheduled check-ins.
          </p>
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
  const [expandedHoursTaskId, setExpandedHoursTaskId] = useState<number | null>(null);
  // "archived" sits alongside the real TaskBucket values as a 7th,
  // page-local filter tile ("Task Archive") - not a real bucket (an
  // archived task can have been in any status/bucket before it was
  // archived), so it's kept out of task-bucket.ts's shared TaskBucket
  // type and handled here instead.
  const [bucketFilter, setBucketFilter] = useState<TaskBucket | "archived" | null>(null);
  const [search, setSearch] = useState("");
  const [extendingTaskId, setExtendingTaskId] = useState<number | null>(null);
  const [extendDate, setExtendDate] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  // Always fetches archived tasks too now (rather than a separate
  // "Show archived" toggle re-querying with includeArchived) - the
  // Task Archive tile below does the filtering client-side, same as
  // every other bucket tile.
  const { data: allTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list({ includeArchived: true }),
  });
  const [selectedOfficeId] = useSelectedOfficeId();
  const tasks = filterByOffice(allTasks, selectedOfficeId);
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  // No real login/session in this app - same "default to the first
  // manager/admin found" convention used elsewhere (e.g. Profile
  // resolution on the CPO side).
  const currentManagerId = users.find((u) => u.role === "manager" || u.role === "admin")?.id;

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

  const completeMutation = useMutation({
    mutationFn: (id: number) => api.tasks.update(id, { status: "completed" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task marked completed" });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: (id: number) => api.tasks.update(id, { invoiced: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task marked invoiced" });
    },
  });

  const extendMutation = useMutation({
    mutationFn: ({ id, endDate }: { id: number; endDate: string }) => api.tasks.update(id, { endDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Service extended" });
      setExtendingTaskId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Bucket counts/filtering deliberately ignore archived tasks
  // regardless of the "Show archived" toggle, same reasoning as CPO
  // Deployment's status counts - archived tasks are cancelled/dead,
  // not part of the live Pending/Running/Completed picture.
  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedTasks = tasks.filter((t) => t.archived);
  const bucketCounts: Record<TaskBucket, number> = {
    pending_details: activeTasks.filter((t) => taskBucket(t) === "pending_details").length,
    quotation: activeTasks.filter((t) => taskBucket(t) === "quotation").length,
    pending_allocation: activeTasks.filter((t) => taskBucket(t) === "pending_allocation").length,
    running: activeTasks.filter((t) => taskBucket(t) === "running").length,
    completed: activeTasks.filter((t) => taskBucket(t) === "completed").length,
    invoiced: activeTasks.filter((t) => taskBucket(t) === "invoiced").length,
  };
  const bucketFilterLabel = bucketFilter == null ? "" : bucketFilter === "archived" ? "Task Archive" : BUCKET_CONFIG[bucketFilter].label;
  const bucketFiltered = bucketFilter == null
    ? activeTasks
    : bucketFilter === "archived"
      ? archivedTasks
      : activeTasks.filter((t) => taskBucket(t) === bucketFilter);
  const query = search.trim().toLowerCase();
  const visibleTasks = query === ""
    ? bucketFiltered
    : bucketFiltered.filter((t) =>
        t.taskNumber.toLowerCase().includes(query) ||
        t.title.toLowerCase().includes(query) ||
        t.clientName.toLowerCase().includes(query) ||
        (t.venueName ?? "").toLowerCase().includes(query) ||
        t.assignedToNames.some((n) => n.toLowerCase().includes(query))
      );

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

      <div className="grid grid-cols-7 gap-4">
        {(["pending_details", "quotation", "pending_allocation", "running", "completed", "invoiced"] as const).map((b) => (
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
        <button
          onClick={() => setBucketFilter((current) => (current === "archived" ? null : "archived"))}
          className="text-left"
          disabled={isLoading}
        >
          <Card className={cn("transition-colors", bucketFilter === "archived" && "ring-2 ring-blue-500 border-blue-500")}>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-slate-900">{isLoading ? "—" : archivedTasks.length}</div>
              <div className="text-xs text-slate-500">Task Archive</div>
            </CardContent>
          </Card>
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="pl-9"
        />
      </div>

      {bucketFilter != null && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          Showing only {bucketFilterLabel.toLowerCase()} tasks
          <button onClick={() => setBucketFilter(null)} className="text-blue-600 hover:underline">Clear filter</button>
        </div>
      )}

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
            <h3 className="font-medium text-slate-600">
              {query !== ""
                ? `No tasks match "${search}"`
                : bucketFilter != null
                  ? `No ${bucketFilterLabel.toLowerCase()} tasks`
                  : "No active tasks"}
            </h3>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleTasks.map((task) => {
            const sc = STATUS_CONFIG[task.status];
            const pc = PRIORITY_CONFIG[task.priority];
            const bc = BUCKET_CONFIG[taskBucket(task)];
            const understaffed = task.assignedToIds.length < task.operatorsRequired;
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

                      {taskBucket(task) === "running" && (
                        <div className="mt-1.5">
                          <div className="grid grid-cols-3 gap-2 max-w-sm">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 border-green-200 text-green-700 hover:bg-green-50"
                              onClick={() => completeMutation.mutate(task.id)}
                              disabled={completeMutation.isPending}
                            >
                              Mark Completed
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8"
                              onClick={() => {
                                setExtendingTaskId(task.id);
                                setExtendDate(task.endDate ? task.endDate.slice(0, 16) : "");
                              }}
                            >
                              Extend Service
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => archiveMutation.mutate({ id: task.id, archived: true })}
                              disabled={archiveMutation.isPending}
                            >
                              Cancel Task
                            </Button>
                          </div>
                          {extendingTaskId === task.id && (
                            <div className="flex items-center gap-2 mt-2 max-w-sm">
                              <Input
                                type="datetime-local"
                                className="h-8 text-xs"
                                value={extendDate}
                                onChange={(e) => setExtendDate(e.target.value)}
                              />
                              <Button
                                size="sm"
                                className="h-8 text-xs shrink-0"
                                onClick={() => extendMutation.mutate({ id: task.id, endDate: extendDate })}
                                disabled={extendMutation.isPending || !extendDate}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs shrink-0"
                                onClick={() => setExtendingTaskId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-3 flex-wrap mt-1.5">
                        <div className="flex items-center gap-1 text-xs">
                          <Users className="w-3 h-3 text-slate-400" />
                          <span className={understaffed ? "text-orange-600 font-medium" : "text-slate-500"}>
                            {task.assignedToNames.length > 0 ? task.assignedToNames.join(", ") : "Unassigned"}
                            {` (${task.assignedToIds.length}/${task.operatorsRequired})`}
                          </span>
                        </div>
                        {task.armedRequired && (
                          <div className="flex items-center gap-1 text-xs text-red-700">
                            <Shield className="w-3 h-3" /> Armed
                          </div>
                        )}
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

                      {task.status === "completed" && (
                        <>
                          <div className="flex items-center gap-3 mt-1.5">
                            <button
                              onClick={() => setExpandedHoursTaskId((id) => (id === task.id ? null : task.id))}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              <Clock className="w-3 h-3" />
                              Hours logged
                              {expandedHoursTaskId === task.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            {task.invoiced ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-teal-700">
                                <Check className="w-3 h-3" /> Invoiced
                              </span>
                            ) : (
                              <button
                                onClick={() => invoiceMutation.mutate(task.id)}
                                disabled={invoiceMutation.isPending}
                                className="flex items-center gap-1 text-xs text-teal-700 hover:underline disabled:opacity-50"
                              >
                                <Receipt className="w-3 h-3" />
                                Mark Invoiced
                              </button>
                            )}
                          </div>
                          {expandedHoursTaskId === task.id && (
                            <TaskHoursPanel taskId={task.id} currentManagerId={currentManagerId} />
                          )}
                        </>
                      )}
                    </div>
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
