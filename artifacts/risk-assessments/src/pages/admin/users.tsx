import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, BASE_SEATS_BY_ROLE, CPO_BASE_SEATS, type User, type Office, type UserRole, type ManagementRole, type CompanySeatUsage } from "@/lib/api";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { Users, Plus, ShieldCheck, Shield, Wallet, Users2, Workflow } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Manager, Finance, Human Resources, Operations: a subscribed
// company's own Management-side seats - what this page manages. CPOs
// and Admin (VenueGuard's own platform-owner role, repurposed as the
// real Owner Console at /owner) are deliberately not managed here:
// CPOs are a separate, seat-limited pool onboarded via Operator
// Database instead; Admin isn't tied to any one company at all, so it
// can't be a selectable role on a company-scoped Users page.
// Partial - both "cpo" and "admin" are valid UserRole values in the
// data model, but deliberately have no entry here since this page
// filters both out before rendering.
const ROLE_COLORS: Partial<Record<UserRole, string>> = {
  manager:         "text-purple-700 bg-purple-50 border-purple-200",
  finance:         "text-emerald-700 bg-emerald-50 border-emerald-200",
  human_resources: "text-rose-700 bg-rose-50 border-rose-200",
  operations:      "text-amber-700 bg-amber-50 border-amber-200",
};

const ROLE_ICONS: Partial<Record<UserRole, typeof Shield>> = {
  manager:         ShieldCheck,
  finance:         Wallet,
  human_resources: Users2,
  operations:      Workflow,
};

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  manager:         "Manager",
  finance:         "Finance",
  human_resources: "Human Resources",
  operations:      "Operations",
};

const MANAGEMENT_ROLES: ManagementRole[] = ["manager", "operations", "finance", "human_resources"];

