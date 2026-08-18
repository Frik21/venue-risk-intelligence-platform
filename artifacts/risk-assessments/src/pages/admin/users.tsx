import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type User, type Office } from "@/lib/api";
import { useSelectedOfficeId, filterByOffice } from "@/lib/office-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Users, Plus, ShieldCheck, Shield, MapPin, Pencil } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Admin: VenueGuard's own owner/operator (this SaaS's platform admin).
// Manager: a subscribed client, oversees CPOs and assigns them tasks.
// CPO: the field operator - the Operational Canvas is their page.
const ROLE_COLORS = {
  admin:   "text-red-700 bg-red-50 border-red-200",
  manager: "text-purple-700 bg-purple-50 border-purple-200",
  cpo:     "text-blue-700 bg-blue-50 border-blue-200",
};

const ROLE_ICONS = {
  admin:   Shield,
  manager: ShieldCheck,
  cpo:     MapPin,
};

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const { data: offices = [] } = useQuery<Office[]>({ queryKey: ["offices"], queryFn: api.offices.list });
  const [selectedOfficeId] = useSelectedOfficeId();
  const [form, setForm] = useState({ name: "", email: "", role: "cpo" as any, officeId: selectedOfficeId as number | null });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.users.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User created" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

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
              <SelectItem value="admin">Admin — VenueGuard platform owner</SelectItem>
              <SelectItem value="manager">Manager — Assigns and oversees CPOs</SelectItem>
              <SelectItem value="cpo">CPO — Field operator</SelectItem>
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

// CPO pay rate - Manager-set, drives Personnel Costs (Costs page).
// Deliberately not part of self-service Account Details.
function CpoRateEditor({ user }: { user: User }) {
  const [editing, setEditing] = useState(false);
  const [dayRate, setDayRate] = useState(user.dayRate != null ? String(user.dayRate) : "");
  const [nightRate, setNightRate] = useState(user.nightRate != null ? String(user.nightRate) : "");
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.users.updateRates(user.id, {
        dayRate: dayRate.trim() === "" ? null : Number(dayRate),
        nightRate: nightRate.trim() === "" ? null : Number(nightRate),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Rates updated" });
      setEditing(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 shrink-0"
      >
        <Pencil className="w-3 h-3" />
        {user.dayRate != null || user.nightRate != null
          ? `Day ${user.dayRate ?? "—"} / Night ${user.nightRate ?? "—"}`
          : "Set rates"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Input className="h-7 w-20 text-xs" type="number" min={0} placeholder="Day" value={dayRate} onChange={(e) => setDayRate(e.target.value)} />
      <Input className="h-7 w-20 text-xs" type="number" min={0} placeholder="Night" value={nightRate} onChange={(e) => setNightRate(e.target.value)} />
      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save</Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
    </div>
  );
}

export default function UsersPage() {
  const [showNew, setShowNew] = useState(false);

  const { data: allUsers = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: api.users.list,
  });
  const [selectedOfficeId] = useSelectedOfficeId();
  const users = filterByOffice(allUsers, selectedOfficeId);

  return (
    <div className="space-y-5">
      {showNew && <NewUserDialog onClose={() => setShowNew(false)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users, Roles &amp; Permissions</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Manage platform users and access roles. No team grouping or granular per-user permissions exist yet - access is controlled entirely by the three roles below.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add User
        </Button>
      </div>

      {/* Role explanation */}
      <div className="grid grid-cols-3 gap-3">
        {(["admin", "manager", "cpo"] as const).map((role) => {
          const Icon = ROLE_ICONS[role];
          const inRole = users.filter(u => u.role === role);
          const activeCount = inRole.filter(u => u.active).length;
          return (
            <Card key={role}>
              <CardContent className="p-4">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", ROLE_COLORS[role])}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xl font-bold">{inRole.length}</div>
                <div className="text-xs text-slate-500 capitalize">{role}s{inRole.length > 0 && ` · ${activeCount} active`}</div>
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
                  {user.role === "cpo" && <CpoRateEditor user={user} />}
                  <div className={cn("flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded border uppercase shrink-0", ROLE_COLORS[user.role])}>
                    <Icon className="w-3.5 h-3.5" />
                    {user.role}
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
