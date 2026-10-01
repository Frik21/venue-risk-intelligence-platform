import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api, type StatusIncident } from "@/lib/api";
import { formatDateTime } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

const INCIDENT_STATUS_LABELS: Record<StatusIncident["status"], string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};
const INCIDENT_STATUS_COLORS: Record<StatusIncident["status"], string> = {
  investigating: "text-red-400 bg-red-950 border-red-800",
  identified: "text-amber-400 bg-amber-950 border-amber-800",
  monitoring: "text-blue-400 bg-blue-950 border-blue-800",
  resolved: "text-emerald-400 bg-emerald-950 border-emerald-800",
};

// Public status page - Platform Maturity Roadmap, Tier 5, item 11.
// Entirely unauthenticated, same dark full-bleed treatment as
// pages/feedback.tsx/pages/client-portal.tsx - a subscriber mid-
// incident can check "is it down for everyone or just me" without
// logging in, let alone filing a ticket and waiting. Polls every 30s
// (matching /owner/it's own system-status refresh) so it stays live
// while open during a real incident.
export default function StatusPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-status"],
    queryFn: api.status.get,
    retry: false,
    refetchInterval: 30000,
  });

  const activeIncident = data?.incidents.find((i) => i.status !== "resolved");
  const allGood = !isLoading && data?.operational && !activeIncident;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="w-full max-w-lg mx-auto space-y-6 py-10">
        <div className="flex items-center gap-2.5 justify-center">
          <ShieldAlert className="w-6 h-6 text-blue-400" />
          <div className="text-sm font-bold tracking-wide">VENUEGUARD STATUS</div>
        </div>

        {isLoading ? (
          <div className="text-center text-sm text-slate-500">Checking...</div>
        ) : (
          <div
            className={cn(
              "rounded-xl border p-5 flex items-center gap-3",
              allGood ? "border-emerald-800 bg-emerald-950/50" : "border-amber-800 bg-amber-950/50",
            )}
          >
            {allGood ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
            )}
            <div>
              <div className="font-semibold">
                {!data?.operational ? "Service disruption" : allGood ? "All Systems Operational" : "Known issue"}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Checked {data ? formatDateTime(data.checkedAt) : "just now"}</div>
            </div>
          </div>
        )}

        {(data?.incidents.length ?? 0) > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Updates</h2>
            {data!.incidents.map((incident) => (
              <div key={incident.id} className="border border-slate-800 rounded-lg p-4 bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{incident.title}</span>
                  <Badge variant="outline" className={cn("text-[10px]", INCIDENT_STATUS_COLORS[incident.status])}>
                    {INCIDENT_STATUS_LABELS[incident.status]}
                  </Badge>
                </div>
                <p className="text-sm text-slate-400 mt-1.5">{incident.message}</p>
                <p className="text-[10px] text-slate-500 mt-2">{formatDateTime(incident.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
