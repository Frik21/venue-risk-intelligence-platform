import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Quote, type Invoice, type PendingPayroll, type PayRun } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Receipt, Wallet, type LucideIcon } from "lucide-react";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { cn } from "@/lib/utils";

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-400" />
            {title}
          </h2>
          <Link href={action.href} className="text-xs text-blue-600 hover:underline shrink-0">
            {action.label}
          </Link>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "negative" }) {
  return (
    <div className={cn("border rounded-lg p-3", tone === "negative" ? "border-red-200 bg-red-50/50" : "border-slate-100")}>
      <div className={cn("text-lg font-mono tabular-nums font-bold", tone === "negative" ? "text-red-700" : "text-slate-900")}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

// Finance's own scoped view - Quotations, Invoices, and Payroll rolled
// into one dashboard, per direct product direction ("we are gonna
// build the finance page now" - confirmed via AskUserQuestion this
// means exactly these three modules, already flagged as the likely
// shape in CLAUDE.md's own "revisit if role-scoped dashboards are
// wanted" note). Each section is a quick-glance summary with stat
// tiles plus a "View all" link into the real, full page for that
// module (/admin/costs, /admin/invoices, /admin/payroll) - this page
// doesn't duplicate their actual workflows, just surfaces the numbers
// a Finance user cares about first. role: "finance" now lands here
// after login instead of the general Management Dashboard (see
// lib/auth.tsx) - a genuine role-scoped destination, not just an Owner
// Quick Access preview.
export default function FinanceDashboard() {
  const [selectedOfficeId] = useSelectedOfficeId();
  const { data: quotes = [], isLoading: quotesLoading } = useQuery<Quote[]>({ queryKey: ["quotes"], queryFn: api.quotes.list });
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({ queryKey: ["invoices"], queryFn: api.invoices.list });
  const { data: pendingPayroll = [], isLoading: pendingLoading } = useQuery<PendingPayroll[]>({
    queryKey: ["payroll-pending"],
    queryFn: api.payroll.pending,
  });
  const { data: payRuns = [], isLoading: runsLoading } = useQuery<PayRun[]>({ queryKey: ["payroll-runs"], queryFn: api.payroll.listRuns });

  const scopedQuotes = filterByOffice(quotes, selectedOfficeId);
  const scopedInvoices = filterByOffice(invoices, selectedOfficeId);

  const pendingQuotes = scopedQuotes.filter((q) => q.status === "sent").length;
  const approvedQuotesValue = scopedQuotes.filter((q) => q.status === "approved").reduce((sum, q) => sum + q.totalQuoteValue, 0);
  const draftQuotes = scopedQuotes.filter((q) => q.status === "draft").length;

  const draftInvoices = scopedInvoices.filter((i) => i.status === "draft").length;
  const outstandingInvoices = scopedInvoices.filter((i) => i.status === "sent");
  const outstandingValue = outstandingInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const paidValue = scopedInvoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.totalAmount, 0);
  // Aging receivables (Following Roadmap Tier 1, item 3) - sent but
  // unpaid, past its own due date. Flagged here so it's visible without
  // navigating into /admin/invoices - the whole point is catching a
  // late payment before it becomes a payroll problem, not after.
  const overdueInvoices = outstandingInvoices.filter((i) => i.dueDate != null && new Date(i.dueDate).getTime() < Date.now());
  const overdueValue = overdueInvoices.reduce((sum, i) => sum + i.totalAmount, 0);

  const pendingPayrollTotal = pendingPayroll.reduce((sum, p) => sum + p.totalAmount, 0);
  const recentRuns = [...payRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  const loading = quotesLoading || invoicesLoading || pendingLoading || runsLoading;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Finance</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quotations, Invoices, and Payroll at a glance</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SectionCard title="Quotations" icon={DollarSign} action={{ href: "/admin/costs", label: "View all →" }}>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Awaiting decision" value={String(pendingQuotes)} />
              <StatTile label="Draft" value={String(draftQuotes)} />
              <StatTile label="Approved value" value={`$${approvedQuotesValue.toLocaleString()}`} />
              <StatTile label="Total quotes" value={String(scopedQuotes.length)} />
            </div>
          </SectionCard>

          <SectionCard title="Invoices" icon={Receipt} action={{ href: "/admin/invoices", label: "View all →" }}>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Draft" value={String(draftInvoices)} />
              <StatTile label="Outstanding" value={String(outstandingInvoices.length)} />
              <StatTile label="Outstanding value" value={`$${outstandingValue.toLocaleString()}`} />
              <StatTile label="Paid to date" value={`$${paidValue.toLocaleString()}`} />
              <StatTile label="Overdue" value={String(overdueInvoices.length)} tone={overdueInvoices.length > 0 ? "negative" : undefined} />
              <StatTile label="Overdue value" value={`$${overdueValue.toLocaleString()}`} tone={overdueInvoices.length > 0 ? "negative" : undefined} />
            </div>
          </SectionCard>

          <SectionCard title="Payroll" icon={Wallet} action={{ href: "/admin/payroll", label: "View all →" }}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatTile label="Pending payroll" value={`$${pendingPayrollTotal.toLocaleString()}`} />
              <StatTile label="Operators owed" value={String(pendingPayroll.length)} />
            </div>
            {recentRuns.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Recent pay runs</div>
                {recentRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-700 truncate">{run.userName ?? "Unknown"}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-slate-500">${run.totalAmount.toLocaleString()}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          run.status === "paid" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200",
                        )}
                      >
                        {run.status === "paid" ? "Paid" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
