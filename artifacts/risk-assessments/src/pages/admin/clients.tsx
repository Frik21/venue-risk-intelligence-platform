import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Client, type Task } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Briefcase, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function ClientDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: client?.name ?? "",
    contact: client?.contact ?? "",
    dayRate: client?.dayRate != null ? String(client.dayRate) : "",
    nightRate: client?.nightRate != null ? String(client.nightRate) : "",
    notes: client?.notes ?? "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name,
        contact: form.contact,
        dayRate: form.dayRate.trim() === "" ? null : Number(form.dayRate),
        nightRate: form.nightRate.trim() === "" ? null : Number(form.nightRate),
        notes: form.notes,
      };
      return client ? api.clients.update(client.id, data) : api.clients.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: client ? "Client updated" : "Client added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.name.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">{client ? "Edit Client" : "Add Client"}</h2>
        <div>
          <Label>Client Name *</Label>
          <Input placeholder="e.g. Acme Events" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label>Contact</Label>
          <Input placeholder="Phone / email" value={form.contact} onChange={(e) => set("contact", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Day Rate</Label>
            <Input type="number" min={0} step="0.01" value={form.dayRate} onChange={(e) => set("dayRate", e.target.value)} />
          </div>
          <div>
            <Label>Night Rate</Label>
            <Input type="number" min={0} step="0.01" value={form.nightRate} onChange={(e) => set("nightRate", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Saving..." : client ? "Save Changes" : "Add Client"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// One currency-bucketed amount per line, stacked when a client's tasks
// span more than one currency (same currency-naive convention as the
// Quotations page - see its own comment on totalCostByTask).
function CurrencyStack({ byCurrency }: { byCurrency: Record<string, number> }) {
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-col items-end">
      {entries.map(([cur, amt]) => (
        <span key={cur} className="font-mono tabular-nums">{formatMoney(amt, cur)}</span>
      ))}
    </div>
  );
}

// Clients - the organizations/people requesting CPO services, kept
// separate from the freeform clientName/clientContact still typed on
// each task (see clientId in lib/db/src/schema/tasks.ts), since quotes
// and daily rates differ from client to client, per direct product
// direction. A task can still be created for a one-off client with no
// record here at all - the picker on the task form is optional.
//
// Ledger-table layout rather than a card grid - per direct product
// direction ("user friendly but also like an accounting page") - with
// each client's quoted/approved totals rolled up from their linked
// tasks, and a totals row across the whole book.
export default function ClientsPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: clients = [], isLoading } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.clients.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Client removed" });
    },
  });

  const tasksByClient = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.clientId == null || t.archived) continue;
    (tasksByClient.get(t.clientId) ?? tasksByClient.set(t.clientId, []).get(t.clientId)!).push(t);
  }

  function rollup(clientTasks: Task[]) {
    const quoted: Record<string, number> = {};
    const approved: Record<string, number> = {};
    for (const t of clientTasks) {
      if (t.estimatedCost == null) continue;
      quoted[t.estimatedCostCurrency] = (quoted[t.estimatedCostCurrency] ?? 0) + t.estimatedCost;
      if (t.quotationStatus === "approved") {
        approved[t.estimatedCostCurrency] = (approved[t.estimatedCostCurrency] ?? 0) + t.estimatedCost;
      }
    }
    return { quoted, approved, count: clientTasks.length };
  }

  const bookTotalQuoted: Record<string, number> = {};
  const bookTotalApproved: Record<string, number> = {};
  for (const client of clients) {
    const { quoted, approved } = rollup(tasksByClient.get(client.id) ?? []);
    for (const [cur, amt] of Object.entries(quoted)) bookTotalQuoted[cur] = (bookTotalQuoted[cur] ?? 0) + amt;
    for (const [cur, amt] of Object.entries(approved)) bookTotalApproved[cur] = (bookTotalApproved[cur] ?? 0) + amt;
  }

  return (
    <div className="space-y-5">
      {showDialog && <ClientDialog client={null} onClose={() => setShowDialog(false)} />}
      {editingClient && <ClientDialog client={editingClient} onClose={() => setEditingClient(null)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm mt-0.5">Client organizations, contacts, and day/night rates - link a task to one from the request form</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Client
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No clients yet</h3>
            <p className="text-sm text-slate-400 mb-4">Add your first client to start linking tasks and rates to them</p>
            <Button onClick={() => setShowDialog(true)}><Plus className="w-4 h-4 mr-1.5" />Add Client</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-left px-4 py-2.5">Contact</th>
                  <th className="text-right px-4 py-2.5">Day Rate</th>
                  <th className="text-right px-4 py-2.5">Night Rate</th>
                  <th className="text-right px-4 py-2.5">Tasks</th>
                  <th className="text-right px-4 py-2.5">Total Quoted</th>
                  <th className="text-right px-4 py-2.5">Approved</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => {
                  const { quoted, approved, count } = rollup(tasksByClient.get(client.id) ?? []);
                  return (
                    <tr key={client.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{client.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{client.contact || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                        {client.dayRate != null ? client.dayRate.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                        {client.nightRate != null ? client.nightRate.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {count > 0 ? (
                          <Link href="/tasks" className="text-blue-600 hover:underline">{count}</Link>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right"><CurrencyStack byCurrency={quoted} /></td>
                      <td className="px-4 py-2.5 text-right text-green-700"><CurrencyStack byCurrency={approved} /></td>
                      <td className="px-2 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingClient(client)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(client.id)} className="text-red-600">
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={cn("border-t-2 border-slate-300 font-semibold text-slate-900")}>
                  <td className="px-4 py-2.5" colSpan={4}>Book Total</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{tasksByClient.size > 0 ? [...tasksByClient.values()].reduce((s, t) => s + t.length, 0) : 0}</td>
                  <td className="px-4 py-2.5 text-right"><CurrencyStack byCurrency={bookTotalQuoted} /></td>
                  <td className="px-4 py-2.5 text-right text-green-700"><CurrencyStack byCurrency={bookTotalApproved} /></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
