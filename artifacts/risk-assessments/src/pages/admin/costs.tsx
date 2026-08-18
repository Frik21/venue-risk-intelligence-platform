import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type GlobalExpense, type PersonnelCostLine, type CompanySettings, type Task, type QuotationStatus, type ExpenseCategory, type Venue, type User, type Client, type Quote } from "@/lib/api";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Wallet, CheckCircle2, Clock, XCircle, Users as UsersIcon, Settings, Pencil, Car, FileText, Plus, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { QuotationStatusPicker } from "@/components/new-task-dialog";
import { QuoteDialog } from "@/components/quote-dialog";
import { cn } from "@/lib/utils";

const QUOTE_STATUS_CONFIG: Record<Quote["status"], { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-slate-600 bg-slate-100 border-slate-200" },
  sent: { label: "Sent", color: "text-amber-700 bg-amber-50 border-amber-200" },
  approved: { label: "Approved", color: "text-green-700 bg-green-50 border-green-200" },
  rejected: { label: "Rejected", color: "text-red-700 bg-red-50 border-red-200" },
};

const CATEGORY_LABELS: Record<string, string> = {
  fuel: "Fuel", accommodation: "Accommodation", food: "Food", parking: "Parking",
  tolls: "Tolls", equipment: "Equipment", other: "Other",
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// One currency-bucketed amount per line, stacked when a set of records
// spans more than one currency - same currency-naive convention as
// totalCostByTask below.
function CurrencyStack({ byCurrency, className }: { byCurrency: Record<string, number>; className?: string }) {
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex flex-col">
      {entries.map(([cur, amt]) => (
        <span key={cur} className={cn("font-mono tabular-nums", className)}>{formatMoney(amt, cur)}</span>
      ))}
    </div>
  );
}

// A small financial statement tile - formal/muted rather than a
// dashboard-bright stat card, per direct product direction ("like an
// accounting page").
function StatTile({ icon: Icon, label, byCurrency, tone = "default" }: {
  icon: typeof DollarSign;
  label: string;
  byCurrency: Record<string, number>;
  tone?: "default" | "positive" | "warning" | "negative";
}) {
  const toneClass = {
    default: "text-slate-900",
    positive: "text-green-700",
    warning: "text-amber-700",
    negative: "text-red-700",
  }[tone];
  return (
    <div className="border border-slate-200 rounded-lg bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <CurrencyStack byCurrency={byCurrency} className={cn("text-base font-semibold", toneClass)} />
    </div>
  );
}

