import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Contract, type ContractStatus, type ContractBillingFrequency, type Client } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FileSignature, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/display-utils";

export const CONTRACT_STATUS_CONFIG: Record<ContractStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "text-blue-700 bg-blue-50 border-blue-200" },
  expired: { label: "Expired", color: "text-slate-600 bg-slate-100 border-slate-200" },
  cancelled: { label: "Cancelled", color: "text-red-700 bg-red-50 border-red-200" },
};

const BILLING_FREQUENCY_LABELS: Record<ContractBillingFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

// "Renewing soon" is deliberately never stored - computed here from
// renewalDate, same EXPIRY_WARNING_DAYS-style convention already used
// for cert expiry (compliance.tsx/onboarding.tsx/hr.tsx) so it can
// never drift out of sync with the date itself.
const RENEWAL_WARNING_DAYS = 30;
function daysUntilRenewal(renewalDate: string): number {
  return Math.ceil((new Date(renewalDate + "T00:00:00").getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// Add/edit form - a Contract is always client-scoped (contractsTable.
// clientId is required/non-nullable, see schema/contracts.ts), so the
// Client picker is required, not optional. Status only carries the 3
// real lifecycle values (active/expired/cancelled) - "renewing soon"
// is a computed badge, not a 4th option here.
function ContractDialog({ contract, onClose }: { contract: Contract | null; onClose: () => void }) {
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });
  const [form, setForm] = useState({
    clientId: contract?.clientId ?? (clients[0]?.id ?? null as number | null),
    title: contract?.title ?? "",
    status: (contract?.status ?? "active") as ContractStatus,
    recurringAmount: contract?.recurringAmount != null ? String(contract.recurringAmount) : "",
    billingFrequency: (contract?.billingFrequency ?? "monthly") as ContractBillingFrequency,
    currency: contract?.currency ?? "ZAR",
    startDate: contract?.startDate ?? new Date().toISOString().slice(0, 10),
    renewalDate: contract?.renewalDate ?? "",
    notes: contract?.notes ?? "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        clientId: form.clientId!,
        title: form.title,
        status: form.status,
        recurringAmount: Number(form.recurringAmount) || 0,
        billingFrequency: form.billingFrequency,
        currency: form.currency.trim() || "ZAR",
        startDate: form.startDate,
        renewalDate: form.renewalDate,
        notes: form.notes,
      };
      return contract ? api.contracts.update(contract.id, data) : api.contracts.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: contract ? "Contract updated" : "Contract added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.clientId != null && form.title.trim() && Number(form.recurringAmount) >= 0 && form.startDate && form.renewalDate;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">{contract ? "Edit Contract" : "Add Contract"}</h2>
        <div>
          <Label>Client *</Label>
          <Select value={form.clientId != null ? String(form.clientId) : undefined} onValueChange={(v) => setForm((f) => ({ ...f, clientId: Number(v) }))}>
            <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Contract / Retainer Title *</Label>
          <Input placeholder="e.g. Executive Protection Retainer" value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CONTRACT_STATUS_CONFIG) as ContractStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{CONTRACT_STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Billing Frequency</Label>
            <Select value={form.billingFrequency} onValueChange={(v) => set("billingFrequency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(BILLING_FREQUENCY_LABELS) as ContractBillingFrequency[]).map((f) => (
                  <SelectItem key={f} value={f}>{BILLING_FREQUENCY_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Recurring Amount *</Label>
            <Input type="number" min="0" step="0.01" value={form.recurringAmount} onChange={(e) => set("recurringAmount", e.target.value)} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input maxLength={10} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label>Start Date *</Label>
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div>
            <Label>Renewal Date *</Label>
            <Input type="date" value={form.renewalDate} onChange={(e) => set("renewalDate", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={3} placeholder="Scope, terms, contacts..." value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Saving..." : contract ? "Save Changes" : "Add Contract"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Contract/retainer management - Following Roadmap Tier 3, item 17.
// Standing details + recurring revenue per client, distinct from
// one-off Tasks/Quotes. New dedicated page (scoped via
// AskUserQuestion) rather than embedded only in Client detail, so
// there's a single company-wide view of what's renewing soon -
// sorted soonest-renewal-first (server orders by renewalDate asc,
// same worst/most-urgent-first convention as Aging Receivables/Job
// Profitability elsewhere in this app).
export default function ContractsPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: contracts = [], isLoading } = useQuery<Contract[]>({ queryKey: ["contracts"], queryFn: api.contracts.list });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.contracts.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast({ title: "Contract removed" });
    },
  });

  return (
    <div className="space-y-5">
      {showDialog && <ContractDialog contract={null} onClose={() => setShowDialog(false)} />}
      {editingContract && <ContractDialog contract={editingContract} onClose={() => setEditingContract(null)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contracts</h1>
          <p className="text-slate-500 text-sm mt-0.5">Standing retainers and recurring revenue per client - separate from one-off Tasks and Quotes</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Contract
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : contracts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileSignature className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No contracts yet</h3>
            <p className="text-sm text-slate-400 mb-4">Add a standing retainer to start tracking recurring revenue here</p>
            <Button onClick={() => setShowDialog(true)}><Plus className="w-4 h-4 mr-1.5" />Add Contract</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left px-4 py-2.5">Contract</th>
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Recurring Amount</th>
                  <th className="text-left px-4 py-2.5">Renewal Date</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contracts.map((contract) => {
                  const sc = CONTRACT_STATUS_CONFIG[contract.status];
                  const days = daysUntilRenewal(contract.renewalDate);
                  const renewingSoon = contract.status === "active" && days <= RENEWAL_WARNING_DAYS;
                  return (
                    <tr key={contract.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{contract.title}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {contract.clientId ? (
                          <Link href={`/admin/clients/${contract.clientId}`} className="hover:underline hover:text-blue-600">
                            {contract.clientName ?? "Unknown client"}
                          </Link>
                        ) : (contract.clientName ?? "—")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 font-mono tabular-nums">
                        {formatMoney(contract.recurringAmount, contract.currency)}
                        <span className="text-slate-400 font-sans"> / {BILLING_FREQUENCY_LABELS[contract.billingFrequency].toLowerCase()}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-slate-700">{formatDate(contract.renewalDate)}</div>
                        {renewingSoon && (
                          <div className={cn("text-xs font-medium", days < 0 ? "text-red-700" : "text-amber-700")}>
                            {days < 0 ? `Overdue by ${Math.abs(days)}d` : `Renewing in ${days}d`}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingContract(contract)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(contract.id)} className="text-red-600">
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
