import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Client, type ClientStatus, type Task, type Office } from "@/lib/api";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Briefcase, Plus, MoreVertical, Pencil, Trash2, PieChart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export const CLIENT_STATUS_CONFIG: Record<ClientStatus, { label: string; color: string }> = {
  lead: { label: "Lead", color: "text-amber-700 bg-amber-50 border-amber-200" },
  active: { label: "Active", color: "text-blue-700 bg-blue-50 border-blue-200" },
  vip: { label: "VIP", color: "text-purple-700 bg-purple-50 border-purple-200" },
  inactive: { label: "Inactive", color: "text-slate-600 bg-slate-100 border-slate-200" },
};

// Revenue concentration - Following Roadmap Tier 2, item 11 ("how
// exposed the business is to one account"). Reuses this page's own
// existing "approved" revenue rollup per client (same figure already
// shown in the ledger table's Approved column and Book Total row)
// rather than fetching Quotes/Invoices separately, so this can never
// disagree with what the ledger itself already says. Bucketed by
// currency rather than summed across them, same currency-naive
// convention documented on the Job Profitability table (costs.tsx) -
// a client's % share is only meaningful within one currency. Two
// warning tiers rather than one: notable exposure (25%+) gets an amber
// flag, genuine over-exposure (50%+, more than every other client
// combined) gets red - thresholds are a display choice, not a stored
// setting anywhere.
const CONCENTRATION_WARN_PCT = 25;
const CONCENTRATION_HIGH_PCT = 50;

