import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Alert, type AlertStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Bell, CheckCheck, EyeOff, ArrowUpRight } from "lucide-react";
import { getPriorityColor, timeAgo } from "@/lib/display-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