function OvertimeSettingsPanel({ settings }: { settings: CompanySettings }) {
  const [editing, setEditing] = useState(false);
  const [thresholdHours, setThresholdHours] = useState(String(settings.overtimeThresholdHours));
  const [period, setPeriod] = useState(settings.overtimeThresholdPeriod);
  const [multiplier, setMultiplier] = useState(String(settings.overtimeMultiplier));
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.settings.update({
        overtimeThresholdHours: Number(thresholdHours) || 0,
        overtimeThresholdPeriod: period,
        overtimeMultiplier: Number(multiplier) || 1,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["personnel-costs"] });
      toast({ title: "Overtime rule updated" });
      setEditing(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Overtime: hours beyond {settings.overtimeThresholdHours}/{settings.overtimeThresholdPeriod === "daily" ? "day" : "week"} at {settings.overtimeMultiplier}x
        </p>
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0">
          <Pencil className="w-3 h-3" /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div>
        <Label className="text-xs">Threshold Hours</Label>
        <Input className="h-8 w-24 text-xs" type="number" min={0} value={thresholdHours} onChange={(e) => setThresholdHours(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Period</Label>
        <Select value={period} onValueChange={(v) => setPeriod(v as "daily" | "weekly")}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Multiplier</Label>
        <Input className="h-8 w-20 text-xs" type="number" min={1} step="0.1" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
      </div>
      <Button size="sm" className="h-8 text-xs" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save</Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
    </div>
  );
}

// The quotation-building engine itself - a manual, freeform list of
// line items (description + amount) a Manager builds up to work out
// the total, per direct product direction: "let's do it manually, we
// will automate it later, now I just need the engine build first" (no
// CPO-rate/vehicle/armed-premium lookups yet). Saving writes the line
// items and syncs estimatedCost to their sum, so the summary Amount
// field on the row above always reflects the built-up total. The two
// PDF links render the exact same saved line items as a client-facing
// quotation document (see lib/quotation-pdf.ts).
function QuoteBuilder({ task }: { task: Task }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState<{ description: string; amount: string }[]>(
    task.quotationLineItems.length > 0
      ? task.quotationLineItems.map((i) => ({ description: i.description, amount: String(i.amount) }))
      : [{ description: "", amount: "" }],
  );

  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  const saveMutation = useMutation({
    mutationFn: () => {
      const cleaned = items
        .filter((i) => i.description.trim() !== "" || i.amount.trim() !== "")
        .map((i) => ({ description: i.description.trim(), amount: Number(i.amount) || 0 }));
      return api.tasks.update(task.id, {
        quotationLineItems: cleaned,
        estimatedCost: cleaned.reduce((sum, i) => sum + i.amount, 0),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Quote saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateItem = (idx: number, field: "description" | "amount", value: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { description: "", amount: "" }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="mt-3 pl-3 border-l-2 border-slate-100 space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            placeholder="Line item description"
            className="h-8 text-xs flex-1"
            value={item.description}
            onChange={(e) => updateItem(idx, "description", e.target.value)}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Amount"
            className="h-8 w-28 text-xs font-mono tabular-nums"
            value={item.amount}
            onChange={(e) => updateItem(idx, "amount", e.target.value)}
          />
          <button
            type="button"
            onClick={() => removeItem(idx)}
            className="text-slate-400 hover:text-red-600 shrink-0"
            aria-label="Remove line item"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={addItem} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add Line Item
        </button>
        <span className="text-xs text-slate-500">
          Total: <span className="font-mono tabular-nums font-semibold text-slate-900">{formatMoney(total, task.estimatedCostCurrency)}</span>
        </span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button size="sm" className="h-8 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          Save Quote
        </Button>
        <a href={`/api/tasks/${task.id}/quotation-pdf?preview=1`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
          Preview PDF
        </a>
        <a href={`/api/tasks/${task.id}/quotation-pdf`} download className="text-xs text-blue-600 hover:underline">
          Download PDF
        </a>
      </div>
    </div>
  );
}

// One task's row in the Quotation Workspace - the request details
// (operators/armed/vehicles/requirements) came straight off that
// task's intake form, shown here so working out a number and setting
// the quotation status both happen with that context in view rather
// than requiring a manager to cross-reference the Tasks list.
function QuoteRow({ task }: { task: Task }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [amount, setAmount] = useState(task.estimatedCost != null ? String(task.estimatedCost) : "");
  const [currency, setCurrency] = useState(task.estimatedCostCurrency);
  const [showBuilder, setShowBuilder] = useState(task.quotationLineItems.length > 0);

  // The Quote Builder below can change estimatedCost out from under
  // this row (it syncs the total on save) - re-sync the summary
  // fields whenever the task's saved values change, since this
  // component doesn't remount between saves.
  useEffect(() => {
    setAmount(task.estimatedCost != null ? String(task.estimatedCost) : "");
    setCurrency(task.estimatedCostCurrency);
  }, [task.estimatedCost, task.estimatedCostCurrency]);

  const quotationMutation = useMutation({
    mutationFn: (quotationStatus: QuotationStatus) => api.tasks.update(task.id, { quotationStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Quotation status updated" });
    },
  });

  const amountMutation = useMutation({
    mutationFn: () =>
      api.tasks.update(task.id, {
        estimatedCost: amount.trim() === "" ? null : Number(amount),
        estimatedCostCurrency: currency.trim() || "ZAR",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Quote amount saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Saves on blur, but only if the amount or currency actually changed -
  // avoids re-saving (and re-toasting) every time a field is merely
  // tabbed through.
  const saveIfChanged = () => {
    const nextAmount = amount.trim() === "" ? null : Number(amount);
    const nextCurrency = currency.trim() || "ZAR";
    if (nextAmount !== task.estimatedCost || nextCurrency !== task.estimatedCostCurrency) {
      amountMutation.mutate();
    }
  };

  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">{task.taskNumber}</span>
            <span className="font-semibold text-slate-900 text-sm">{task.title || "Untitled task"}</span>
          </div>
          <p className="text-xs text-slate-500">
            {task.venueName ?? "No venue"} · {task.clientName || "No client"}
            {task.dueDate && ` · Due ${formatDate(task.dueDate)}`}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <UsersIcon className="w-3 h-3 text-slate-400" />
              {task.operatorsRequired} operator{task.operatorsRequired !== 1 ? "s" : ""}
              {task.armedRequired ? " (Armed)" : ""}
            </span>
            {task.vehiclesRequired > 0 && (
              <span className="flex items-center gap-1">
                <Car className="w-3 h-3 text-slate-400" /> {task.vehiclesRequired} vehicle{task.vehiclesRequired !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {task.clientRequirements && (
            <p className="text-xs text-slate-400 mt-1 max-w-md truncate" title={task.clientRequirements}>
              {task.clientRequirements}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Amount"
            className="h-8 w-28 text-xs font-mono tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={saveIfChanged}
          />
          <Input
            type="text"
            maxLength={10}
            className="h-8 w-16 text-xs uppercase"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            onBlur={saveIfChanged}
          />
        </div>
      </div>

      <div className="mt-2 max-w-sm">
        <QuotationStatusPicker value={task.quotationStatus} onChange={(v) => quotationMutation.mutate(v)} />
      </div>

      <button
        type="button"
        onClick={() => setShowBuilder((s) => !s)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
      >
        {showBuilder ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showBuilder ? "Hide Quote Builder" : "Build Quote"}
      </button>
      {showBuilder && <QuoteBuilder task={task} />}
    </div>
  );
}

function QuotationWorkspace({ tasks, isLoading }: { tasks: Task[]; isLoading: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-slate-400" /> Quotation Workspace
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Work out and record the quoted amount for every task, right alongside what the client actually requested.
        </p>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-400">No tasks yet.</p>
        ) : (
          <div>
            {tasks.map((t) => <QuoteRow key={t.id} task={t} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Add/edit an expense straight from the Quotations page, instead of
// only ever being able to view the rollups - per direct product
// direction ("add and remove" expense entries here). Creating reuses
// the existing "blank row via POST, then fill in via PATCH" flow
// (routes/expenses.ts) - only tasks with a CPO already assigned can
// take an expense, same rule the backend already enforces.
function ExpenseDialog({ expense, tasks, onClose }: { expense: GlobalExpense | null; tasks: Task[]; onClose: () => void }) {
  const assignableTasks = tasks.filter((t) => t.assignedToIds.length > 0 && !t.archived);
  const [taskId, setTaskId] = useState(expense ? String(expense.taskId) : "");
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "other");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [currency, setCurrency] = useState(expense?.currency ?? "ZAR");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [incurredOn, setIncurredOn] = useState(expense?.incurredOn ?? new Date().toISOString().slice(0, 10));
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const patch = {
        category,
        amount: Number(amount) || 0,
        currency: currency.trim() || "ZAR",
        description,
        incurredOn,
      };
      if (expense) return api.expenses.update(expense.id, patch);
      const created = await api.expenses.create(Number(taskId));
      return api.expenses.update(created.id, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses-all"] });
      toast({ title: expense ? "Expense updated" : "Expense added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit = (expense != null || taskId !== "") && amount.trim() !== "";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">{expense ? "Edit Expense" : "Add Expense"}</h2>

        {!expense && (
          <div>
            <Label>Task *</Label>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger><SelectValue placeholder="Select a task" /></SelectTrigger>
              <SelectContent>
                {assignableTasks.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-400">No tasks with a CPO assigned yet</div>
                ) : (
                  assignableTasks.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.taskNumber} · {t.title || "Untitled task"}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Amount</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input maxLength={10} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <Label>Date</Label>
          <Input type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Saving..." : expense ? "Save Changes" : "Add Expense"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Costs - Task Costs / Budget Overview from Expenses, and Personnel
// Costs (rate x hours, including overtime) from Timesheet + CPO pay
// rates - both real. The overtime rule is a Manager-editable setting
// rather than a hardcoded number since it's company-specific.
//
// Laid out like an accounting statement - a top summary of quoted/
// approved/pending/denied totals, then data-dense tables (not cards)
// for every breakdown below - per direct product direction ("user
// friendly but also like an accounting page").
export default function CostsPage() {
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<GlobalExpense | null>(null);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [quotingTask, setQuotingTask] = useState<Task | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });
  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });
  const { data: allQuotes = [], isLoading: quotesLoading } = useQuery<Quote[]>({ queryKey: ["quotes"], queryFn: api.quotes.list });
  const [selectedOfficeId] = useSelectedOfficeId();
  const tasks = filterByOffice(allTasks, selectedOfficeId);
  const quotes = filterByOffice(allQuotes, selectedOfficeId);
  const { data: expenses = [], isLoading: expensesLoading } = useQuery<GlobalExpense[]>({
    queryKey: ["expenses-all"],
    queryFn: api.expenses.listAll,
  });
  const { data: personnelLines = [], isLoading: personnelLoading } = useQuery<PersonnelCostLine[]>({
    queryKey: ["personnel-costs"],
    queryFn: api.personnelCosts.list,
  });
  const { data: settings } = useQuery<CompanySettings>({ queryKey: ["settings"], queryFn: api.settings.get });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => api.expenses.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses-all"] });
      toast({ title: "Expense removed" });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: (id: number) => api.quotes.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "Quote removed" });
    },
  });

  // Tasks with no formal Quote linked to them yet (see taskId on
  // schema/quotes.ts) - these drop off the list the moment a Quote is
  // saved against them, whether that quote is still a draft or not.
  const quotedTaskIds = new Set(quotes.map((q) => q.taskId).filter((id): id is number => id != null));
  const tasksPendingQuotation = tasks.filter((t) => !t.archived && !quotedTaskIds.has(t.id));

  // Quoted/Approved/Pending/Denied - rolled up from every non-archived
  // task's estimatedCost, bucketed by quotationStatus then currency.
  const quoteTotals: Record<QuotationStatus, Record<string, number>> = { approved: {}, awaiting_approval: {}, denied: {} };
  const allQuoted: Record<string, number> = {};
  for (const t of tasks) {
    if (t.archived || t.estimatedCost == null) continue;
    quoteTotals[t.quotationStatus][t.estimatedCostCurrency] = (quoteTotals[t.quotationStatus][t.estimatedCostCurrency] ?? 0) + t.estimatedCost;
    allQuoted[t.estimatedCostCurrency] = (allQuoted[t.estimatedCostCurrency] ?? 0) + t.estimatedCost;
  }

  const totalsByCurrency = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.currency] = (acc[e.currency] ?? 0) + e.amount;
    return acc;
  }, {});

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTotalsByCurrency = expenses
    .filter((e) => e.incurredOn.startsWith(thisMonth))
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.currency] = (acc[e.currency] ?? 0) + e.amount;
      return acc;
    }, {});

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  const byTask = Object.entries(
    expenses.reduce<Record<string, { taskTitle: string; total: number; currency: string }>>((acc, e) => {
      const key = `${e.taskId}-${e.currency}`;
      const entry = (acc[key] ??= { taskTitle: e.taskTitle ?? `Task #${e.taskId}`, total: 0, currency: e.currency });
      entry.total += e.amount;
      return acc;
    }, {}),
  )
    .map(([, v]) => v)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const totalPersonnelCost = personnelLines.reduce((sum, l) => sum + l.cost, 0);
  const personnelByCpo = Object.entries(
    personnelLines.reduce<Record<string, { name: string; cost: number; hours: number }>>((acc, l) => {
      const key = String(l.userId);
      const entry = (acc[key] ??= { name: l.userName ?? `User #${l.userId}`, cost: 0, hours: 0 });
      entry.cost += l.cost;
      entry.hours += l.hours;
      return acc;
    }, {}),
  )
    .map(([, v]) => v)
    .sort((a, b) => b.cost - a.cost);

  const personnelByTask = Object.entries(
    personnelLines.reduce<Record<string, { title: string; cost: number }>>((acc, l) => {
      const key = String(l.taskId ?? "none");
      const entry = (acc[key] ??= { title: l.taskTitle ?? "Unattributed", cost: 0 });
      entry.cost += l.cost;
      return acc;
    }, {}),
  )
    .map(([, v]) => v)
    .sort((a, b) => b.cost - a.cost);

  // Total task cost = personnel (rate x hours, on top of) + expenses -
  // per direct product direction ("expenses... added on top of" the
  // operator rate). Currency-naive: expenses can be logged in any
  // currency per entry, so this only combines cleanly when everything
  // for a task is in one currency.
  const totalCostByTask = Object.entries(
    [
      ...personnelLines.map((l) => ({ taskId: l.taskId, title: l.taskTitle ?? "Unattributed", personnel: l.cost, expense: 0 })),
      ...expenses.map((e) => ({ taskId: e.taskId, title: e.taskTitle ?? `Task #${e.taskId}`, personnel: 0, expense: e.amount })),
    ].reduce<Record<string, { title: string; personnel: number; expense: number }>>((acc, l) => {
      const key = String(l.taskId ?? "none");
      const entry = (acc[key] ??= { title: l.title, personnel: 0, expense: 0 });
      entry.personnel += l.personnel;
      entry.expense += l.expense;
      return acc;
    }, {}),
  )
    .map(([, v]) => ({ ...v, total: v.personnel + v.expense }))
    .filter((v) => v.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return (
    <div className="space-y-5">
      {showQuoteDialog && <QuoteDialog quote={null} venues={venues} users={users} clients={clients} onClose={() => setShowQuoteDialog(false)} />}
      {editingQuote && <QuoteDialog quote={editingQuote} venues={venues} users={users} clients={clients} onClose={() => setEditingQuote(null)} />}
      {quotingTask && (
        <QuoteDialog
          quote={null}
          initialTask={quotingTask}
          venues={venues}
          users={users}
          clients={clients}
          onClose={() => setQuotingTask(null)}
        />
      )}
      {showExpenseDialog && <ExpenseDialog expense={null} tasks={tasks} onClose={() => setShowExpenseDialog(false)} />}
      {editingExpense && <ExpenseDialog expense={editingExpense} tasks={tasks} onClose={() => setEditingExpense(null)} />}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Work out quoted amounts per task below. Expenses and personnel costs across the platform follow -
            see <Link href="/admin/documents" className="text-blue-600 hover:underline">Documents</Link> for receipts.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => setShowExpenseDialog(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Expense
          </Button>
          <Button onClick={() => setShowQuoteDialog(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Create Quote
          </Button>
        </div>
      </div>

      {tasksLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile icon={DollarSign} label="Total Quoted" byCurrency={allQuoted} />
          <StatTile icon={CheckCircle2} label="Approved" byCurrency={quoteTotals.approved} tone="positive" />
          <StatTile icon={Clock} label="Pending" byCurrency={quoteTotals.awaiting_approval} tone="warning" />
          <StatTile icon={XCircle} label="Denied" byCurrency={quoteTotals.denied} tone="negative" />
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" /> Quotes
            </h2>
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowQuoteDialog(true)}>
              <Plus className="w-3 h-3 mr-1" /> Create Quote
            </Button>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Formal sales quotes - number, client, cost build-up, markup and VAT - separate from the per-task Quotation Workspace below.
          </p>
          {quotesLoading ? (
            <Skeleton className="h-32" />
          ) : quotes.length === 0 ? (
            <p className="text-sm text-slate-400">No quotes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left py-1.5">Quote</th>
                  <th className="text-left py-1.5">Client</th>
                  <th className="text-left py-1.5">Status</th>
                  <th className="text-right py-1.5">Total</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((q) => (
                  <tr key={q.id} className="group">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">{q.quoteNumber}</span>
                        <span className="font-medium text-slate-900">{q.title || "Untitled quote"}</span>
                      </div>
                    </td>
                    <td className="py-2 text-slate-500">{q.clientName || "—"}</td>
                    <td className="py-2">
                      <span className={cn("text-xs font-medium border rounded-full px-2 py-0.5", QUOTE_STATUS_CONFIG[q.status].color)}>
                        {QUOTE_STATUS_CONFIG[q.status].label}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-900">{formatMoney(q.totalQuoteValue, q.currency)}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                        <button type="button" onClick={() => setEditingQuote(q)} className="text-slate-400 hover:text-blue-600 p-1" aria-label="Edit quote">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => deleteQuoteMutation.mutate(q.id)} className="text-slate-400 hover:text-red-600 p-1" aria-label="Delete quote">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-slate-400" /> Task Pending Quotation
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Task requests with no formal Quote created yet. Create one straight from the request details below.
          </p>
          {tasksLoading ? (
            <Skeleton className="h-32" />
          ) : tasksPendingQuotation.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing pending - every task has a quote.</p>
          ) : (
            <div>
              {tasksPendingQuotation.map((t) => (
                <div key={t.id} className="py-3 border-b border-slate-100 last:border-0 flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">{t.taskNumber}</span>
                      <span className="font-semibold text-slate-900 text-sm">{t.title || "Untitled task"}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {t.venueName ?? "No venue"} · {t.clientName || "No client"}
                      {t.dueDate && ` · Due ${formatDate(t.dueDate)}`}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <UsersIcon className="w-3 h-3 text-slate-400" />
                        {t.operatorsRequired} operator{t.operatorsRequired !== 1 ? "s" : ""}
                        {t.armedRequired ? " (Armed)" : ""}
                      </span>
                      {t.vehiclesRequired > 0 && (
                        <span className="flex items-center gap-1">
                          <Car className="w-3 h-3 text-slate-400" /> {t.vehiclesRequired} vehicle{t.vehiclesRequired !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => setQuotingTask(t)}>
                    <Plus className="w-3 h-3 mr-1" /> Create Quote
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <QuotationWorkspace tasks={tasks} isLoading={tasksLoading} />

      {expensesLoading ? (
        <div className="grid grid-cols-2 gap-4">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Total Expenses (All Time)
              </div>
              {Object.keys(totalsByCurrency).length === 0 ? (
                <p className="text-sm text-slate-400">No expenses logged yet.</p>
              ) : (
                <CurrencyStack byCurrency={totalsByCurrency} className="text-lg font-semibold text-slate-900" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                <Wallet className="w-3.5 h-3.5" /> This Month (Expenses)
              </div>
              {Object.keys(monthTotalsByCurrency).length === 0 ? (
                <p className="text-sm text-slate-400">Nothing logged this month.</p>
              ) : (
                <CurrencyStack byCurrency={monthTotalsByCurrency} className="text-lg font-semibold text-slate-900" />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Expenses by Task</h2>
            {expensesLoading ? (
              <Skeleton className="h-32" />
            ) : byTask.length === 0 ? (
              <p className="text-sm text-slate-400">No expenses yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="text-left py-1.5">Task</th>
                    <th className="text-right py-1.5">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byTask.map((t, i) => (
                    <tr key={i}>
                      <td className="py-2 text-slate-700 truncate max-w-0">{t.taskTitle}</td>
                      <td className="py-2 text-right font-mono tabular-nums text-slate-900">{formatMoney(t.total, t.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Expenses by Category</h2>
            {expensesLoading ? (
              <Skeleton className="h-32" />
            ) : Object.keys(byCategory).length === 0 ? (
              <p className="text-sm text-slate-400">No expenses yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="text-left py-1.5">Category</th>
                    <th className="text-right py-1.5">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, total]) => (
                      <tr key={cat}>
                        <td className="py-2 text-slate-700">{CATEGORY_LABELS[cat] ?? cat}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-900">{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <UsersIcon className="w-4 h-4 text-slate-400" /> Personnel Costs
            </h2>
            <span className="text-lg font-mono tabular-nums font-semibold text-slate-900">{totalPersonnelCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <p className="text-xs text-slate-400 mb-4">Rate x hours logged in Timesheet, including overtime. Set a CPO's rate from Users.</p>

          {settings && (
            <div className="mb-4 pb-4 border-b border-slate-100 flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="flex-1"><OvertimeSettingsPanel settings={settings} /></div>
            </div>
          )}

          {personnelLoading ? (
            <Skeleton className="h-32" />
          ) : personnelLines.length === 0 ? (
            <p className="text-sm text-slate-400">No hours logged yet, or no CPO rates have been set.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">By CPO</p>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {personnelByCpo.map((p, i) => (
                      <tr key={i}>
                        <td className="py-2 text-slate-700">{p.name} <span className="text-slate-400 text-xs">({p.hours.toFixed(1)}h)</span></td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-900">{p.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">By Task</p>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {personnelByTask.slice(0, 8).map((t, i) => (
                      <tr key={i}>
                        <td className="py-2 text-slate-700 truncate max-w-0">{t.title}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-900">{t.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totalCostByTask.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Total Cost by Task</h2>
            <p className="text-xs text-slate-400 mb-3">Personnel cost plus expenses, combined per task.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left py-1.5">Task</th>
                  <th className="text-right py-1.5">Personnel</th>
                  <th className="text-right py-1.5">Expenses</th>
                  <th className="text-right py-1.5">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {totalCostByTask.map((t, i) => (
                  <tr key={i}>
                    <td className="py-2 text-slate-700 truncate max-w-0">{t.title}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-500">{t.personnel.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-500">{t.expense.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-2 text-right font-mono tabular-nums font-semibold text-slate-900">{t.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {!expensesLoading && expenses.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900">Recent Expenses</h2>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowExpenseDialog(true)}>
                <Plus className="w-3 h-3 mr-1" /> Add Expense
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left py-1.5">Description</th>
                  <th className="text-left py-1.5">Task</th>
                  <th className="text-left py-1.5">Date</th>
                  <th className="text-right py-1.5">Amount</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.slice(0, 10).map((e) => (
                  <tr key={e.id} className="group">
                    <td className="py-2 font-medium text-slate-900">{e.description || CATEGORY_LABELS[e.category] || e.category}</td>
                    <td className="py-2 text-slate-500 truncate max-w-0">{e.taskTitle ?? "Unknown task"}</td>
                    <td className="py-2 text-slate-500 whitespace-nowrap">{formatDate(e.incurredOn)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-900">{formatMoney(e.amount, e.currency)}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setEditingExpense(e)}
                          className="text-slate-400 hover:text-blue-600 p-1"
                          aria-label="Edit expense"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteExpenseMutation.mutate(e.id)}
                          className="text-slate-400 hover:text-red-600 p-1"
                          aria-label="Delete expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
