import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { api, BASE_SEATS_BY_ROLE, CPO_BASE_SEATS, type Company, type CompanySummary, type CompanyStatus, type ManagementRole, type PlanType, type PricingConfig } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ShieldAlert, Building2, Users, UserCog, Wallet, TrendingUp, FlaskConical, Eye, Compass, Settings2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<CompanyStatus, { label: string; color: string }> = {
  trial: { label: "Trial", color: "text-blue-700 bg-blue-50 border-blue-200" },
  active: { label: "Active", color: "text-green-700 bg-green-50 border-green-200" },
  suspended: { label: "Suspended", color: "text-amber-700 bg-amber-50 border-amber-200" },
  cancelled: { label: "Cancelled", color: "text-red-700 bg-red-50 border-red-200" },
};

// Single plan, no more Enterprise/Micro Enterprise tiers - every
// company gets the same fixed base per role (BASE_SEATS_BY_ROLE), with
// additional seats purchasable per role beyond that. CPO seats
// (Operators note) follow the same shape but are tracked completely
// separately, via CPO_BASE_SEATS/CpoSeatInput below - not a fifth
// Management role.
const MANAGEMENT_ROLES: ManagementRole[] = ["manager", "operations", "finance", "human_resources"];
const ROLE_LABELS: Record<ManagementRole, string> = {
  manager: "Manager",
  operations: "Operations",
  finance: "Finance",
  human_resources: "HR",
};

type AdditionalSeats = Record<ManagementRole, number>;

const PLAN_LABELS: Record<PlanType, string> = { team: "Team", solo_operator: "Solo Operator" };

