import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Users, Plus, ShieldCheck, Eye, Edit3, Shield } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ROLE_COLORS = {
  admin:    "text-red-700 bg-red-50 border-red-200",
  analyst:  "text-blue-700 bg-blue-50 border-blue-200",
  reviewer: "text-purple-700 bg-purple-50 border-purple-200",
  viewer:   "text-slate-600 bg-slate-100 border-slate-200",
};

const ROLE_ICONS = {
  admin:    Shield,
  analyst:  Edit3,
  reviewer: ShieldCheck,
  viewer:   Eye,
};

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", role: "analyst" as any });
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
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
              <SelectItem value="admin">Admin — Full access</SelectItem>
              <SelectItem value="analyst">Analyst — Create and edit assessments</SelectItem>
              <SelectItem value="reviewer">Reviewer — Approve assessments</SelectItem>
              <SelectItem value="viewer">Viewer — Read only</SelectItem>
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

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: api.users.list,
  });

  return (
    <div className="space-y-5">
      {showNew && <NewUserDialog onClose={() => setShowNew(false)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage platform users and access roles</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add User
        </Button>
      </div>

      {/* Role explanation */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(["admin", "analyst", "reviewer", "viewer"] as const).map((role) => {
          const Icon = ROLE_ICONS[role];
          const count = users.filter(u => u.role === role).length;
          return (
            <Card key={role}>
              <CardContent className="p-4">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", ROLE_COLORS[role])}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs text-slate-500 capitalize">{role}s</div>
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
              const Icon = ROLE_ICONS[user.role] ?? Eye;
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
