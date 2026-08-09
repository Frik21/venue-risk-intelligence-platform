import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type GlobalExpense } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Wallet, Users as UsersIcon } from "lucide-react";
import { formatDate } from "@/lib/display-utils";

const CATEGORY_LABELS: Record<string, string> = {
  fuel: "Fuel", accommodation: "Accommodation", food: "Food", parking: "Parking",
  tolls: "Tolls", equipment: "Equipment", other: "Other",
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// Costs - Task Costs / Budget Overview is built for real from the
// existing Expenses feature (there was nowhere to see spend across
// every task before this page - only per-task). Personnel Costs needs
// CPO pay rates (day/night/overtime), which don't exist anywhere in
// the schema yet, so it's a Coming Soon section rather than guessed data.
export default function CostsPage() {
  const { data: expenses = [], isLoading } = useQuery<GlobalExpense[]>({
    queryKey: ["expenses-all"],
    queryFn: api.expenses.listAll,
  });

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Costs</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Task expenses logged across the platform. See <Link href="/admin/documents" className="text-blue-600 hover:underline">Documents</Link> for receipts.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <DollarSign className="w-5 h-5 text-blue-600 mb-2" />
              <p className="text-xs text-slate-500 mb-1">Total Spend (All Time)</p>
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
              <p className="text-xs text-slate-500 mb-1">This Month</p>
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
            <h2 className="font-semibold text-slate-900 mb-4">Spend by Task</h2>
            {isLoading ? (
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
            <h2 className="font-semibold text-slate-900 mb-4">Spend by Category</h2>
            {isLoading ? (
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
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <UsersIcon className="w-4 h-4 text-slate-400" /> Personnel Costs
          </h2>
          <div className="flex flex-col items-center justify-center text-center py-8 px-4 border border-dashed border-slate-200 rounded-lg">
            <p className="text-sm text-slate-500 max-w-sm">Coming soon - CPO pay rates (day rate, night rate, overtime) aren't tracked yet, so personnel cost per task can't be calculated for real.</p>
            <Badge variant="secondary" className="mt-3 text-[10px] uppercase">Coming Soon</Badge>
          </div>
        </CardContent>
      </Card>

      {!isLoading && expenses.length > 0 && (
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
