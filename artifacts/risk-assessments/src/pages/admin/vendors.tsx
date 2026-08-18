import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Vendor, type VendorStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Store, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const VENDOR_STATUS_CONFIG: Record<VendorStatus, { label: string; color: string }> = {
  lead: { label: "Lead", color: "text-amber-700 bg-amber-50 border-amber-200" },
  active: { label: "Active", color: "text-blue-700 bg-blue-50 border-blue-200" },
  preferred: { label: "Preferred", color: "text-purple-700 bg-purple-50 border-purple-200" },
  inactive: { label: "Inactive", color: "text-slate-600 bg-slate-100 border-slate-200" },
};

// CRM-style profile fields, same shape as Clients (structured primary
// contact + status/category) - deliberately without Clients' day/
// night rate or task/quote rollup fields, since those are client-
// billing concepts that don't apply to a vendor relationship (see
// schema/vendors.ts). Notes live on the vendor's detail page as a
// dated activity log (vendor_activities), not here.
export function VendorDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: vendor?.name ?? "",
    status: (vendor?.status ?? "active") as VendorStatus,
    category: vendor?.category ?? "",
    primaryContactName: vendor?.primaryContactName ?? "",
    primaryContactRole: vendor?.primaryContactRole ?? "",
    email: vendor?.email ?? "",
    phone: vendor?.phone ?? "",
    address: vendor?.address ?? "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name,
        status: form.status,
        category: form.category,
        primaryContactName: form.primaryContactName,
        primaryContactRole: form.primaryContactRole,
        email: form.email,
        phone: form.phone,
        address: form.address,
      };
      return vendor ? api.vendors.update(vendor.id, data) : api.vendors.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: vendor ? "Vendor updated" : "Vendor onboarded" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.name.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">{vendor ? "Edit Vendor" : "Onboard Vendor"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Vendor / Company Name *</Label>
            <Input placeholder="e.g. Apex Security Equipment" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(VENDOR_STATUS_CONFIG) as VendorStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{VENDOR_STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Input placeholder="e.g. Equipment Supplier" value={form.category} onChange={(e) => set("category", e.target.value)} />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Primary Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact Name</Label>
              <Input value={form.primaryContactName} onChange={(e) => set("primaryContactName", e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <Input placeholder="e.g. Account Manager" value={form.primaryContactRole} onChange={(e) => set("primaryContactRole", e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Saving..." : vendor ? "Save Changes" : "Onboard Vendor"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Vendors - a CRM-style database of subcontractors and suppliers used
// across tasks (equipment, transport, subcontracted CPOs, technology,
// training, etc.), per direct product direction. Same structural
// pattern as Clients (profile + dated activity log, detail page) but
// with vendor-specific fields - no rates or billing rollups, since a
// vendor is who VenueGuard pays/contracts with, not who it bills.
export default function VendorsPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: api.vendors.list });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.vendors.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: "Vendor removed" });
    },
  });

  return (
    <div className="space-y-5">
      {showDialog && <VendorDialog vendor={null} onClose={() => setShowDialog(false)} />}
      {editingVendor && <VendorDialog vendor={editingVendor} onClose={() => setEditingVendor(null)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendors</h1>
          <p className="text-slate-500 text-sm mt-0.5">Onboard and manage subcontractors and suppliers used across tasks</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Onboard Vendor
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : vendors.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Store className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No vendors yet</h3>
            <p className="text-sm text-slate-400 mb-4">Onboard your first vendor to start tracking them here</p>
            <Button onClick={() => setShowDialog(true)}><Plus className="w-4 h-4 mr-1.5" />Onboard Vendor</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="text-left px-4 py-2.5">Vendor</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Category</th>
                  <th className="text-left px-4 py-2.5">Primary Contact</th>
                  <th className="text-left px-4 py-2.5">Email</th>
                  <th className="text-left px-4 py-2.5">Phone</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((vendor) => {
                  const sc = VENDOR_STATUS_CONFIG[vendor.status];
                  return (
                    <tr key={vendor.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        <Link href={`/admin/vendors/${vendor.id}`} className="hover:underline hover:text-blue-600">{vendor.name}</Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{vendor.category || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {vendor.primaryContactName || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{vendor.email || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{vendor.phone || "—"}</td>
                      <td className="px-2 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingVendor(vendor)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(vendor.id)} className="text-red-600">
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
