import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Alert, type AlertStatus, type Checkin, type Task, type User } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Bell, CheckCheck, EyeOff, ArrowUpRight, ClipboardList, ShieldAlert, MapPin } from "lucide-react";
import { getPriorityColor, timeAgo } from "@/lib/display-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { type TaskBucket, BUCKET_CONFIG, taskBucket } from "@/lib/task-bucket";

// The live duty-of-care signal - a CPO's own "panic" trigger, or the
// system's own "missed" finding when a scheduled check-in goes overdue
// (see lib/checkin-monitor.ts on the backend). Per direct product
// direction (Following Roadmap, Tier 1 item 1), this is the strongest
// "where has this been all my life" feature in the whole platform, so
// it sits first on this page, above the OSINT-driven alerts below -
// nothing here should wait behind a review queue. "ok" check-ins never
// show up here; this panel is only ever what needs a response.
function SafetyAlertsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: checkins = [], isLoading } = useQuery<Checkin[]>({ queryKey: ["checkins"], queryFn: api.checkins.list });

  const mutation = useMutation({
    mutationFn: (id: number) => api.checkins.acknowledge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
      toast({ title: "Acknowledged" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const needsAttention = checkins
    .filter((c) => (c.type === "panic" || c.type === "missed") && c.acknowledgedAt == null)
    .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());

  if (isLoading) return <Skeleton className="h-24" />;
  if (needsAttention.length === 0) return null;

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" /> Safety Alerts
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase text-red-700 bg-red-50 border-red-200">
            {needsAttention.length} need attention
          </span>
        </CardTitle>
        <p className="text-slate-500 text-xs mt-0.5">CPO panic alerts and missed scheduled check-ins.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {needsAttention.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase",
                    c.type === "panic" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200",
                  )}
                >
                  {c.type === "panic" ? "Panic" : "Missed Check-In"}
                </span>
                <span className="text-xs text-slate-400">{timeAgo(c.triggeredAt)}</span>
              </div>
              <div className="font-semibold text-slate-900 text-sm">{c.cpoName ?? "Unknown operator"}</div>
              {c.taskTitle && <p className="text-xs text-slate-500">{c.taskTitle}</p>}
              {c.locationLabel && (
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" /> {c.locationLabel}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 shrink-0 border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => mutation.mutate(c.id)}
              disabled={mutation.isPending}
            >
              <CheckCheck className="w-3 h-3 mr-1" /> Acknowledge
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Buckets that get flagged here for a Manager's attention - Running
// isn't included, it's just "in progress as expected", nothing to flag.
const FLAG_BUCKETS: TaskBucket[] = ["pending_details", "pending_allocation", "completed"];

// Task-lifecycle flags, separate from the OSINT/GDELT-driven alerts
// below - per direct product direction ("this alert page needs to be
// used to flag tasks pending details and pending allocation as well as
// completed tasks"). Reviewed state is tracked per-bucket on the task
// itself (see alertReviewedBucket in lib/api.ts) so a task that gets
// reviewed in Pending Details shows up unreviewed again once it moves
// to Pending Allocation. Notification frequency/timing is deliberately
// not built yet - parameters TBD.
function TaskFlagsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  // No real login/session in this app - same "default to the first
  // manager/admin found" convention used elsewhere.
  const currentManagerId = users.find((u) => u.role === "manager" || u.role === "admin")?.id;

  const reviewMutation = useMutation({
    mutationFn: ({ taskId, bucket }: { taskId: number; bucket: TaskBucket }) =>
      api.tasks.update(taskId, { alertReviewedBucket: bucket, alertReviewedBy: currentManagerId ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Marked reviewed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Reviewed tasks fall away entirely rather than sticking around with
  // a "Reviewed" badge - once you've dealt with a flag, it's off the
  // list, per direct product direction.
  const flagged = tasks
    .filter((t) => !t.archived)
    .map((t) => ({ task: t, bucket: taskBucket(t) }))
    .filter((x): x is { task: Task; bucket: TaskBucket } => FLAG_BUCKETS.includes(x.bucket))
    .filter(({ task, bucket }) => task.alertReviewedBucket !== bucket);

  if (isLoading) return <Skeleton className="h-24" />;
  if (flagged.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-slate-400" /> Task Flags
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase text-amber-700 bg-amber-50 border-amber-200">
            {flagged.length} need review
          </span>
        </CardTitle>
        <p className="text-slate-500 text-xs mt-0.5">
          Tasks sitting in Pending Details, Pending Allocation, or newly Completed.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {flagged.map(({ task, bucket }) => {
          const bc = BUCKET_CONFIG[bucket];
          return (
            <div key={`${task.id}-${bucket}`} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">{task.taskNumber}</span>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", bc.color)}>{bc.label}</span>
                </div>
                <div className="font-medium text-slate-900 text-sm truncate">{task.title || "Untitled task"}</div>
                {task.clientName && <p className="text-xs text-slate-500 truncate">Client: {task.clientName}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 shrink-0"
                onClick={() => reviewMutation.mutate({ taskId: task.id, bucket })}
                disabled={reviewMutation.isPending}
              >
                <CheckCheck className="w-3 h-3 mr-1" /> Mark as reviewed
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const STATUS_CONFIG: Record<AlertStatus, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: "text-amber-700 bg-amber-50 border-amber-200" },
  reviewed:  { label: "Reviewed",  color: "text-green-700 bg-green-50 border-green-200" },
  dismissed: { label: "Dismissed", color: "text-slate-500 bg-slate-100 border-slate-200" },
  escalated: { label: "Escalated", color: "text-red-700 bg-red-50 border-red-200" },
};

export default function AlertsList() {
  const [statusFilter, setStatusFilter] = useState<"all" | AlertStatus>("all");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ["alerts"],
    queryFn: api.alerts.list,
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: AlertStatus }) =>
      api.alerts.update(id, { status, reviewedBy: 1 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Alert updated" });
    },
  });

  // Used to filter this down to only "monitored" venues (ones with a
  // search phrase configured), but Search Phrases is now a flat,
  // venue-less list (see venueId comment in lib/db/src/schema/
  // monitoring.ts), so there's no venue to filter by right now - shows
  // every alert until phrases are venue-scoped again.
  const filtered = statusFilter === "all" ? alerts : alerts.filter(a => a.status === statusFilter);
  const pending = alerts.filter(a => a.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alert Queue</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {pending > 0 ? `${pending} alert${pending > 1 ? "s" : ""} pending review` : "All alerts reviewed"}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Alerts</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SafetyAlertsPanel />
      <TaskFlagsPanel />

      {isLoading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600">No alerts</h3>
            <p className="text-sm text-slate-400 mt-1">Alerts are generated from OSINT events and monitoring</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => {
            const sc = STATUS_CONFIG[alert.status];
            return (
              <Card key={alert.id} className={cn(alert.status === "pending" && "border-amber-200 shadow-sm")}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0", getPriorityColor(alert.priority))}>
                          {alert.priority}
                        </span>
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", sc.color)}>
                          {sc.label}
                        </span>
                        {alert.venueName && (
                          <span className="text-xs text-slate-500">{alert.venueName}</span>
                        )}
                        <span className="text-xs text-slate-400 ml-auto">{timeAgo(alert.createdAt)}</span>
                      </div>
                      <div className="font-semibold text-slate-900 text-sm mb-0.5">{alert.title}</div>
                      <p className="text-xs text-slate-500 line-clamp-2">{alert.summary}</p>
                      {alert.reviewedByName && (
                        <div className="text-[10px] text-slate-400 mt-1">
                          Reviewed by {alert.reviewedByName} · {alert.reviewedAt && timeAgo(alert.reviewedAt)}
                        </div>
                      )}
                    </div>
                    {alert.status === "pending" && (
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => mutation.mutate({ id: alert.id, status: "escalated" })}
                          disabled={mutation.isPending}
                        >
                          <ArrowUpRight className="w-3 h-3 mr-1" /> Escalate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 border-green-200 text-green-600 hover:bg-green-50"
                          onClick={() => mutation.mutate({ id: alert.id, status: "reviewed" })}
                          disabled={mutation.isPending}
                        >
                          <CheckCheck className="w-3 h-3 mr-1" /> Review
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 text-slate-400"
                          onClick={() => mutation.mutate({ id: alert.id, status: "dismissed" })}
                          disabled={mutation.isPending}
                        >
                          <EyeOff className="w-3 h-3 mr-1" /> Dismiss
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
