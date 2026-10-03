import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { api, type Vendor, type VendorActivity, type User, type VendorPerformanceReview } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2, Mail, Phone, MapPin, Store, MessageSquare, Star } from "lucide-react";
import { formatDateTime } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { VendorDialog, VENDOR_STATUS_CONFIG } from "./vendors";

function ProfileRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-slate-700">{value || "—"}</div>
      </div>
    </div>
  );
}

// Activity log - a running dated history of calls/emails/meetings
// against this vendor, same CRM-style pattern as the Client detail
// page's Activity Log. Append-only; the "logged by" author defaults
// to the first Manager/Admin found, same "no real login" convention
// used elsewhere in the app.
function ActivityLog({ vendorId, currentUserId }: { vendorId: number; currentUserId: number | undefined }) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: activities = [], isLoading } = useQuery<VendorActivity[]>({
    queryKey: ["vendor-activities", vendorId],
    queryFn: () => api.vendorActivities.list(vendorId),
  });

  const addMutation = useMutation({
    mutationFn: () => api.vendorActivities.create(vendorId, { note: note.trim(), createdBy: currentUserId ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-activities", vendorId] });
      setNote("");
      toast({ title: "Logged" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.vendorActivities.delete(vendorId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-activities", vendorId] });
      toast({ title: "Entry removed" });
    },
  });

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-slate-400" /> Activity Log
        </h2>
        <div className="flex items-start gap-2 mb-4">
          <Textarea
            placeholder="Log a call, meeting, or email..."
            className="text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || !note.trim()}
          >
            Log
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-20" />
        ) : activities.length === 0 ? (
          <p className="text-sm text-slate-400">No activity logged yet.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-3 last:pb-0 group">
                <div className="min-w-0">
                  <p className="text-slate-700 whitespace-pre-wrap">{a.note}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {a.createdByName ?? "Unknown"} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(a.id)}
                  className="text-slate-300 hover:text-red-600 shrink-0 opacity-0 group-hover:opacity-100"
                  aria-label="Delete entry"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Performance track record - Following Roadmap Tier 3, item 20. Read-
// only here: reviews are always added from the specific task-vendor
// engagement they're about (pages/tasks/list.tsx's VendorsUsedPanel),
// not from this page - this card is purely the rolled-up view of
// what's accumulated over time, same "read here, write elsewhere"
// split as e.g. a Task's own principals list on Operators Note.
function PerformanceReviews({ vendorId }: { vendorId: number }) {
  const { data: reviews = [], isLoading } = useQuery<VendorPerformanceReview[]>({
    queryKey: ["vendor-performance-reviews", vendorId],
    queryFn: () => api.vendorPerformanceReviews.listForVendor(vendorId),
  });

  if (isLoading) return <Skeleton className="h-32" />;

  const avg = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Star className="w-4 h-4 text-slate-400" /> Performance Reviews
          </h2>
          {avg != null && (
            <span className="flex items-center gap-1 text-sm">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-slate-900">{avg.toFixed(1)}</span>
              <span className="text-slate-400">({reviews.length} review{reviews.length === 1 ? "" : "s"})</span>
            </span>
          )}
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-400">No performance reviews yet - add one from the task this vendor was used on.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="text-sm border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cn("w-3.5 h-3.5", n <= r.rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                    ))}
                  </span>
                  <span className="text-xs text-slate-400">{formatDateTime(r.reviewedAt)}</span>
                </div>
                <p className="text-slate-500 text-xs mt-0.5">{r.taskTitle ?? "Unknown task"} · reviewed by {r.reviewedByName ?? "Unknown"}</p>
                {r.notes && <p className="text-slate-700 mt-1">{r.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VendorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [showEdit, setShowEdit] = useState(false);

  const { data: vendors = [], isLoading: vendorsLoading } = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: api.vendors.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const currentUserId = users.find((u) => u.role === "manager" || u.role === "admin")?.id;

  const vendor = vendors.find((v) => v.id === id);

  if (vendorsLoading) {
    return <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  }
  if (!vendor) {
    return (
      <div className="text-center py-20 text-slate-400">
        Vendor not found. <Link href="/admin/vendors" className="text-blue-600 hover:underline">Back to Vendors</Link>
      </div>
    );
  }

  const sc = VENDOR_STATUS_CONFIG[vendor.status];

  return (
    <div className="space-y-5">
      {showEdit && <VendorDialog vendor={vendor} onClose={() => setShowEdit(false)} />}

      <div>
        <Link href="/admin/vendors" className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Vendors
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{vendor.name}</h1>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border uppercase", sc.color)}>{sc.label}</span>
          </div>
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            <Pencil className="w-4 h-4 mr-1.5" /> Edit
          </Button>
        </div>
        {vendor.category && <p className="text-slate-500 text-sm mt-0.5">{vendor.category}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1">
          <CardContent className="p-5 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-slate-400" /> Profile
            </h2>
            <ProfileRow icon={Store} label="Primary Contact" value={[vendor.primaryContactName, vendor.primaryContactRole].filter(Boolean).join(" · ")} />
            <ProfileRow icon={Mail} label="Email" value={vendor.email} />
            <ProfileRow icon={Phone} label="Phone" value={vendor.phone} />
            <ProfileRow icon={MapPin} label="Address" value={vendor.address} />
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-5">
          <PerformanceReviews vendorId={vendor.id} />
          <ActivityLog vendorId={vendor.id} currentUserId={currentUserId} />
        </div>
      </div>
    </div>
  );
}
