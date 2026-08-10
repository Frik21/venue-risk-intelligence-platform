import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Alert, type AlertStatus, type Venue, type Task, type User } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Bell, CheckCheck, EyeOff, ArrowUpRight, X, Search, ClipboardList } from "lucide-react";
import { getPriorityColor, timeAgo } from "@/lib/display-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { type TaskBucket, BUCKET_CONFIG, taskBucket } from "@/lib/task-bucket";

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

// Search phrases are what the GDELT news-monitoring OSINT source (see
// artifacts/api-server/src/lib/gdelt.ts, built next) actually queries
// for, per venue - an operator picking specific phrases ("mass
// shooting", "stabbing", a venue-specific term) is the noise filter
// itself, not an afterthought bolted on top of it.
export function SearchPhrasesPanel() {
  const [venueId, setVenueId] = useState<number | null>(null);
  const [newPhrase, setNewPhrase] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });

  const { data: phrases = [], isLoading: phrasesLoading } = useQuery({
    queryKey: ["search-phrases", venueId],
    queryFn: () => api.searchPhrases.list(venueId as number),
    enabled: venueId != null,
  });

  const addMutation = useMutation({
    mutationFn: (phrase: string) => api.searchPhrases.create(venueId as number, phrase),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["search-phrases", venueId] });
      setNewPhrase("");
    },
    onError: (err: Error) => toast({ title: "Couldn't add phrase", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.searchPhrases.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-phrases", venueId] }),
  });

  const submitPhrase = () => {
    const trimmed = newPhrase.trim();
    if (trimmed.length < 2 || venueId == null) return;
    addMutation.mutate(trimmed);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" /> Search Phrases
        </CardTitle>
        <p className="text-slate-500 text-xs mt-0.5">
          Choose the phrases GDELT news monitoring watches for at each venue - e.g. "mass shooting", "stabbing", "bombing", or anything venue-specific.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={venueId != null ? String(venueId) : undefined} onValueChange={(v) => setVenueId(Number(v))}>
          <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Select a venue" /></SelectTrigger>
          <SelectContent>
            {venues.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {venueId != null && (
          <>
            <div className="flex gap-2">
              <Input
                placeholder='e.g. "mass shooting"'
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitPhrase()}
                className="max-w-xs"
              />
              <Button size="sm" onClick={submitPhrase} disabled={addMutation.isPending || newPhrase.trim().length < 2}>
                Add
              </Button>
            </div>

            {phrasesLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : phrases.length === 0 ? (
              <p className="text-xs text-slate-400">No phrases yet - this venue isn't being monitored until you add at least one.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {phrases.map((p) => (
                  <Badge key={p.id} variant="secondary" className="gap-1.5 pr-1.5">
                    {p.phrase}
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(p.id)}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label={`Remove "${p.phrase}"`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

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

      <TaskFlagsPanel />

      <SearchPhrasesPanel />

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
