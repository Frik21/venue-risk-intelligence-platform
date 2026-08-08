import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Task, type TaskStatus, type Venue, type User } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  not_completed: { label: "Not Completed", color: "text-red-700 bg-red-50 border-red-200" },
  in_progress: { label: "In Progress", color: "text-amber-700 bg-amber-50 border-amber-200" },
  completed: { label: "Completed", color: "text-green-700 bg-green-50 border-green-200" },
};

// Manager-side task creation. There's no Manager page yet (that's a
// separate, later piece of work), so this is a minimal admin-style form -
// enough to assign a CPO a task tied to a venue and test the full
// assign -> complete loop end to end, not a real Manager surface.
function NewTaskDialog({ venues, users, onClose }: { venues: Venue[]; users: User[]; onClose: () => void }) {
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");
  const cpos = users.filter((u) => u.role === "cpo");
  const [form, setForm] = useState({
    venueId: "",
    assignedTo: "",
    assignedBy: "",
    title: "",
    dueDate: "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.tasks.create({
        venueId: Number(form.venueId),
        assignedTo: Number(form.assignedTo),
        assignedBy: Number(form.assignedBy),
        title: form.title,
        dueDate: form.dueDate || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task assigned" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.venueId && form.assignedTo && form.assignedBy && form.title.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold">Assign Task</h2>
        <div>
          <Label>Venue *</Label>
          <Select value={form.venueId} onValueChange={(v) => set("venueId", v)}>
            <SelectTrigger><SelectValue placeholder="Select a venue" /></SelectTrigger>
            <SelectContent>
              {venues.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Assign To (CPO) *</Label>
          <Select value={form.assignedTo} onValueChange={(v) => set("assignedTo", v)}>
            <SelectTrigger><SelectValue placeholder="Select a CPO" /></SelectTrigger>
            <SelectContent>
              {cpos.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No CPO users yet - add one from Admin &gt; Users</div>
              ) : (
                cpos.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Assigned By *</Label>
          <Select value={form.assignedBy} onValueChange={(v) => set("assignedBy", v)}>
            <SelectTrigger><SelectValue placeholder="Select a Manager" /></SelectTrigger>
            <SelectContent>
              {managers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No Manager/Admin users yet</div>
              ) : (
                managers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Task *</Label>
          <Input placeholder='e.g. "Complete assessment for venue X"' value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <Label>Due Date</Label>
          <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Assigning..." : "Assign Task"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function TasksList() {
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => api.tasks.updateStatus(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task updated" });
    },
  });

  return (
    <div className="space-y-5">
      {showNew && <NewTaskDialog venues={venues} users={users} onClose={() => setShowNew(false)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500 text-sm mt-0.5">Assign CPOs to complete structured work, tied to a venue</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Assign Task
        </Button>
      </div>

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
            return (
              <Card key={task.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", sc.color)}>
                          {sc.label}
                        </span>
                        {task.venueName && <span className="text-xs text-slate-500">{task.venueName}</span>}
                        {task.dueDate && <span className="text-xs text-slate-400 ml-auto">Due {formatDate(task.dueDate)}</span>}
                      </div>
                      <div className="font-semibold text-slate-900 text-sm mb-0.5">{task.title}</div>
                      <p className="text-xs text-slate-400">
                        {task.assignedToName && `Assigned to ${task.assignedToName}`}
                        {task.assignedByName && ` by ${task.assignedByName}`}
                      </p>
                    </div>
                    <Select value={task.status} onValueChange={(v) => statusMutation.mutate({ id: task.id, status: v as TaskStatus })}>
                      <SelectTrigger className="w-40 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_completed">Not Completed</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
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