function RevenueConcentrationCard({ rows, currency }: { rows: { name: string; amount: number; pct: number }[]; currency: string }) {
  if (rows.length === 0) return null;
  const top = rows[0];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-slate-400" /> Revenue Concentration ({currency})
          </h2>
        </div>
        {top.pct >= CONCENTRATION_WARN_PCT && (
          <p className={cn(
            "text-xs font-medium rounded-md px-2.5 py-1.5 mb-3 border",
            top.pct >= CONCENTRATION_HIGH_PCT ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200",
          )}>
            {top.name} accounts for {top.pct.toFixed(0)}% of {currency} approved revenue{top.pct >= CONCENTRATION_HIGH_PCT ? " - more than every other client combined" : ""}.
          </p>
        )}
        <div className="space-y-2">
          {rows.slice(0, 8).map((r) => (
            <div key={r.name} className="flex items-center gap-3 text-sm">
              <span className="w-32 truncate text-slate-700 shrink-0">{r.name}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-full", r.pct >= CONCENTRATION_HIGH_PCT ? "bg-red-500" : r.pct >= CONCENTRATION_WARN_PCT ? "bg-amber-500" : "bg-blue-500")}
                  style={{ width: `${Math.min(r.pct, 100)}%` }}
                />
              </div>
              <span className="w-12 text-right font-mono tabular-nums text-slate-500 shrink-0">{r.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// CRM-style profile fields per direct product direction - a
// structured primary contact person plus status/industry, rather
// than one freeform "contact" string. Notes live on the client's
// detail page now as a dated activity log (client_activities), not
// here - a brand new client just doesn't have any log entries yet.
export function ClientDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { data: offices = [] } = useQuery<Office[]>({ queryKey: ["offices"], queryFn: api.offices.list });
  const [selectedOfficeId] = useSelectedOfficeId();
  const [form, setForm] = useState({
    name: client?.name ?? "",
    status: (client?.status ?? "active") as ClientStatus,
    industry: client?.industry ?? "",
    primaryContactName: client?.primaryContactName ?? "",
    primaryContactRole: client?.primaryContactRole ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    address: client?.address ?? "",
    dayRate: client?.dayRate != null ? String(client.dayRate) : "",
    nightRate: client?.nightRate != null ? String(client.nightRate) : "",
    // New records inherit whichever office is currently selected in
    // the sidebar switcher - editable here, per direct product
    // direction ("inherit from selected office").
    officeId: (client?.officeId ?? selectedOfficeId) as number | null,
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name,
        status: form.status,
        industry: form.industry,
        primaryContactName: form.primaryContactName,
        primaryContactRole: form.primaryContactRole,
        email: form.email,
        phone: form.phone,
        address: form.address,
        dayRate: form.dayRate.trim() === "" ? null : Number(form.dayRate),
        nightRate: form.nightRate.trim() === "" ? null : Number(form.nightRate),
        officeId: form.officeId,
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
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Client / Organization Name *</Label>
            <Input placeholder="e.g. Acme Events" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CLIENT_STATUS_CONFIG) as ClientStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{CLIENT_STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Industry</Label>
            <Input placeholder="e.g. Corporate Events" value={form.industry} onChange={(e) => set("industry", e.target.value)} />
          </div>
          <div>
            <Label>Office</Label>
            <Select
              value={form.officeId != null ? String(form.officeId) : "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, officeId: v === "none" ? null : Number(v) }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No office</SelectItem>
                {offices.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Primary Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact Name</Label>
              <Input value={form.primaryContactName} onChange={(e) => set("primaryContactName", e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <Input placeholder="e.g. Event Manager" value={form.primaryContactRole} onChange={(e) => set("primaryContactRole", e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <Label>Day Rate</Label>
            <Input type="number" min={0} step="0.01" value={form.dayRate} onChange={(e) => set("dayRate", e.target.value)} />
          </div>
          <div>
            <Label>Night Rate</Label>
            <Input type="number" min={0} step="0.01" value={form.nightRate} onChange={(e) => set("nightRate", e.target.value)} />
          </div>
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

// Clients - a CRM-style record of the organizations/people requesting
// CPO services, per direct product direction. Kept separate from the
// freeform clientName/clientContact still typed on each task (see
// clientId in lib/db/src/schema/tasks.ts), since quotes and daily
// rates differ from client to client. A task can still be created for
// a one-off client with no record here at all - the picker on the
// task form is optional.
//
// Ledger-table layout rather than a card grid - per direct product
// direction ("user friendly but also like an accounting page") - with
// each client's quoted/approved totals rolled up from their linked
// tasks, and a totals row across the whole book. Clicking a client's
// name opens their full CRM detail page (profile, linked Tasks/
// Quotes, activity log).
export default function ClientsPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: allClients = [], isLoading } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });
  const [selectedOfficeId] = useSelectedOfficeId();
  const clients = filterByOffice(allClients, selectedOfficeId);

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

  const concentrationByCurrency = Object.entries(bookTotalApproved)
    .filter(([, total]) => total > 0)
    .map(([currency, total]) => ({
      currency,
      rows: clients
        .map((client) => {
          const { approved } = rollup(tasksByClient.get(client.id) ?? []);
          const amount = approved[currency] ?? 0;
          return { name: client.name, amount, pct: (amount / total) * 100 };
        })
        .filter((r) => r.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    }));

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
        <>
          {concentrationByCurrency.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {concentrationByCurrency.map(({ currency, rows }) => (
                <RevenueConcentrationCard key={currency} currency={currency} rows={rows} />
              ))}
            </div>
          )}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Primary Contact</th>
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
                  const sc = CLIENT_STATUS_CONFIG[client.status];
                  return (
                    <tr key={client.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        <Link href={`/admin/clients/${client.id}`} className="hover:underline hover:text-blue-600">{client.name}</Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {client.primaryContactName || client.email || client.phone || "—"}
                      </td>
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
                  <td className="px-4 py-2.5" colSpan={5}>Book Total</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{tasksByClient.size > 0 ? [...tasksByClient.values()].reduce((s, t) => s + t.length, 0) : 0}</td>
                  <td className="px-4 py-2.5 text-right"><CurrencyStack byCurrency={bookTotalQuoted} /></td>
                  <td className="px-4 py-2.5 text-right text-green-700"><CurrencyStack byCurrency={bookTotalApproved} /></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
        </>
      )}
    </div>
  );
}
