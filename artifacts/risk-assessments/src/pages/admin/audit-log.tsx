import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type GlobalAuditLogEntry } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { History, FilePlus, RefreshCw, ShieldCheck } from "lucide-react";
import { formatDateTime } from "@/lib/display-utils";

const ACTION_LABELS: Record<string, string> = {
  created: "Assessment created",
  status_changed: "Status changed",
  approved: "Assessment approved",
};

const ACTION_ICONS: Record<string, typeof FilePlus> = {
  created: FilePlus,
  status_changed: RefreshCw,
  approved: ShieldCheck,
};

// "Audit History / Administration" - honestly scoped. audit_log only
// ever gets written to from the Assessments create/status-change/
// approve lifecycle (see artifacts/api-server/src/routes/assessments.ts)
// - tasks, users, venues etc have no audit trail today, so this is
// Assessment Activity, not a platform-wide audit log.
export default function AuditLogPage() {
  const { data: entries = [], isLoading } = useQuery<GlobalAuditLogEntry[]>({
    queryKey: ["audit-log-all"],
    queryFn: api.auditLog.listAll,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit History</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Assessment activity - creation, status changes, and approvals. Other entities (tasks, users, venues) don't have audit logging yet.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <History className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No activity yet</h3>
            <p className="text-sm text-slate-400">Creating, updating, or approving an assessment will show up here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {entries.map((e) => {
              const Icon = ACTION_ICONS[e.action] ?? History;
              return (
                <div key={e.id} className="px-5 py-4 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-900">
                      <span className="font-medium">{ACTION_LABELS[e.action] ?? e.action}</span>
                      {e.assessmentId && (
                        <>
                          {" · "}
                          <Link href={`/assessments/${e.assessmentId}`} className="text-blue-600 hover:underline">
                            {e.assessmentTitle ?? `Assessment #${e.assessmentId}`}
                          </Link>
                        </>
                      )}
                    </div>
                    {e.fieldChanged && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {e.fieldChanged}: {e.oldValue ?? "—"} &rarr; {e.newValue ?? "—"}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-0.5">
                      {e.userName ?? "Unknown user"} &middot; {formatDateTime(e.createdAt)}
                    </div>
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