// Shared by both the "onboard a new company" and "edit an existing
// company's seats" dialogs - four small number inputs, one per
// Management role, each showing that role's fixed base alongside the
// additional count being set.
function SeatInputs({ value, onChange }: { value: AdditionalSeats; onChange: (role: ManagementRole, additional: number) => void }) {
  return (
    <div className="space-y-3">
      {MANAGEMENT_ROLES.map((role) => (
        <div key={role} className="flex items-center justify-between gap-3">
          <Label className="text-sm">
            {ROLE_LABELS[role]} <span className="text-slate-400 font-normal">({BASE_SEATS_BY_ROLE[role]} base)</span>
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">+</span>
            <Input
              type="number"
              min={0}
              className="w-20 h-8 text-sm"
              value={value[role]}
              onChange={(e) => onChange(role, Math.max(0, Number(e.target.value) || 0))}
            />
            <span className="text-xs text-slate-400 w-24">= {BASE_SEATS_BY_ROLE[role] + value[role]} seats</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// CPO seats (Operators note) - a single row, visually separated from
// the four Management roles above since it's a completely separate
// pool, not a fifth Management role. Shared by NewCompanyDialog and
// EditSeatsDialog the same way SeatInputs is.
function CpoSeatInput({ value, onChange }: { value: number; onChange: (additional: number) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400 uppercase tracking-wide">Operators note</p>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm">
          CPO <span className="text-slate-400 font-normal">({CPO_BASE_SEATS} base)</span>
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">+</span>
          <Input
            type="number"
            min={0}
            className="w-20 h-8 text-sm"
            value={value}
            onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          />
          <span className="text-xs text-slate-400 w-24">= {CPO_BASE_SEATS + value} seats</span>
        </div>
      </div>
    </div>
  );
}

function NewCompanyDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [planType, setPlanType] = useState<PlanType>("team");
  const [seats, setSeats] = useState<AdditionalSeats>({ manager: 0, operations: 0, finance: 0, human_resources: 0 });
  const [additionalCpoSeats, setAdditionalCpoSeats] = useState(0);
  const [cpoName, setCpoName] = useState("");
  const [cpoEmail, setCpoEmail] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Solo Operator is for an individual, not a company - per direct
  // product direction, it never asks for a "company name" at all, it's
  // just that person's own name (the underlying companies row still
  // exists under the hood, since company_id is how every table is
  // scoped platform-wide, but nothing in this flow frames it as
  // onboarding a company). Has no self-serve signup path yet (Owner
  // Console only) - so onboarding one means creating that account AND
  // its one CPO login in this same dialog, chained. A Team company
  // still only creates the company row itself - its first Manager
  // signs up separately via /register or is added later from
  // /admin/users.
  const mutation = useMutation({
    mutationFn: async () => {
      const company = await api.companies.create({
        name: planType === "solo_operator" ? cpoName : name,
        status: "trial",
        planType,
        ...(planType === "team"
          ? {
              additionalManagerSeats: seats.manager,
              additionalOperationsSeats: seats.operations,
              additionalFinanceSeats: seats.finance,
              additionalHumanResourcesSeats: seats.human_resources,
              additionalCpoSeats,
            }
          : {}),
      });
      if (planType === "solo_operator") {
        const cpo = await api.users.create({ companyId: company.id, name: cpoName, email: cpoEmail, role: "cpo" });
        return { initialPassword: cpo.initialPassword as string | null } as const;
      }
      return { initialPassword: null };
    },
    onSuccess: ({ initialPassword }) => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      if (initialPassword) {
        setCreatedPassword(initialPassword);
      } else {
        toast({ title: "Company onboarded" });
        onClose();
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // No email infrastructure exists to send a real invite yet - shown
  // here exactly once (matches the same pattern as admin/users.tsx's
  // NewUserDialog), it won't be retrievable again after this closes.
  if (createdPassword) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
          <h2 className="text-lg font-bold">Solo Operator Onboarded</h2>
          <p className="text-sm text-slate-500">
            Share this temporary password with {cpoName} - they'll be asked to set their own on first login. It won't be shown again.
          </p>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <code className="flex-1 font-mono text-sm text-slate-900">{createdPassword}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(createdPassword); toast({ title: "Copied" }); }}
            >
              Copy
            </Button>
          </div>
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  const canSubmit = planType === "team" ? name.trim() : cpoName.trim() && cpoEmail.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">{planType === "team" ? "Onboard Company" : "Onboard Solo Operator"}</h2>
        <div>
          <Label>Plan</Label>
          <Select value={planType} onValueChange={(v) => setPlanType(v as PlanType)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="team">Team - a company, full Management + Operators Note</SelectItem>
              <SelectItem value="solo_operator">Solo Operator - an individual, Operators Note only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {planType === "team" ? (
          <>
            <div>
              <Label>Company Name *</Label>
              <Input placeholder="e.g. Sentinel Protective Services" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="border-t border-slate-100 pt-3">
              <Label className="text-xs text-slate-500 uppercase tracking-wide">Additional Seats</Label>
              <div className="mt-2 space-y-3">
                <SeatInputs value={seats} onChange={(role, additional) => setSeats((s) => ({ ...s, [role]: additional }))} />
                <CpoSeatInput value={additionalCpoSeats} onChange={setAdditionalCpoSeats} />
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Solo Operator is for one individual, not a company - no company name, no Management side, just their own login into Operators Note.
            </p>
            <div>
              <Label>Name *</Label>
              <Input value={cpoName} onChange={(e) => setCpoName(e.target.value)} />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={cpoEmail} onChange={(e) => setCpoEmail(e.target.value)} />
            </div>
          </div>
        )}
        <p className="text-xs text-slate-400">New subscriptions start on Trial status - activate once billing is confirmed.</p>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Creating..." : planType === "team" ? "Onboard Company" : "Onboard Solo Operator"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function EditSeatsDialog({ company, onClose }: { company: Company; onClose: () => void }) {
  const [seats, setSeats] = useState<AdditionalSeats>({
    manager: company.seatsByRole.manager.additional,
    operations: company.seatsByRole.operations.additional,
    finance: company.seatsByRole.finance.additional,
    human_resources: company.seatsByRole.human_resources.additional,
  });
  const [additionalCpoSeats, setAdditionalCpoSeats] = useState(company.cpoSeatUsage.additional);
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.companies.update(company.id, {
        additionalManagerSeats: seats.manager,
        additionalOperationsSeats: seats.operations,
        additionalFinanceSeats: seats.finance,
        additionalHumanResourcesSeats: seats.human_resources,
        additionalCpoSeats,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Seats updated" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">Manage Seats - {company.name}</h2>
        <SeatInputs value={seats} onChange={(role, additional) => setSeats((s) => ({ ...s, [role]: additional }))} />
        <CpoSeatInput value={additionalCpoSeats} onChange={setAdditionalCpoSeats} />
        <p className="text-xs text-slate-400">Additional seats beyond the base are billed separately once billing exists - tracked here regardless.</p>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Both subscriptions and their prices in one place, editable - closes
// the "just tell me what the subscriptions are and let me set the
// prices" ask. Seat bases (BASE_SEATS_BY_ROLE) stay fixed/read-only
// here - this dialog is about dollar amounts, not seat counts, which
// is its own separate, not-yet-decided product question.
function SubscriptionPricingDialog({ onClose, estimatedMonthlyRevenue }: { onClose: () => void; estimatedMonthlyRevenue?: number }) {
  const { data: pricing, isLoading } = useQuery<PricingConfig>({ queryKey: ["pricing-config"], queryFn: api.companies.pricing });
  const [baseMonthlyPrice, setBaseMonthlyPrice] = useState(0);
  const [pricePerAdditionalSeat, setPricePerAdditionalSeat] = useState(0);
  const [soloOperatorMonthlyPrice, setSoloOperatorMonthlyPrice] = useState(0);
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!pricing) return;
    setBaseMonthlyPrice(pricing.baseMonthlyPrice);
    setPricePerAdditionalSeat(pricing.pricePerAdditionalSeat);
    setSoloOperatorMonthlyPrice(pricing.soloOperatorMonthlyPrice);
  }, [pricing]);

  const mutation = useMutation({
    mutationFn: () => api.companies.updatePricing({ baseMonthlyPrice, pricePerAdditionalSeat, soloOperatorMonthlyPrice }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-config"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies-summary"] });
      toast({ title: "Pricing updated" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Subscriptions</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Directional pricing only - no payment processor is connected yet, this just controls the estimates shown on this page.
          </p>
          {estimatedMonthlyRevenue != null && (
            <p className="text-xs text-slate-500 mt-2">
              Est. Monthly Revenue (active companies, current prices): <span className="font-mono tabular-nums font-semibold text-slate-900">{estimatedMonthlyRevenue.toLocaleString()}</span>
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : (
          <>
            <div className="border border-slate-200 rounded-lg p-3 space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Team</div>
                <div className="text-xs text-slate-400">
                  Management + Operators Note - includes {BASE_SEATS_BY_ROLE.manager} Manager / {BASE_SEATS_BY_ROLE.operations} Operations / {BASE_SEATS_BY_ROLE.finance} Finance / {BASE_SEATS_BY_ROLE.human_resources} HR seats free
                </div>
              </div>
              <div>
                <Label className="text-xs">Base price / month</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1 h-8"
                  value={baseMonthlyPrice}
                  onChange={(e) => setBaseMonthlyPrice(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <Label className="text-xs">Price per additional seat</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1 h-8"
                  value={pricePerAdditionalSeat}
                  onChange={(e) => setPricePerAdditionalSeat(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-3 space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Solo Operator</div>
                <div className="text-xs text-slate-400">One individual, Operators Note only - one CPO seat, no Management side</div>
              </div>
              <div>
                <Label className="text-xs">Price / month</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1 h-8"
                  value={soloOperatorMonthlyPrice}
                  onChange={(e) => setSoloOperatorMonthlyPrice(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || isLoading}>
            {mutation.isPending ? "Saving..." : "Save"}
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
// status, seat usage, activity recency). Never a subscriber's actual
// operational content (task titles, client names, quote amounts,
// etc.) - that's the one hard boundary of this page. The backend
// (routes/companies.ts) enforces this by construction: its endpoints
// only ever return count()/max() aggregates grouped by company_id,
// never a row from a tenant table.
export default function OwnerDashboard() {
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [editingSeatsFor, setEditingSeatsFor] = useState<Company | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: companies = [], isLoading } = useQuery<Company[]>({ queryKey: ["companies"], queryFn: api.companies.list });
  const { data: summary } = useQuery<CompanySummary>({ queryKey: ["companies-summary"], queryFn: api.companies.summary });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ status: CompanyStatus; isInternal: boolean }> }) =>
      api.companies.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["companies-summary"] });
      toast({ title: "Company updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Drops the Owner into the Management/CPO pages, scoped to the
  // internal test company, for testing/QA - see SessionUser.isPreviewing.
  // Full page load (not client-side nav) for the same cache-safety
  // reason login uses one: react-query caches here aren't keyed by
  // company, so a stale in-memory cache from browsing /owner itself
  // shouldn't bleed into the preview session.
  const previewMutation = useMutation({
    mutationFn: (companyId: number) => api.auth.enterPreview(companyId),
    onSuccess: () => { window.location.href = "/admin"; },
    onError: (e: Error) => toast({ title: "Couldn't start preview", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-slate-100">
      {showNewCompany && <NewCompanyDialog onClose={() => setShowNewCompany(false)} />}
      {editingSeatsFor && <EditSeatsDialog company={editingSeatsFor} onClose={() => setEditingSeatsFor(null)} />}
      {showPricing && (
        <SubscriptionPricingDialog onClose={() => setShowPricing(false)} estimatedMonthlyRevenue={summary?.estimatedMonthlyRevenue} />
      )}

      <header className="h-14 flex items-center px-6 bg-slate-950 text-white gap-2.5">
        <ShieldAlert className="w-5 h-5 text-blue-400" />
        <div>
          <div className="text-sm font-bold tracking-wide">VENUEGUARD</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest -mt-0.5">Owner Console</div>
        </div>
        <div className="flex-1" />
        {/* Owner-only manual chooser (/quick-access, see require-auth.tsx
            for the gating) - jump straight into /cpo or /admin without
            digging through either app's own nav, mainly useful once
            you're already previewing a Test Company. */}
        <Link
          href="/quick-access"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <Compass className="w-3.5 h-3.5" />
          Quick Access
        </Link>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
            <p className="text-slate-500 text-sm mt-0.5">Every subscriber on the platform - account status and usage only</p>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl">
              Mark one company as your Test Company to browse the Management/CPO pages yourself for QA - Preview is only ever available on that one company, never a real subscriber.
            </p>
          </div>
          <Button onClick={() => setShowNewCompany(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Onboard Subscriber
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile icon={Building2} label="Total Companies" value={summary.totalCompanies} />
            <StatTile icon={TrendingUp} label="Active" value={summary.byStatus.active} />
            <StatTile icon={Users} label="Trial" value={summary.byStatus.trial} />
            <button type="button" onClick={() => setShowPricing(true)} className="text-left">
              <Card className="h-full cursor-pointer border-blue-200 bg-blue-50/60 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                <CardContent className="p-4 h-full flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-700">
                    <Wallet className="w-4 h-4" /> Subscription
                  </div>
                  <span className="text-xs text-blue-600">View & edit →</span>
                </CardContent>
              </Card>
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : companies.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <h3 className="font-medium text-slate-600 mb-1">No subscribers yet</h3>
              <p className="text-sm text-slate-400 mb-4">Onboard the first subscriber to get started</p>
              <Button onClick={() => setShowNewCompany(true)}><Plus className="w-4 h-4 mr-1.5" />Onboard Subscriber</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="text-left px-4 py-2.5">Subscriber</th>
                    <th className="text-left px-4 py-2.5">Plan</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-left px-4 py-2.5">Seats</th>
                    <th className="text-left px-4 py-2.5">Est. Charge</th>
                    <th className="text-left px-4 py-2.5">Last Activity</th>
                    <th className="text-left px-4 py-2.5">Signed Up</th>
                    <th className="text-left px-4 py-2.5">Test Company</th>
                    <th className="text-right px-4 py-2.5">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((c) => {
                    const sc = STATUS_CONFIG[c.status];
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-medium text-slate-900 flex items-center gap-2">
                          <UserCog className="w-3.5 h-3.5 text-slate-400" /> {c.name}
                          {c.isInternal && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                              <FlaskConical className="w-3 h-3" /> Internal
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {c.planType === "solo_operator" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                              <ShieldCheck className="w-3 h-3" /> {PLAN_LABELS.solo_operator}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">{PLAN_LABELS.team}</span>
                          )}
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
                        <td className="px-4 py-2.5 text-slate-600">
                          {c.planType === "solo_operator" ? (
                            <span className="whitespace-nowrap">
                              <span className="text-slate-400">CPO</span>{" "}
                              <span className="font-mono tabular-nums">{c.cpoCount}</span>
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              {MANAGEMENT_ROLES.map((role) => {
                                const seat = c.seatsByRole[role];
                                return (
                                  <span key={role} className="whitespace-nowrap">
                                    <span className="text-slate-400">{ROLE_LABELS[role]}</span>{" "}
                                    <span className="font-mono tabular-nums">{seat.used}/{seat.limit}</span>
                                  </span>
                                );
                              })}
                              <span className="whitespace-nowrap">
                                <span className="text-slate-400">CPO</span>{" "}
                                <span className="font-mono tabular-nums">{c.cpoSeatUsage.used}/{c.cpoSeatUsage.limit}</span>
                              </span>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-slate-700"
                                title="Manage seats"
                                onClick={() => setEditingSeatsFor(c)}
                              >
                                <Settings2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono tabular-nums">{c.estimatedMonthlyCharge.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-slate-500">{c.lastActivityAt ? formatDate(c.lastActivityAt) : "—"}</td>
                        <td className="px-4 py-2.5 text-slate-500">{formatDate(c.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <Button
                            variant={c.isInternal ? "secondary" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => updateMutation.mutate({ id: c.id, data: { isInternal: !c.isInternal } })}
                          >
                            {c.isInternal ? "Unmark" : "Mark as Test Company"}
                          </Button>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {c.isInternal && (
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={previewMutation.isPending}
                              onClick={() => previewMutation.mutate(c.id)}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                            </Button>
                          )}
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
    </div>
  );
}
