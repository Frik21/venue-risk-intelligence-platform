import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api, type Quote, type Task, type Venue, type User, type Client, type TaskPriority,
  type QuoteStatus, type QuoteMarkupType, type QuoteCostCategory, QUOTE_COST_CATEGORIES,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LocationCombobox, ClientCombobox } from "@/components/new-task-dialog";

const CATEGORY_LABELS: Record<QuoteCostCategory, string> = {
  cpo_rate: "CPO Rate", overtime: "Overtime", vehicles: "Vehicle Costs", fuel_mileage: "Fuel / Mileage",
  accommodation: "Accommodation", flights_travel: "Flights / Travel", equipment: "Equipment",
  subcontractors: "Subcontractors", allowances: "Allowances / Per Diem", misc: "Miscellaneous",
};

const STATUS_LABELS: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-slate-600 bg-slate-100 border-slate-200" },
  sent: { label: "Sent", color: "text-amber-700 bg-amber-50 border-amber-200" },
  approved: { label: "Approved", color: "text-green-700 bg-green-50 border-green-200" },
  rejected: { label: "Rejected", color: "text-red-700 bg-red-50 border-red-200" },
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// Full quote-creation flow (replaces the old shortcut into a Task's
// Quotation Workspace) - all 8 sections per direct product direction:
// Quote Details, Client, Operational Requirement, Resources Required,
// Cost Build-Up, Commercials, Assignment/Ownership, Quote Summary, plus
// the 5 actions (Save Draft, Preview Quote, Generate PDF, Send/Mark
// Sent, Approve/Reject). Backs a separate Quotes entity/lifecycle (see
// schema/quotes.ts) - confirmed via direct product direction, not the
// Task-level quotationStatus mechanism. Costs are manual line items,
// no rate auto-calculation, also per direct product direction.
export function QuoteDialog({
  quote, initialTask, venues, users, clients, onClose,
}: {
  quote: Quote | null;
  // Prefills the form from a Task Request when creating a quote from
  // Quotations > Task Pending Quotation - the task drops off that list
  // once its quote is saved (see taskId on schema/quotes.ts).
  initialTask?: Task | null;
  venues: Venue[];
  users: User[];
  clients: Client[];
  onClose: () => void;
}) {
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");

  const [savedId, setSavedId] = useState<number | null>(quote?.id ?? null);
  const [quoteNumber, setQuoteNumber] = useState(quote?.quoteNumber ?? null);
  const [status, setStatus] = useState<QuoteStatus>(quote?.status ?? "draft");
  const [createdAt] = useState(quote?.createdAt ?? null);
  const taskId = quote?.taskId ?? initialTask?.id ?? null;

  const [form, setForm] = useState({
    title: quote?.title ?? initialTask?.title ?? "",
    validUntil: quote?.validUntil ? quote.validUntil.slice(0, 10) : "",
    clientId: quote?.clientId ?? initialTask?.clientId ?? null as number | null,
    clientName: quote?.clientName ?? initialTask?.clientName ?? "",
    clientContact: quote?.clientContact ?? initialTask?.clientContact ?? "",
    billingDetails: quote?.billingDetails ?? "",
    venueId: quote?.venueId != null ? String(quote.venueId) : initialTask?.venueId != null ? String(initialTask.venueId) : "",
    clientRequirements: quote?.clientRequirements ?? initialTask?.clientRequirements ?? "",
    startDate: quote?.startDate ? quote.startDate.slice(0, 16) : initialTask?.dueDate ? initialTask.dueDate.slice(0, 16) : "",
    endDate: quote?.endDate ? quote.endDate.slice(0, 16) : initialTask?.endDate ? initialTask.endDate.slice(0, 16) : "",
    priority: (quote?.priority ?? initialTask?.priority ?? "medium") as TaskPriority,
    operatorsRequired: String(quote?.operatorsRequired ?? initialTask?.operatorsRequired ?? 1),
    armedRequired: quote?.armedRequired ?? initialTask?.armedRequired ?? false,
    vehiclesRequired: String(quote?.vehiclesRequired ?? initialTask?.vehiclesRequired ?? 0),
    additionalEquipment: quote?.additionalEquipment ?? "",
    markupType: (quote?.markupType ?? "percent") as QuoteMarkupType,
    markupValue: String(quote?.markupValue ?? 0),
    taxRatePercent: String(quote?.taxRatePercent ?? 0),
    currency: quote?.currency ?? "ZAR",
    assignedBy: quote?.assignedBy != null ? String(quote.assignedBy) : initialTask?.assignedBy != null ? String(initialTask.assignedBy) : "",
  });

  const [costLineItems, setCostLineItems] = useState<{ category: QuoteCostCategory; description: string; amount: string }[]>(
    quote && quote.costLineItems.length > 0
      ? quote.costLineItems.map((i) => ({ category: i.category, description: i.description, amount: String(i.amount) }))
      : [{ category: "cpo_rate", description: "", amount: "" }],
  );

  const qc = useQueryClient();
  const { toast } = useToast();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const updateLineItem = (idx: number, field: "category" | "description" | "amount", value: string) => {
    setCostLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const addLineItem = () => setCostLineItems((prev) => [...prev, { category: "misc", description: "", amount: "" }]);
  const removeLineItem = (idx: number) => setCostLineItems((prev) => prev.filter((_, i) => i !== idx));

  // Live-computed Commercials, same formula as computeCommercials() on
  // the backend (routes/quotes.ts) - kept in sync so the preview here
  // always matches what gets persisted on save.
  const internalCost = costLineItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const markupValueNum = Number(form.markupValue) || 0;
  const markupAmount = form.markupType === "percent" ? internalCost * (markupValueNum / 100) : markupValueNum;
  const clientPrice = internalCost + markupAmount;
  const taxAmount = clientPrice * ((Number(form.taxRatePercent) || 0) / 100);
  const totalQuoteValue = clientPrice + taxAmount;
  const marginPercent = internalCost > 0 ? (markupAmount / internalCost) * 100 : 0;

  const saveMutation = useMutation({
    mutationFn: async (nextStatus?: QuoteStatus) => {
      const payload = {
        taskId,
        title: form.title,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
        clientId: form.clientId,
        clientName: form.clientName,
        clientContact: form.clientContact,
        billingDetails: form.billingDetails,
        venueId: form.venueId ? Number(form.venueId) : null,
        clientRequirements: form.clientRequirements,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        priority: form.priority,
        operatorsRequired: Number(form.operatorsRequired) || 1,
        armedRequired: form.armedRequired,
        vehiclesRequired: Number(form.vehiclesRequired) || 0,
        additionalEquipment: form.additionalEquipment,
        costLineItems: costLineItems
          .filter((i) => i.description.trim() !== "" || Number(i.amount))
          .map((i) => ({ category: i.category, description: i.description.trim(), amount: Number(i.amount) || 0 })),
        markupType: form.markupType,
        markupValue: markupValueNum,
        taxRatePercent: Number(form.taxRatePercent) || 0,
        currency: form.currency.trim() || "ZAR",
        assignedBy: Number(form.assignedBy),
        ...(nextStatus ? { status: nextStatus } : {}),
      };
      return savedId != null ? api.quotes.update(savedId, payload) : api.quotes.create({ ...payload, assignedBy: Number(form.assignedBy) });
    },
    onSuccess: (q) => {
      setSavedId(q.id);
      setQuoteNumber(q.quoteNumber);
      setStatus(q.status);
      qc.invalidateQueries({ queryKey: ["quotes"] });
      // Approving moves the linked task's quotationStatus server-side
      // too (see PATCH /quotes/:id) - refetch tasks so the Tasks
      // list's Pending Allocation bucket picks it up immediately.
      if (q.status === "approved") qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({
        title: q.status === "sent" ? "Quote sent" : q.status === "approved" ? "Quote approved" : q.status === "rejected" ? "Quote rejected" : "Draft saved",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit = form.assignedBy !== "";
  const statusInfo = STATUS_LABELS[status];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 p-6 space-y-5">
        {/* 1. Quote Details */}
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold">{quoteNumber ?? "New Quote"}</h2>
            <span className={cn("text-xs font-medium border rounded-full px-2 py-0.5", statusInfo.color)}>{statusInfo.label}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {createdAt ? `Created ${new Date(createdAt).toLocaleDateString()}` : "Auto-generated quote number is assigned on first save."}
            {initialTask && ` · From ${initialTask.taskNumber}`}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="col-span-2">
              <Label>Quote Title</Label>
              <Input placeholder='e.g. "Close protection for venue X"' value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <Label>Valid Until</Label>
              <Input type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
            </div>
          </div>
        </div>

        {/* 2. Client */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">1. Client</h3>
          <div className="space-y-3">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Client Name</Label>
                <Input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} />
              </div>
              <div>
                <Label>Client Contact</Label>
                <Input value={form.clientContact} onChange={(e) => set("clientContact", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Billing Details</Label>
              <Textarea placeholder="Address, VAT / registration number, etc. (if needed)" value={form.billingDetails} onChange={(e) => set("billingDetails", e.target.value)} />
            </div>
          </div>
        </div>

        {/* 3. Operational Requirement */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">2. Operational Requirement</h3>
          <div className="space-y-3">
            <div>
              <Label>Location</Label>
              <LocationCombobox venues={venues} value={form.venueId} onChange={(v) => set("venueId", v)} />
            </div>
            <div>
              <Label>Client Requirements / Special Requests</Label>
              <Textarea value={form.clientRequirements} onChange={(e) => set("clientRequirements", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Start Date/Time</Label>
                <Input type="datetime-local" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </div>
              <div>
                <Label>End Date/Time</Label>
                <Input type="datetime-local" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
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
          </div>
        </div>

        {/* 4. Resources Required */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">3. Resources Required</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CPOs / Operators</Label>
              <Input type="number" min={0} value={form.operatorsRequired} onChange={(e) => set("operatorsRequired", e.target.value)} />
              <label className="flex items-center gap-2 text-xs text-slate-600 mt-1.5 cursor-pointer">
                <Checkbox checked={form.armedRequired} onCheckedChange={(v) => setForm((f) => ({ ...f, armedRequired: v === true }))} />
                Armed
              </label>
            </div>
            <div>
              <Label>Vehicles</Label>
              <Input type="number" min={0} value={form.vehiclesRequired} onChange={(e) => set("vehiclesRequired", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Additional Equipment / Services</Label>
              <Textarea value={form.additionalEquipment} onChange={(e) => set("additionalEquipment", e.target.value)} />
            </div>
          </div>
        </div>

        {/* 5. Cost Build-Up */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">4. Cost Build-Up</h3>
          <div className="space-y-2">
            {costLineItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Select value={item.category} onValueChange={(v) => updateLineItem(idx, "category", v)}>
                  <SelectTrigger className="h-8 text-xs w-40 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUOTE_COST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Description"
                  className="h-8 text-xs flex-1"
                  value={item.description}
                  onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  className="h-8 w-28 text-xs font-mono tabular-nums"
                  value={item.amount}
                  onChange={(e) => updateLineItem(idx, "amount", e.target.value)}
                />
                <button type="button" onClick={() => removeLineItem(idx)} className="text-slate-400 hover:text-red-600 shrink-0" aria-label="Remove line item">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={addLineItem} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Cost Line Item
              </button>
              <span className="text-xs text-slate-500">
                Internal Cost: <span className="font-mono tabular-nums font-semibold text-slate-900">{formatMoney(internalCost, form.currency)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 6. Commercials */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">5. Commercials</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label>Markup Type</Label>
              <Select value={form.markupType} onValueChange={(v) => set("markupType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Markup / Margin {form.markupType === "percent" ? "(%)" : `(${form.currency})`}</Label>
              <Input type="number" step="0.01" value={form.markupValue} onChange={(e) => set("markupValue", e.target.value)} />
            </div>
            <div>
              <Label>Tax / VAT (%)</Label>
              <Input type="number" step="0.01" min={0} value={form.taxRatePercent} onChange={(e) => set("taxRatePercent", e.target.value)} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input maxLength={10} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Internal Estimated Cost</span><span className="font-mono tabular-nums">{formatMoney(internalCost, form.currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Markup</span><span className="font-mono tabular-nums">{formatMoney(markupAmount, form.currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Client Price</span><span className="font-mono tabular-nums">{formatMoney(clientPrice, form.currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Tax / VAT</span><span className="font-mono tabular-nums">{formatMoney(taxAmount, form.currency)}</span></div>
            <div className="flex justify-between pt-1 mt-1 border-t border-slate-200 font-semibold text-slate-900"><span>Total Quote Value</span><span className="font-mono tabular-nums">{formatMoney(totalQuoteValue, form.currency)}</span></div>
          </div>
        </div>

        {/* 7. Assignment / Ownership */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">6. Assignment / Ownership</h3>
          <div>
            <Label>Responsible Manager *</Label>
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
        </div>

        {/* 8. Quote Summary */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">7. Quote Summary</h3>
          <div className="rounded-lg border border-slate-200 p-3 space-y-1 text-xs text-slate-600">
            <div><span className="text-slate-400">Scope:</span> {form.title || "Untitled quote"}</div>
            <div>
              <span className="text-slate-400">Dates:</span>{" "}
              {form.startDate && form.endDate ? `${new Date(form.startDate).toLocaleDateString()} — ${new Date(form.endDate).toLocaleDateString()}` : "—"}
            </div>
            <div>
              <span className="text-slate-400">Resources:</span>{" "}
              {form.operatorsRequired} operator{Number(form.operatorsRequired) !== 1 ? "s" : ""}
              {form.armedRequired ? " (Armed)" : ""}, {form.vehiclesRequired} vehicle{Number(form.vehiclesRequired) !== 1 ? "s" : ""}
            </div>
            <div><span className="text-slate-400">Internal Cost:</span> <span className="font-mono tabular-nums">{formatMoney(internalCost, form.currency)}</span></div>
            <div><span className="text-slate-400">Client Total:</span> <span className="font-mono tabular-nums font-semibold text-slate-900">{formatMoney(totalQuoteValue, form.currency)}</span></div>
            <div><span className="text-slate-400">Expected Margin:</span> {marginPercent.toFixed(1)}%</div>
          </div>
        </div>

        {/* 8. Actions */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <Button onClick={() => saveMutation.mutate(undefined)} disabled={saveMutation.isPending || !canSubmit}>
            {saveMutation.isPending ? "Saving..." : "Save Draft"}
          </Button>
          {savedId != null && (
            <>
              <a href={`/api/quotes/${savedId}/pdf?preview=1`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                Preview Quote
              </a>
              <a href={`/api/quotes/${savedId}/pdf`} download className="text-xs text-blue-600 hover:underline">
                Generate PDF
              </a>
              {status === "draft" && (
                <Button type="button" variant="outline" onClick={() => saveMutation.mutate("sent")} disabled={saveMutation.isPending}>
                  Send / Mark Sent
                </Button>
              )}
              {status === "sent" && (
                <>
                  <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={() => saveMutation.mutate("approved")} disabled={saveMutation.isPending}>
                    Approve
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => saveMutation.mutate("rejected")} disabled={saveMutation.isPending}>
                    Reject
                  </Button>
                </>
              )}
            </>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
