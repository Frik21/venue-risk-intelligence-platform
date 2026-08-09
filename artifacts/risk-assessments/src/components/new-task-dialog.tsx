import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Venue, type User, type TaskPriority } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

// Task Request - shared by the Management Dashboard's primary action
// and the full Tasks list page. Modelled as an intake form for a
// phone-in request (per direct product direction: "someone calls to
// say they need a CPO for these dates... operators amount/vehicles
// needed, special requests") rather than a bare title + one assignee -
// the CPO roster can hold several operators when a client asks for
// more than one.
export function NewTaskDialog({
  venues,
  users,
  onClose,
  initialAssigneeId,
}: {
  venues: Venue[];
  users: User[];
  onClose: () => void;
  // Pre-checks a CPO as assignee - used by Operator Onboarding's
  // "Assign User" button so approving an operator can flow straight
  // into giving them their first task.
  initialAssigneeId?: number;
}) {
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");
  const cpos = users.filter((u) => u.role === "cpo");
  const [form, setForm] = useState({
    venueId: "",
    assigneeIds: initialAssigneeId != null ? [initialAssigneeId] : [] as number[],
    assignedBy: "",
    title: "",
    dueDate: "",
    endDate: "",
    priority: "medium",
    clientName: "",
    clientContact: "",
    clientRequirements: "",
    operatorsRequired: "1",
    vehiclesRequired: "0",
    estimatedCost: "",
    estimatedCostCurrency: "ZAR",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.tasks.create({
        venueId: Number(form.venueId),
        assigneeIds: form.assigneeIds,
        assignedBy: Number(form.assignedBy),
        title: form.title,
        dueDate: form.dueDate || undefined,
        endDate: form.endDate || undefined,
        priority: form.priority as TaskPriority,
        clientName: form.clientName,
        clientContact: form.clientContact,
        clientRequirements: form.clientRequirements,
        operatorsRequired: Number(form.operatorsRequired) || 1,
        vehiclesRequired: Number(form.vehiclesRequired) || 0,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : null,
        estimatedCostCurrency: form.estimatedCostCurrency,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({ title: form.assigneeIds.length ? "Task assigned" : "Task request created - unassigned" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleAssignee = (id: number) =>
    setForm((f) => ({
      ...f,
      assigneeIds: f.assigneeIds.includes(id) ? f.assigneeIds.filter((x) => x !== id) : [...f.assigneeIds, id],
    }));
  // CPOs are deliberately optional - leaving everyone unchecked keeps
  // the request unassigned until a Manager picks who covers it.
  const canSubmit = form.venueId && form.assignedBy && form.title.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">New Task Request</h2>
          <p className="text-xs text-slate-400 mt-0.5">Capture the details of a client request and assign it when ready.</p>
        </div>

        <div>
          <Label>Task *</Label>
          <Input placeholder='e.g. "Close protection for venue X"' value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>

        <div>
          <Label>Venue *</Label>
          <Select value={form.venueId} onValueChange={(v) => set("venueId", v)}>
            <SelectTrigger><SelectValue placeholder="Select a venue" /></SelectTrigger>
            <SelectContent>
              {venues.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Client Name</Label>
            <Input placeholder="Who's requesting this" value={form.clientName} onChange={(e) => set("clientName", e.target.value)} />
          </div>
          <div>
            <Label>Client Contact</Label>
            <Input placeholder="Phone / email" value={form.clientContact} onChange={(e) => set("clientContact", e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Client Requirements / Special Requests</Label>
          <Textarea
            placeholder="Anything specific the client asked for..."
            value={form.clientRequirements}
            onChange={(e) => set("clientRequirements", e.target.value)}
          />
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
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Estimated Cost</Label>
          <div className="flex gap-2">
            <Input type="number" min={0} step="0.01" placeholder="0.00" value={form.estimatedCost} onChange={(e) => set("estimatedCost", e.target.value)} className="flex-1" />
            <Input value={form.estimatedCostCurrency} onChange={(e) => set("estimatedCostCurrency", e.target.value)} className="w-20" />
          </div>
        </div>

        <div>
          <Label>Assign CPO(s)</Label>
          {cpos.length === 0 ? (
            <p className="text-sm text-slate-400 mt-1">No CPO users yet - add one from Admin &gt; Users</p>
          ) : (
            <div className="border border-slate-200 rounded-md max-h-36 overflow-y-auto divide-y divide-slate-100 mt-1">
              {cpos.map((u) => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                  <Checkbox checked={form.assigneeIds.includes(u.id)} onCheckedChange={() => toggleAssignee(u.id)} />
                  {u.name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">Leave everyone unchecked to leave this request unassigned for now.</p>
        </div>

        <div>
          <Label>Assigned By (Manager) *</Label>
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

        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Creating..." : "Create Task Request"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