// The Command Desk side of seat management, distinct from the Owner
// Console's version of the same idea (pages/owner/dashboard.tsx) - a
// Manager/Finance/HR/Operations user adjusting their own company's
// seats, via GET/PATCH /users/seats (self-service, not admin-only).
// Covers both the four Management roles and CPO (Operators note) -
// the CPO row is visually separated to match the Owner Console's own
// treatment of it as a completely separate pool, not a fifth role.
function AdditionalSeatsDialog({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery<{
    seatsByRole: Record<ManagementRole, CompanySeatUsage>;
    cpoSeatUsage: CompanySeatUsage;
  }>({
    queryKey: ["users-seats"],
    queryFn: api.users.seats,
  });
  const [additional, setAdditional] = useState<Record<ManagementRole, number>>({
    manager: 0,
    operations: 0,
    finance: 0,
    human_resources: 0,
  });
  const [additionalCpo, setAdditionalCpo] = useState(0);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Every role prices individually now (Owner-set, routes/companies.ts's
  // pricing config) - pricePerSeat rides along on each role's own usage
  // object rather than one shared price for all of them.
  const totalAdditionalCost =
    MANAGEMENT_ROLES.reduce((sum, role) => sum + additional[role] * (data?.seatsByRole[role].pricePerSeat ?? 0), 0) +
    additionalCpo * (data?.cpoSeatUsage.pricePerSeat ?? 0);

  useEffect(() => {
    if (!data) return;
    setAdditional({
      manager: data.seatsByRole.manager.additional,
      operations: data.seatsByRole.operations.additional,
      finance: data.seatsByRole.finance.additional,
      human_resources: data.seatsByRole.human_resources.additional,
    });
    setAdditionalCpo(data.cpoSeatUsage.additional);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      api.users.updateSeats({
        additionalManagerSeats: additional.manager,
        additionalOperationsSeats: additional.operations,
        additionalFinanceSeats: additional.finance,
        additionalHumanResourcesSeats: additional.human_resources,
        additionalCpoSeats: additionalCpo,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-seats"] });
      toast({ title: "Seats purchased" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Additional Seats</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every role starts with a fixed free base - select how many more you need, then Buy. Seats are available immediately.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            No payment processor is connected yet - Buy applies the seats without an actual charge.
          </p>
        </div>
        {isLoading ? (
          <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <>
            <div className="space-y-3">
              {MANAGEMENT_ROLES.map((role) => (
                <div key={role} className="flex items-center justify-between gap-3">
                  <Label className="text-sm">
                    {ROLE_LABELS[role]}{" "}
                    <span className="text-slate-400 font-normal">
                      ({BASE_SEATS_BY_ROLE[role]} base · ${data?.seatsByRole[role].pricePerSeat ?? 0}/seat)
                    </span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">+</span>
                    <Input
                      type="number"
                      min={0}
                      className="w-20 h-8 text-sm"
                      value={additional[role]}
                      onChange={(e) => setAdditional((s) => ({ ...s, [role]: Math.max(0, Number(e.target.value) || 0) }))}
                    />
                    <span className="text-xs text-slate-400 w-24">= {BASE_SEATS_BY_ROLE[role] + additional[role]} seats</span>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400 uppercase tracking-wide pt-1">Operators note</p>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">
                  CPO <span className="text-slate-400 font-normal">({CPO_BASE_SEATS} base · ${data?.cpoSeatUsage.pricePerSeat ?? 0}/seat)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">+</span>
                  <Input
                    type="number"
                    min={0}
                    className="w-20 h-8 text-sm"
                    value={additionalCpo}
                    onChange={(e) => setAdditionalCpo(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <span className="text-xs text-slate-400 w-24">= {CPO_BASE_SEATS + additionalCpo} seats</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Additional seats cost</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">${totalAdditionalCost.toLocaleString()}/mo</span>
            </div>
          </>
        )}
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || isLoading}>
            {mutation.isPending ? "Processing..." : `Buy${totalAdditionalCost > 0 ? ` - $${totalAdditionalCost.toLocaleString()}/mo` : ""}`}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const { data: offices = [] } = useQuery<Office[]>({ queryKey: ["offices"], queryFn: api.offices.list });
  const [selectedOfficeId] = useSelectedOfficeId();
  const [form, setForm] = useState({ name: "", email: "", role: "manager" as any, officeId: selectedOfficeId as number | null });
  const [initialPassword, setInitialPassword] = useState<string | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.users.create(form),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setInitialPassword(user.initialPassword);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  // No email infrastructure exists to send a real invite yet - the
  // admin shares this password out of band, shown here exactly once
  // (it's never retrievable again after this dialog closes).
  if (initialPassword) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
          <h2 className="text-lg font-bold">User Created</h2>
          <p className="text-sm text-slate-500">
            Share this temporary password with {form.name} - they'll be asked to set their own on first login. It won't be shown again.
          </p>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <code className="flex-1 font-mono text-sm text-slate-900">{initialPassword}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(initialPassword); toast({ title: "Copied" }); }}
            >
              Copy
            </Button>
          </div>
          <Button className="w-full" onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">Add New User</h2>
        <div>
          <Label>Full Name *</Label>
          <Input placeholder="John Smith" value={form.name} onChange={e => set("name", e.target.value)} />
        </div>
        <div>
          <Label>Email *</Label>
          <Input type="email" placeholder="john@example.com" value={form.email} onChange={e => set("email", e.target.value)} />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={form.role} onValueChange={v => set("role", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">Manager — Assigns and oversees CPOs</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
              <SelectItem value="human_resources">Human Resources</SelectItem>
              <SelectItem value="operations">Operations</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Office</Label>
          <Select
            value={form.officeId != null ? String(form.officeId) : "none"}
            onValueChange={(v) => setForm((f: any) => ({ ...f, officeId: v === "none" ? null : Number(v) }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No office</SelectItem>
              {offices.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name || !form.email}>
            {mutation.isPending ? "Creating..." : "Create User"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [showNew, setShowNew] = useState(false);
  const [showSeats, setShowSeats] = useState(false);

  const { data: allUsers = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: api.users.list,
  });
  const { data: seatsData } = useQuery<{ seatsByRole: Record<ManagementRole, CompanySeatUsage> }>({
    queryKey: ["users-seats"],
    queryFn: api.users.seats,
  });
  const [selectedOfficeId] = useSelectedOfficeId();
  // Neither CPOs nor Admin are managed from here. CPOs are a separate,
  // seat-limited pool onboarded via Operator Database instead, per
  // direct product direction. Admin is VenueGuard's own platform-owner
  // role (see the Owner Console at /owner) - not tied to any one
  // company, so it can't appear on a company-scoped Users page at all.
  // Filtered out before office-scoping so neither shows up in the
  // roster below or the role-count tiles.
  const users = filterByOffice(allUsers.filter(u => u.role !== "cpo" && u.role !== "admin"), selectedOfficeId);

  return (
    <div className="space-y-5">
      {showNew && <NewUserDialog onClose={() => setShowNew(false)} />}
      {showSeats && <AdditionalSeatsDialog onClose={() => setShowSeats(false)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users, Roles &amp; Permissions</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Manage Management-side users and access roles. No team grouping or granular per-user permissions exist yet - access is controlled entirely by the roles below. CPOs are managed separately, via Operator Database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowSeats(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Additional Seats
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add User
          </Button>
        </div>
      </div>

      {/* Role explanation - shows real seat usage (used/limit) once
          the company's seat data has loaded (see AdditionalSeatsDialog
          above for where the limit itself gets adjusted); falls back to
          a plain office-scoped count on first load so the tiles aren't
          empty while that query is still in flight. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["manager", "finance", "human_resources", "operations"] as const).map((role) => {
          const Icon = ROLE_ICONS[role] ?? Shield;
          const inRole = users.filter(u => u.role === role);
          const seat = seatsData?.seatsByRole[role];
          return (
            <Card key={role}>
              <CardContent className="p-4">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", ROLE_COLORS[role])}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xl font-bold">{seat ? `${seat.used}/${seat.limit}` : inRole.length}</div>
                <div className="text-xs text-slate-500">{ROLE_LABELS[role]}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No users yet</h3>
            <Button onClick={() => setShowNew(true)} className="mt-2"><Plus className="w-4 h-4 mr-1.5" />Add User</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {users.map((user) => {
              const Icon = ROLE_ICONS[user.role] ?? Shield;
              return (
                <div key={user.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {user.avatarInitials ?? user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{user.name}</span>
                      {!user.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{user.email} · Joined {formatDate(user.createdAt)}</div>
                  </div>
                  <div className={cn("flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded border shrink-0", ROLE_COLORS[user.role])}>
                    <Icon className="w-3.5 h-3.5" />
                    {ROLE_LABELS[user.role] ?? user.role}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
