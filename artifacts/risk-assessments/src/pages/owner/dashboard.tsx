import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Company, type CompanySummary, type CompanyTier, type CompanyStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ShieldAlert, Building2, Users, UserCog, Wallet, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

const TIER_LABELS: Record<CompanyTier, string> = {
  enterprise: "Enterprise",
  micro_enterprise: "Micro Enterprise",
};

const STATUS_CONFIG: Record<CompanyStatus, { label: string; color: string }> = {
  trial: { label: "Trial", color: "text-blue-700 bg-blue-50 border-blue-200" },
  active: { label: "Active", color: "text-green-700 bg-green-50 border-green-200" },
  suspended: { label: "Suspended", color: "text-amber-700 bg-amber-50 border-amber-200" },
  cancelled: { label: "Cancelled", color: "text-red-700 bg-red-50 border-red-200" },
};

const SEAT_LIMITS: Record<CompanyTier, { management: number; cpo: number }> = {
  enterprise: { management: 20, cpo: 20 },
  micro_enterprise: { management: 10, cpo: 10 },
};

function NewCompanyDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [tier, setTier] = useState<CompanyTier>("enterprise");
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.companies.create({ name, tier, status: "trial" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Company onboarded" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">Onboard Company</h2>
        <div>
          <Label>Company Name *</Label>
          <Input placeholder="e.g. Sentinel Protective Services" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Subscription Tier</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as CompanyTier)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="enterprise">Enterprise (20 seats)</SelectItem>
              <SelectItem value="micro_enterprise">Micro Enterprise (10 seats)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-slate-400">New companies start on Trial status - activate once billing is confirmed.</p>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim()}>
            {mutation.isPending ? "Creating..." : "Onboard Company"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
          <Icon className="w-3.5 h-3.5" /> {label}
        </div>
        <div className="text-lg font-mono tabular-nums font-semibold text-slate-900">{value}</div>
      </CardContent>
    </Card>
  );
}

// The platform owner's own view of the VenueGuard business - strictly
// account-level metadata and aggregates about each subscriber (name,
// tier, status, seat usage, activity recency). Never a subscriber's
// actual operational content (task titles, client names, quote
// amounts, etc.) - that's the one hard boundary of this page. The
// backend (routes/companies.ts) enforces this by construction: its
// endpoints only ever return count()/max() aggregates grouped by
// company_id, never a row from a tenant table.
export default function OwnerDashboard() {
  const [showNewCompany, setShowNewCompany] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: companies = [], isLoading } = useQuery<Company[]>({ queryKey: ["companies"], queryFn: api.companies.list });
  const { data: summary } = useQuery<CompanySummary>({ queryKey: ["companies-summary"], queryFn: api.companies.summary });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ tier: CompanyTier; status: CompanyStatus }> }) =>
      api.companies.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies-summary"] });
      toast({ title: "Company updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-slate-100">
      {showNewCompany && <NewCompanyDialog onClose={() => setShowNewCompany(false)} />}

      <header className="h-14 flex items-center px-6 bg-slate-950 text-white gap-2.5">
        <ShieldAlert className="w-5 h-5 text-blue-400" />
        <div>
          <div className="text-sm font-bold tracking-wide">VENUEGUARD</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest -mt-0.5">Owner Console</div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
            <p className="text-slate-500 text-sm mt-0.5">Every subscriber on the platform - account status and usage only</p>
          </div>
          <Button onClick={() => setShowNewCompany(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Onboard Company
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile icon={Building2} label="Total Companies" value={summary.totalCompanies} />
            <StatTile icon={TrendingUp} label="Active" value={summary.byStatus.active} />
            <StatTile icon={Users} label="Trial" value={summary.byStatus.trial} />
            <StatTile icon={Wallet} label="Est. Monthly Revenue" value={summary.estimatedMonthlyRevenue.toLocaleString()} />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : companies.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <h3 className="font-medium text-slate-600 mb-1">No companies yet</h3>
              <p className="text-sm text-slate-400 mb-4">Onboard the first subscriber to get started</p>
              <Button onClick={() => setShowNewCompany(true)}><Plus className="w-4 h-4 mr-1.5" />Onboard Company</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="text-left px-4 py-2.5">Company</th>
                    <th className="text-left px-4 py-2.5">Tier</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Seats</th>
                    <th className="text-left px-4 py-2.5">Last Activity</th>
                    <th className="text-left px-4 py-2.5">Signed Up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((c) => {
                    const sc = STATUS_CONFIG[c.status];
                    const limits = SEAT_LIMITS[c.tier];
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-medium text-slate-900 flex items-center gap-2">
                          <UserCog className="w-3.5 h-3.5 text-slate-400" /> {c.name}
                        </td>
                        <td className="px-4 py-2.5">
                          <Select value={c.tier} onValueChange={(v) => updateMutation.mutate({ id: c.id, data: { tier: v as CompanyTier } })}>
                            <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="enterprise">{TIER_LABELS.enterprise}</SelectItem>
                              <SelectItem value="micro_enterprise">{TIER_LABELS.micro_enterprise}</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2.5">
                          <Select value={c.status} onValueChange={(v) => updateMutation.mutate({ id: c.id, data: { status: v as CompanyStatus } })}>
                            <SelectTrigger className={cn("h-7 w-32 text-xs border", sc.color)}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(STATUS_CONFIG) as CompanyStatus[]).map((s) => (
                                <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          <span className="font-mono tabular-nums">{c.managementUserCount}/{limits.management}</span> mgmt
                          <span className="text-slate-300 mx-1">·</span>
                          <span className="font-mono tabular-nums">{c.cpoCount}/{limits.cpo}</span> CPO
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{c.lastActivityAt ? formatDate(c.lastActivityAt) : "—"}</td>
                        <td className="px-4 py-2.5 text-slate-500">{formatDate(c.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
