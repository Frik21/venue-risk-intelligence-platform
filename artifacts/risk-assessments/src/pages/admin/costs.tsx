import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type GlobalExpense, type PersonnelCostLine, type CompanySettings, type Task, type QuotationStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Wallet, Users as UsersIcon, Settings, Pencil, Car, FileText, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { QuotationStatusPicker } from "@/components/new-task-dialog";

const CATEGORY_LABELS: Record<string, string> = {
  fuel: "Fuel", accommodation: "Accommodation", food: "Food", parking: "Parking",
  tolls: "Tolls", equipment: "Equipment", other: "Other",
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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
            className="h-8 w-28 text-xs"
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
          Total: <span className="font-semibold text-slate-900">{formatMoney(total, task.estimatedCostCurrency)}</span>
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
            className="h-8 w-28 text-xs"
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

function QuotationWorkspace() {
  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });

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

// Costs - Task Costs / Budget Overview from Expenses, and Personnel
// Costs (rate x hours, including overtime) from Timesheet + CPO pay
// rates - both real. The overtime rule is a Manager-editable setting
// rather than a hardcoded number since it's company-specific.
export default function CostsPage() {
  const { data: expenses = [], isLoading: expensesLoading } = useQuery<GlobalExpense[]>({
    queryKey: ["expenses-all"],
    queryFn: api.expenses.listAll,
  });
  const { data: personnelLines = [], isLoading: personnelLoading } = useQuery<PersonnelCostLine[]>({
    queryKey: ["personnel-costs"],
    queryFn: api.personnelCosts.list,
  });
  const { data: settings } = useQuery<CompanySettings>({ queryKey: ["settings"], queryFn: api.settings.get });

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Work out quoted amounts per task below. Expenses and personnel costs across the platform follow -
          see <Link href="/admin/documents" className="text-blue-600 hover:underline">Documents</Link> for receipts.
        </p>
      </div>

      <QuotationWorkspace />

      {expensesLoading ? (
        <div className="grid grid-cols-2 gap-4">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <DollarSign className="w-5 h-5 text-blue-600 mb-2" />
              <p className="text-xs text-slate-500 mb-1">Total Expenses (All Time)</p>
              {Object.keys(totalsByCurrency).length === 0 ? (
                <p className="text-sm text-slate-400">No expenses logged yet.</p>
              ) : (
                Object.entries(totalsByCurrency).map(([cur, total]) => (
                  <p key={cur} className="text-lg font-bold text-slate-900">{formatMoney(total, cur)}</p>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Wallet className="w-5 h-5 text-blue-600 mb-2" />
              <p className="text-xs text-slate-500 mb-1">This Month (Expenses)</p>
              {Object.keys(monthTotalsByCurrency).length === 0 ? (
                <p className="text-sm text-slate-400">Nothing logged this month.</p>
              ) : (
                Object.entries(monthTotalsByCurrency).map(([cur, total]) => (
                  <p key={cur} className="text-lg font-bold text-slate-900">{formatMoney(total, cur)}</p>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Expenses by Task</h2>
            {expensesLoading ? (
              <Skeleton className="h-32" />
            ) : byTask.length === 0 ? (
              <p className="text-sm text-slate-400">No expenses yet.</p>
            ) : (
              <div className="space-y-2.5">
                {byTask.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate">{t.taskTitle}</span>
                    <Badge variant="secondary">{formatMoney(t.total, t.currency)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Expenses by Category</h2>
            {expensesLoading ? (
              <Skeleton className="h-32" />
            ) : Object.keys(byCategory).length === 0 ? (
              <p className="text-sm text-slate-400">No expenses yet.</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, total]) => (
                    <div key={cat} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{CATEGORY_LABELS[cat] ?? cat}</span>
                      <span className="text-slate-500 font-mono text-xs">{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
              </div>
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
            <span className="text-lg font-bold text-slate-900">{totalPersonnelCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
                <div className="space-y-2">
                  {personnelByCpo.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{p.name} <span className="text-slate-400 text-xs">({p.hours.toFixed(1)}h)</span></span>
                      <Badge variant="secondary">{p.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">By Task</p>
                <div className="space-y-2">
                  {personnelByTask.slice(0, 8).map((t, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 truncate">{t.title}</span>
                      <Badge variant="secondary">{t.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totalCostByTask.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Total Cost by Task</h2>
            <p className="text-xs text-slate-400 mb-4">Personnel cost plus expenses, combined per task.</p>
            <div className="space-y-2.5">
              {totalCostByTask.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 truncate">{t.title}</span>
                  <span className="text-right">
                    <span className="font-semibold text-slate-900">{t.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="text-xs text-slate-400 ml-1.5">({t.personnel.toLocaleString(undefined, { maximumFractionDigits: 0 })} personnel + {t.expense.toLocaleString(undefined, { maximumFractionDigits: 0 })} expenses)</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!expensesLoading && expenses.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Recent Expenses</h2>
            <div className="divide-y divide-slate-100">
              {expenses.slice(0, 10).map((e) => (
                <div key={e.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900">{e.description || CATEGORY_LABELS[e.category] || e.category}</span>
                    <p className="text-xs text-slate-400">{e.taskTitle ?? "Unknown task"} · {formatDate(e.incurredOn)}</p>
                  </div>
                  <span className="font-mono text-xs text-slate-600 shrink-0">{formatMoney(e.amount, e.currency)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
