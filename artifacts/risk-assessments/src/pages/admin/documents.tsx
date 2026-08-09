import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type DocumentRecord } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, FileText, CheckCircle2 } from "lucide-react";
import { timeAgo, EVIDENCE_TYPES } from "@/lib/display-utils";

const evidenceTypeLabel = (type: string) => EVIDENCE_TYPES.find((t) => t.value === type)?.label ?? type;

// "Documents / PDF Repository" - deliberately Evidence-only. There's
// no persisted "Reports" record anywhere (the Reports page renders
// on-demand and never saves a row), so a real repository can only
// reflect what's actually stored: Evidence attached to assessments.
export default function DocumentsPage() {
  const { data: docs = [], isLoading } = useQuery<DocumentRecord[]>({
    queryKey: ["evidence-all"],
    queryFn: api.evidence.listAll,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Documents / PDF Repository</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Evidence attached to assessments across the platform. Report PDFs are generated on demand from{" "}
          <Link href="/reports" className="text-blue-600 hover:underline">Reports</Link> and aren't stored here.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No documents yet</h3>
            <p className="text-sm text-slate-400">Evidence added to an assessment will show up here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {docs.map((d) => (
              <Link key={d.id} href={`/assessments/${d.assessmentId}`}>
                <div className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50 cursor-pointer">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 text-sm truncate">{d.label}</span>
                      {d.verified && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {d.assessmentTitle ?? "Unknown assessment"}
                      {d.uploadedByName && ` · Added by ${d.uploadedByName}`} · {timeAgo(d.createdAt)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] uppercase shrink-0">{evidenceTypeLabel(d.evidenceType)}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
