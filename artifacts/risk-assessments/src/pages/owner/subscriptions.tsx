import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { api, type PricingConfig, type PricingField, type PricingHistoryEntry, type CompanySummary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<PricingField, string> = {
  baseMonthlyPrice: "Team - Base price/month",
  pricePerManagerSeat: "Team - Price per additional Manager seat",
  pricePerOperationsSeat: "Team - Price per additional Operations seat",
  pricePerFinanceSeat: "Team - Price per additional Finance seat",
  pricePerHumanResourcesSeat: "Team - Price per additional Human Resources seat",
  pricePerCpoSeat: "Team - Price per additional CPO seat (Operators note)",
  soloOperatorMonthlyPrice: "Solo Operator - Price/month",
};

// One price field, with two independent ways to change it - per direct
// product direction, both a direct "set the current price" control and
// a percentage-based "increase by X%" control, since every price is
// set individually (no shared/bulk pricing control). Either path calls
// the same POST /companies/pricing/change and lands one row in
// pricing_history either way (see routes/companies.ts's own comment on
// that endpoint for why percentageChange is never re-derived client-side).
function PriceFieldRow({ label, field, value, onChanged }: { label: string; field: PricingField; value: number; onChanged: () => void }) {
  const [newValue, setNewValue] = useState(String(value));
  const [percentage, setPercentage] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    setNewValue(String(value));
  }, [value]);

  const setMutation = useMutation({
    mutationFn: () => api.companies.changePricing({ field, newValue: Math.max(0, Number(newValue) || 0) }),
    onSuccess: () => {
      toast({ title: `${label} updated` });
      onChanged();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const increaseMutation = useMutation({
    mutationFn: () => api.companies.changePricing({ field, percentageChange: Number(percentage) }),
    onSuccess: () => {
      toast({ title: `${label} changed` });
      setPercentage("");
      onChanged();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pct = Number(percentage);
  const previewValue = percentage.trim() !== "" && !isNaN(pct) ? Math.max(0, Math.round(value * (1 + pct / 100))) : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{label}</div>
          <div className="text-lg font-mono tabular-nums font-bold text-slate-900">${value.toLocaleString()}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-slate-500">Set current price</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setMutation.mutate()}
                disabled={setMutation.isPending || Number(newValue) === value}
              >
                {setMutation.isPending ? "Setting..." : "Set"}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Increase by %</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                placeholder="e.g. 5"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => increaseMutation.mutate()}
                disabled={increaseMutation.isPending || percentage.trim() === "" || isNaN(pct)}
              >
                {increaseMutation.isPending ? "Applying..." : "Apply"}
              </Button>
            </div>
            {previewValue != null && <p className="text-xs text-slate-400 mt-1">= ${previewValue.toLocaleString()}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Full page (not the old modal dialog) - per direct product direction,
// "this will affect every user, so we need to be very detailed." Two
// mechanisms per price (set directly, or increase by a percentage),
// each logged to pricing_history below regardless of which was used.
export default function SubscriptionsPage() {
  const qc = useQueryClient();
  const { data: pricing, isLoading: pricingLoading } = useQuery<PricingConfig>({ queryKey: ["pricing-config"], queryFn: api.companies.pricing });
  const { data: history = [], isLoading: historyLoading } = useQuery<PricingHistoryEntry[]>({
    queryKey: ["pricing-history"],
    queryFn: api.companies.pricingHistory,
  });
  const { data: summary } = useQuery<CompanySummary>({ queryKey: ["companies-summary"], queryFn: api.companies.summary });

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["pricing-config"] });
    qc.invalidateQueries({ queryKey: ["pricing-history"] });
    qc.invalidateQueries({ queryKey: ["companies"] });
    qc.invalidateQueries({ queryKey: ["companies-summary"] });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="h-14 flex items-center px-6 bg-slate-950 text-white gap-2.5">
        <ShieldAlert className="w-5 h-5 text-blue-400" />
        <div>
          <div className="text-sm font-bold tracking-wide">VENUEGUARD</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest -mt-0.5">Owner Console</div>
        </div>
        <div className="flex-1" />
        <Link href="/owner" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Owner Console
        </Link>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscriptions</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Directional pricing only - no payment processor is connected yet, this controls the estimates shown across the Owner Console.
          </p>
          {summary && (
            <p className="text-slate-400 text-xs mt-1">
              Est. Monthly Revenue (active companies, current prices):{" "}
              <span className="font-mono tabular-nums font-semibold text-slate-700">{summary.estimatedMonthlyRevenue.toLocaleString()}</span>
            </p>
          )}
        </div>

        {pricingLoading || !pricing ? (
          <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Team - Base</h2>
              <PriceFieldRow label="Base price/month" field="baseMonthlyPrice" value={pricing.baseMonthlyPrice} onChanged={refetchAll} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Team - Price per additional seat, by role
              </h2>
              <div className="space-y-3">
                <PriceFieldRow label="Manager seat" field="pricePerManagerSeat" value={pricing.pricePerManagerSeat} onChanged={refetchAll} />
                <PriceFieldRow
                  label="Operations seat"
                  field="pricePerOperationsSeat"
                  value={pricing.pricePerOperationsSeat}
                  onChanged={refetchAll}
                />
                <PriceFieldRow label="Finance seat" field="pricePerFinanceSeat" value={pricing.pricePerFinanceSeat} onChanged={refetchAll} />
                <PriceFieldRow
                  label="Human Resources seat"
                  field="pricePerHumanResourcesSeat"
                  value={pricing.pricePerHumanResourcesSeat}
                  onChanged={refetchAll}
                />
                <PriceFieldRow
                  label="CPO seat (Operators note)"
                  field="pricePerCpoSeat"
                  value={pricing.pricePerCpoSeat}
                  onChanged={refetchAll}
                />
              </div>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Solo Operator</h2>
              <PriceFieldRow label="Price/month" field="soloOperatorMonthlyPrice" value={pricing.soloOperatorMonthlyPrice} onChanged={refetchAll} />
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Price Change History</h2>
          {historyLoading ? (
            <Skeleton className="h-32" />
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-400">No price changes yet</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                      <th className="text-left px-4 py-2.5">Field</th>
                      <th className="text-right px-4 py-2.5">Previous</th>
                      <th className="text-right px-4 py-2.5">New</th>
                      <th className="text-right px-4 py-2.5">Change</th>
                      <th className="text-left px-4 py-2.5">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-2.5 text-slate-900">{FIELD_LABELS[h.field]}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500">${h.previousValue.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">${h.newValue.toLocaleString()}</td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-right font-mono tabular-nums",
                            h.percentageChange > 0 ? "text-emerald-600" : h.percentageChange < 0 ? "text-red-600" : "text-slate-400",
                          )}
                        >
                          {h.percentageChange > 0 ? "+" : ""}
                          {h.percentageChange.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{formatDate(h.changedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
