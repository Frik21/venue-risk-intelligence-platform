import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Venue, type User, type TaskPriority } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

// Task assignment - shared by the Admin Dashboard's "New Task" action
// and the full Tasks list page, so there's one form/mutation instead
// of two copies drifting apart.
export function NewTaskDialog({ venues, users, onClose }: { venues: Venue[]; users: User[]; onClose: () => void }) {
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");
  const cpos = users.filter((u) => u.role === "cpo");
  const [form, setForm] = useState({
    venueId: "",
    assignedTo: "",
    assignedBy: "",
    title: "",
    dueDate: "",
    priority: "medium",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.tasks.create({
        venueId: Number(form.venueId),
        assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
        assignedBy: Number(form.assignedBy),
        title: form.title,
        dueDate: form.dueDate || undefined,
        priority: form.priority as TaskPriority,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: form.assignedTo ? "Task assigned" : "Task created - unassigned" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  // CPO is deliberately optional - "Assign Later" leaves the task on
  // the Task Assignment Board until a Manager picks someone.
  const canSubmit = form.venueId && form.assignedBy && form.title.trim().length > 0;

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
          <Label>Assign To (CPO)</Label>
          <Select value={form.assignedTo} onValueChange={(v) => set("assignedTo", v)}>
            <SelectTrigger><SelectValue placeholder="Assign later" /></SelectTrigger>
            <SelectContent>
              {cpos.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No CPO users yet - add one from Admin &gt; Users</div>
              ) : (
                cpos.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-400 mt-1">Leave blank to leave this task unassigned for now.</p>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
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
