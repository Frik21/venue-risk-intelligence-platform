import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api, type Invoice, type Task, type User, type Client, type Quote, type InvoiceStatus,
  type QuoteCostCategory, QUOTE_COST_CATEGORIES, type Office,
} from "@/lib/api";
import { useSelectedOfficeId } from "@/lib/office-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ClientCombobox } from "@/components/new-task-dialog";

const STATUS_LABELS: Record<InvoiceStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-slate-600 bg-slate-100 border-slate-200" },
  sent: { label: "Sent", color: "text-amber-700 bg-amber-50 border-amber-200" },
  paid: { label: "Paid", color: "text-green-700 bg-green-50 border-green-200" },
};

// Same vocabulary as Quotes' own cost build-up (quote-dialog.tsx) -
// lets a Manager add categorized costs incurred beyond the originally
// quoted amount (operational costs, additional manpower, vehicles,
// etc.), per direct product direction. NONE_CATEGORY represents "no
// category" (the uncategorized base line item an auto-created
// invoice starts with) - a real Select needs a non-empty value even
// for its "none of these" option.
const NONE_CATEGORY = "none";
const CATEGORY_LABELS: Record<QuoteCostCategory, string> = {
  cpo_rate: "CPO Rate", overtime: "Overtime", vehicles: "Vehicle Costs", fuel_mileage: "Fuel / Mileage",
  accommodation: "Accommodation", flights_travel: "Flights / Travel", equipment: "Equipment",
  subcontractors: "Subcontractors", allowances: "Allowances / Per Diem", misc: "Miscellaneous",
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// Same T-000x/Q-000x formula as tasks.ts/quotes.ts on the backend -
// lets a reopened, already-saved invoice show where it came from
// (taskId/quoteId) even when initialTask/initialQuote (only set on
// the one-time creation flow) aren't passed.
function refNumber(prefix: string, id: number) {
  return `${prefix}-${String(id).padStart(4, "0")}`;
}

// Invoice creation/edit flow - a separate, simpler entity/lifecycle
// from Quotes (schema/invoices.ts): billing line items + a tax rate,
// no cost-category build-up or markup, since an invoice bills an
// already-agreed amount rather than working one out. Per direct
// product direction ("client invoices - money owed to you").
export function InvoiceDialog({
  invoice, initialTask, initialQuote, users, clients, onClose,
}: {
  invoice: Invoice | null;
  // Prefills the form from a completed Task when creating an invoice
  // from Invoices > Task Pending Invoice - the task drops off that
  // list once its invoice is saved (see taskId on schema/invoices.ts)
  // and gets marked invoiced server-side (see PATCH /invoices/:id).
  initialTask?: Task | null;
  // If the task has an approved Quote, prefills client info and a
  // single line item from the quote's total - the common "turn an
  // approved quote into a bill" path.
  initialQuote?: Quote | null;
  users: User[];
  clients: Client[];
  onClose: () => void;
}) {
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");
  const { data: offices = [] } = useQuery<Office[]>({ queryKey: ["offices"], queryFn: api.offices.list });
  const [selectedOfficeId] = useSelectedOfficeId();

  const [savedId, setSavedId] = useState<number | null>(invoice?.id ?? null);
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoiceNumber ?? null);
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? "draft");
  const [createdAt] = useState(invoice?.createdAt ?? null);
  const taskId = invoice?.taskId ?? initialTask?.id ?? null;
  const quoteId = invoice?.quoteId ?? initialQuote?.id ?? null;

  const [form, setForm] = useState({
    title: invoice?.title ?? initialQuote?.title ?? initialTask?.title ?? "",
    officeId: (invoice?.officeId ?? initialQuote?.officeId ?? initialTask?.officeId ?? selectedOfficeId) as number | null,
    dueDate: invoice?.dueDate ? invoice.dueDate.slice(0, 10) : "",
    clientId: invoice?.clientId ?? initialQuote?.clientId ?? initialTask?.clientId ?? null as number | null,
    clientName: invoice?.clientName ?? initialQuote?.clientName ?? initialTask?.clientName ?? "",
    clientContact: invoice?.clientContact ?? initialQuote?.clientContact ?? initialTask?.clientContact ?? "",
    billingDetails: invoice?.billingDetails ?? initialQuote?.billingDetails ?? "",
    taxRatePercent: String(invoice?.taxRatePercent ?? initialQuote?.taxRatePercent ?? 0),
    currency: invoice?.currency ?? initialQuote?.currency ?? "ZAR",
    assignedBy: invoice?.assignedBy != null ? String(invoice.assignedBy)
      : initialQuote?.assignedBy != null ? String(initialQuote.assignedBy)
      : initialTask?.assignedBy != null ? String(initialTask.assignedBy) : "",
  });

  const [lineItems, setLineItems] = useState<{ category: QuoteCostCategory | null; description: string; amount: string }[]>(
    invoice && invoice.lineItems.length > 0
      ? invoice.lineItems.map((i) => ({ category: i.category, description: i.description, amount: String(i.amount) }))
      : initialQuote
        ? [{ category: null, description: initialQuote.title || "Services rendered", amount: String(initialQuote.totalQuoteValue) }]
        : [{ category: null, description: "", amount: "" }],
  );

  const qc = useQueryClient();
  const { toast } = useToast();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const updateLineItem = (idx: number, field: "description" | "amount", value: string) => {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const updateLineItemCategory = (idx: number, value: string) => {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, category: value === NONE_CATEGORY ? null : (value as QuoteCostCategory) } : it)));
  };
  // New rows default to "misc" rather than no category - they're
  // typically an added cost beyond the quoted amount, the case this
  // category field exists for.
  const addLineItem = () => setLineItems((prev) => [...prev, { category: "misc", description: "", amount: "" }]);
  const removeLineItem = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));

  // Live-computed totals, same formula as computeTotals() on the
  // backend (routes/invoices.ts) - kept in sync so the preview here
  // always matches what gets persisted on save.
  const subtotal = lineItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const taxAmount = subtotal * ((Number(form.taxRatePercent) || 0) / 100);
  const totalAmount = subtotal + taxAmount;

  const saveMutation = useMutation({
    mutationFn: async (nextStatus?: InvoiceStatus) => {
      const payload = {
        taskId,
        quoteId,
        officeId: form.officeId,
        title: form.title,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        clientId: form.clientId,
        clientName: form.clientName,
        clientContact: form.clientContact,
        billingDetails: form.billingDetails,
        lineItems: lineItems
          .filter((i) => i.description.trim() !== "" || Number(i.amount))
          .map((i) => ({ category: i.category, description: i.description.trim(), amount: Number(i.amount) || 0 })),
        taxRatePercent: Number(form.taxRatePercent) || 0,
        currency: form.currency.trim() || "ZAR",
        assignedBy: Number(form.assignedBy),
        ...(nextStatus ? { status: nextStatus } : {}),
      };
      return savedId != null ? api.invoices.update(savedId, payload) : api.invoices.create({ ...payload, assignedBy: Number(form.assignedBy) });
    },
    onSuccess: (inv) => {
      setSavedId(inv.id);
      setInvoiceNumber(inv.invoiceNumber);
      setStatus(inv.status);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      // A saved invoice linked to a task marks that task invoiced
      // server-side (see PATCH/POST /invoices) - refetch tasks so the
      // Tasks list's Invoiced bucket picks it up immediately.
      if (inv.taskId != null) qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({
        title: inv.status === "sent" ? "Invoice sent" : inv.status === "paid" ? "Invoice marked paid" : "Draft saved",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit = form.assignedBy !== "";
  const statusInfo = STATUS_LABELS[status];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 p-6 space-y-5">
        {/* 1. Invoice Details */}
        <div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold">{invoiceNumber ?? "New Invoice"}</h2>
            <span className={cn("text-xs font-medium border rounded-full px-2 py-0.5", statusInfo.color)}>{statusInfo.label}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {createdAt ? `Issued ${new Date(createdAt).toLocaleDateString()}` : "Auto-generated invoice number is assigned on first save."}
            {(initialTask?.taskNumber ?? (taskId != null ? refNumber("T", taskId) : null)) &&
              ` · From ${initialTask?.taskNumber ?? refNumber("T", taskId!)}`}
            {(initialQuote?.quoteNumber ?? (quoteId != null ? refNumber("Q", quoteId) : null)) &&
              ` · From ${initialQuote?.quoteNumber ?? refNumber("Q", quoteId!)}`}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="col-span-2">
              <Label>Invoice Title</Label>
              <Input placeholder='e.g. "Close protection for venue X"' value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
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
        </div>

        {/* 2. Bill To */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">1. Bill To</h3>
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

        {/* 3. Line Items */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">2. Line Items</h3>
          <p className="text-xs text-slate-400 mb-2">
            Category is optional - use it to add costs incurred beyond the originally billed amount (operational costs, additional manpower, vehicles, etc.).
          </p>
          <div className="space-y-2">
            {lineItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Select value={item.category ?? NONE_CATEGORY} onValueChange={(v) => updateLineItemCategory(idx, v)}>
                  <SelectTrigger className="h-8 w-40 text-xs shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_CATEGORY}>No category</SelectItem>
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
            <button type="button" onClick={addLineItem} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Line Item
            </button>
          </div>
        </div>

        {/* 4. Totals */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">3. Totals</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
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
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono tabular-nums">{formatMoney(subtotal, form.currency)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Tax / VAT</span><span className="font-mono tabular-nums">{formatMoney(taxAmount, form.currency)}</span></div>
            <div className="flex justify-between pt-1 mt-1 border-t border-slate-200 font-semibold text-slate-900"><span>Total Due</span><span className="font-mono tabular-nums">{formatMoney(totalAmount, form.currency)}</span></div>
          </div>
        </div>

        {/* 5. Assignment */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">4. Issued By</h3>
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

        {/* Actions */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <Button onClick={() => saveMutation.mutate(undefined)} disabled={saveMutation.isPending || !canSubmit}>
            {saveMutation.isPending ? "Saving..." : "Save Draft"}
          </Button>
          {savedId != null && (
            <>
              <a href={`/api/invoices/${savedId}/pdf?preview=1`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                Preview Invoice
              </a>
              <a href={`/api/invoices/${savedId}/pdf`} download className="text-xs text-blue-600 hover:underline">
                Generate PDF
              </a>
              {status === "draft" && (
                <Button type="button" variant="outline" onClick={() => saveMutation.mutate("sent")} disabled={saveMutation.isPending}>
                  Send / Mark Sent
                </Button>
              )}
              {status !== "paid" && (
                <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={() => saveMutation.mutate("paid")} disabled={saveMutation.isPending}>
                  Mark Paid
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
