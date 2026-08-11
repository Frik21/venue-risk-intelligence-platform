import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Office, type User } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Building, Plus, MapPin, MoreVertical, Pencil, Trash2, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function OfficeDialog({ office, managers, onClose }: { office: Office | null; managers: User[]; onClose: () => void }) {
  const [form, setForm] = useState({
    name: office?.name ?? "",
    address: office?.address ?? "",
    city: office?.city ?? "",
    country: office?.country ?? "",
    managerId: office?.managerId != null ? String(office.managerId) : "",
    notes: office?.notes ?? "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name,
        address: form.address,
        city: form.city,
        country: form.country,
        managerId: form.managerId ? Number(form.managerId) : null,
        notes: form.notes,
      };
      return office ? api.offices.update(office.id, data) : api.offices.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offices"] });
      toast({ title: office ? "Office updated" : "Office added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.name.trim() && form.city.trim() && form.country.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">{office ? "Edit Office" : "Add Office"}</h2>
        <div>
          <Label>Office Name *</Label>
          <Input placeholder="e.g. Johannesburg HQ" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label>Address</Label>
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>City *</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label>Country *</Label>
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Office Manager</Label>
          <Select value={form.managerId} onValueChange={(v) => set("managerId", v)}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              {managers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Saving..." : office ? "Save Changes" : "Add Office"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Office Locations - added manually by a Manager to track the
// company's own footprint, deliberately separate from Venues (client
// sites). No geocoding - just the reference details a Manager types in.
export default function OfficesPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: offices = [], isLoading } = useQuery<Office[]>({ queryKey: ["offices"], queryFn: api.offices.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.offices.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offices"] });
      toast({ title: "Office removed" });
    },
  });

  return (
    <div className="space-y-5">
      {showDialog && <OfficeDialog office={null} managers={managers} onClose={() => setShowDialog(false)} />}
      {editingOffice && <OfficeDialog office={editingOffice} managers={managers} onClose={() => setEditingOffice(null)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Office Locations</h1>
          <p className="text-slate-500 text-sm mt-0.5">Company offices and bases - added manually to track your footprint</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Office
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : offices.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No offices yet</h3>
            <p className="text-sm text-slate-400 mb-4">Add your first office location to start tracking your footprint</p>
            <Button onClick={() => setShowDialog(true)}><Plus className="w-4 h-4 mr-1.5" />Add Office</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offices.map((office) => (
            <Card key={office.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Building className="w-5 h-5 text-blue-600" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingOffice(office)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteMutation.mutate(office.id)} className="text-red-600">
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="font-semibold text-slate-900 text-sm mb-1">{office.name}</h3>
                <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{office.address ? `${office.address}, ` : ""}{office.city}, {office.country}</span>
                </div>
                {office.managerName && (
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <UserIcon className="w-3 h-3 shrink-0" /> {office.managerName}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
