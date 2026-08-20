import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PendingPayroll, type PayRun, type PayRunStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Wallet, MoreVertical, CheckCircle2, Trash2, Users as UsersIcon } from "lucide-react";
import { formatDateTime } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<PayRunStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-amber-700 bg-amber-50 border-amber-200" },
  paid: { label: "Paid", color: "text-green-700 bg-green-50 border-green-200" },
};

function formatAmount(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Payroll - CPO pay runs built from approved timesheet hours x their
// day/night rate (same cost math as Personnel Costs on the Quotations
// page - see lib/personnel-cost.ts), per direct product direction
// ("CPO pay runs from approved hours"). No currency label, matching
// Personnel Costs' existing convention (CPO rates don't carry a
// currency of their own).
//
// "Pending Payroll" mirrors "Task Pending Quotation"/"Task Pending
// Invoice": operators with approved-but-unpaid hours, one "Create Pay
// Run" action each. Creating a run snapshots the current total and
// stamps every covered timesheet entry with that run's id server-side
// (see POST /payroll/runs) so the same hours can never be paid out
// twice - the operator drops off this list until they log/get more
// approved hours.
export default function PayrollPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: pending = [], isLoading: pendingLoading } = useQuery<PendingPayroll[]>({
    queryKey: ["payroll-pending"],
    queryFn: api.payroll.pending,
  });
  const { data: runs = [], isLoading: runsLoading } = useQuery<PayRun[]>({
    queryKey: ["payroll-runs"],
    queryFn: api.payroll.listRuns,
  });
  const { user: sessionUser } = useAuth();
  const currentUserId = sessionUser?.id;

  const createRunMutation = useMutation({
    mutationFn: (userId: number) => api.payroll.createRun({ userId, createdBy: currentUserId ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-pending"] });
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast({ title: "Pay run created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => api.payroll.updateRun(id, { status: "paid" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast({ title: "Pay run marked paid" });
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: (id: number) => api.payroll.deleteRun(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      qc.invalidateQueries({ queryKey: ["payroll-pending"] });
      toast({ title: "Pay run removed - hours returned to pending" });
    },
  });

  const unprocessedTotal = pending.reduce((sum, p) => sum + p.totalAmount, 0);
  const pendingRunsTotal = runs.filter((r) => r.status === "pending").reduce((sum, r) => sum + r.totalAmount, 0);
  const paidTotal = runs.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.totalAmount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payroll</h1>
        <p className="text-slate-500 text-sm mt-0.5">Operator pay runs, built from approved hours x rate</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 mb-1">Unprocessed</div>
            <div className="text-lg font-mono tabular-nums font-semibold text-slate-900">{formatAmount(unprocessedTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 mb-1">Pending Pay Runs</div>
            <div className="text-lg font-mono tabular-nums font-semibold text-amber-700">{formatAmount(pendingRunsTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 mb-1">Paid</div>
            <div className="text-lg font-mono tabular-nums font-semibold text-green-700">{formatAmount(paidTotal)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <UsersIcon className="w-4 h-4 text-slate-400" /> Pending Payroll
          </h2>
          <p className="text-xs text-slate-400 mb-3">Approved hours not yet included in a pay run. Set a CPO's rate from Operator Database; approve hours from Tasks.</p>
          {pendingLoading ? (
            <Skeleton className="h-16" />
          ) : pending.length === 0 ? (
            <p className="text-sm text-slate-400">No approved hours waiting to be paid out.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((p) => (
                <div key={p.userId} className="flex items-center justify-between gap-3 text-sm border border-slate-100 rounded-md px-3 py-2">
                  <div>
                    <span className="text-slate-900 font-medium">{p.userName ?? "Unknown"}</span>
                    <span className="text-slate-400 text-xs"> · {p.totalHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono tabular-nums text-slate-700">{formatAmount(p.totalAmount)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => createRunMutation.mutate(p.userId)}
                      disabled={createRunMutation.isPending}
                    >
                      Create Pay Run
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {runsLoading ? (
        <Skeleton className="h-64" />
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Wallet className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No pay runs yet</h3>
            <p className="text-sm text-slate-400">Create one from Pending Payroll above once an operator has approved hours.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left px-4 py-2.5">Operator</th>
                  <th className="text-right px-4 py-2.5">Hours</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Created</th>
                  <th className="text-left px-4 py-2.5">Paid</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => {
                  const sc = STATUS_CONFIG[run.status];
                  return (
                    <tr key={run.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{run.userName ?? "Unknown"}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">{run.totalHours.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">{formatAmount(run.totalAmount)}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDateTime(run.createdAt)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{run.paidAt ? formatDateTime(run.paidAt) : "—"}</td>
                      <td className="px-2 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {run.status === "pending" && (
                              <DropdownMenuItem onClick={() => markPaidMutation.mutate(run.id)}>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Mark Paid
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => deleteRunMutation.mutate(run.id)} className="text-red-600">
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
