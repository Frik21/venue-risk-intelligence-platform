import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Invoice, type InvoiceStatus, type Task, type User, type Client, type Quote } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Receipt, Plus, MoreVertical, Pencil, Trash2, FileText } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { InvoiceDialog } from "@/components/invoice-dialog";

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-slate-600 bg-slate-100 border-slate-200" },
  sent: { label: "Sent", color: "text-amber-700 bg-amber-50 border-amber-200" },
  paid: { label: "Paid", color: "text-green-700 bg-green-50 border-green-200" },
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// One currency-bucketed amount per line, stacked when totals span more
// than one currency - same currency-naive convention as Quotations.
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

// Invoices - client-facing billing (money owed TO VenueGuard), per
// direct product direction ("client invoices - money owed to you").
// Own entity/lifecycle (schema/invoices.ts), separate from and
// simpler than Quotes - no cost-category build-up or markup, just
// billing line items and a tax rate, since an invoice bills an
// already-agreed amount. Creating/saving an invoice against a task
// marks that task "invoiced" server-side (see PATCH /invoices/:id),
// which is what moves it from the Completed to Invoiced bucket on the
// Tasks list.
export default function InvoicesPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoicingTask, setInvoicingTask] = useState<Task | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({ queryKey: ["invoices"], queryFn: api.invoices.list });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["quotes"], queryFn: api.quotes.list });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.invoices.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice removed" });
    },
  });

  // Completed tasks with no invoice linked yet (see taskId on
  // schema/invoices.ts) - these drop off the list the moment an
  // invoice is saved against them, same "Task Pending Quotation"
  // pattern used on the Quotations page.
  const invoicedTaskIds = new Set(invoices.map((i) => i.taskId).filter((id): id is number => id != null));
  const tasksPendingInvoice = tasks.filter((t) => !t.archived && t.status === "completed" && !invoicedTaskIds.has(t.id));

  const totalsByStatus: Record<InvoiceStatus, Record<string, number>> = { draft: {}, sent: {}, paid: {} };
  for (const inv of invoices) {
    totalsByStatus[inv.status][inv.currency] = (totalsByStatus[inv.status][inv.currency] ?? 0) + inv.totalAmount;
  }

  function findApprovedQuote(taskId: number): Quote | null {
    return quotes.find((q) => q.taskId === taskId && q.status === "approved") ?? null;
  }

  return (
    <div className="space-y-5">
      {showDialog && (
        <InvoiceDialog invoice={null} users={users} clients={clients} onClose={() => setShowDialog(false)} />
      )}
      {editingInvoice && (
        <InvoiceDialog invoice={editingInvoice} users={users} clients={clients} onClose={() => setEditingInvoice(null)} />
      )}
      {invoicingTask && (
        <InvoiceDialog
          invoice={null}
          initialTask={invoicingTask}
          initialQuote={findApprovedQuote(invoicingTask.id)}
          users={users}
          clients={clients}
          onClose={() => setInvoicingTask(null)}
        />
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 text-sm mt-0.5">Client billing - money owed to you for completed work</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Create Invoice
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(["draft", "sent", "paid"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500 mb-1">{STATUS_CONFIG[s].label}</div>
              <CurrencyStack byCurrency={totalsByStatus[s]} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-slate-400" /> Task Pending Invoice
          </h2>
          {tasksLoading ? (
            <Skeleton className="h-16" />
          ) : tasksPendingInvoice.length === 0 ? (
            <p className="text-sm text-slate-400">No completed tasks waiting to be invoiced.</p>
          ) : (
            <div className="space-y-2">
              {tasksPendingInvoice.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 text-sm border border-slate-100 rounded-md px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded mr-2">{t.taskNumber}</span>
                    <span className="text-slate-900">{t.title || "Untitled task"}</span>
                    {t.clientName && <span className="text-slate-400"> · {t.clientName}</span>}
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => setInvoicingTask(t)}>
                    Create Invoice
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {invoicesLoading ? (
        <Skeleton className="h-64" />
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No invoices yet</h3>
            <p className="text-sm text-slate-400 mb-4">Create your first invoice to start billing clients</p>
            <Button onClick={() => setShowDialog(true)}><Plus className="w-4 h-4 mr-1.5" />Create Invoice</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left px-4 py-2.5">Invoice</th>
                  <th className="text-left px-4 py-2.5">Client</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Due</th>
                  <th className="text-right px-4 py-2.5">Total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => {
                  const sc = STATUS_CONFIG[invoice.status];
                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <button onClick={() => setEditingInvoice(invoice)} className="text-left hover:underline hover:text-blue-600">
                          <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded mr-2">{invoice.invoiceNumber}</span>
                          <span className="font-medium text-slate-900">{invoice.title || "Untitled invoice"}</span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{invoice.clientName || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">{formatMoney(invoice.totalAmount, invoice.currency)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingInvoice(invoice)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(invoice.id)} className="text-red-600">
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
