import { useQuery } from "@tanstack/react-query";
import { api, type FieldNote } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPinned, AlertTriangle, CloudSun } from "lucide-react";
import { timeAgo } from "@/lib/display-utils";

// Area Advisories + Current Operating Conditions - both are free-text
// fields CPOs already fill in per-task (venue_risk_assessments), with
// no Manager-facing destination of their own before this page. One
// feed, split into the two field types, most recently updated first.
export default function FieldIntelligence() {
  const { data: notes = [], isLoading } = useQuery<FieldNote[]>({
    queryKey: ["field-notes"],
    queryFn: api.venueRiskAssessments.listFieldNotes,
  });

  const advisories = notes.filter((n) => n.areaAdvisories.trim().length > 0);
  const conditions = notes.filter((n) => n.currentOperatingConditions.trim().length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Field Intelligence</h1>
        <p className="text-slate-500 text-sm mt-0.5">Area advisories and current operating conditions reported by CPOs in the field</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-slate-400" />
              Area Advisories
            </h2>
            {isLoading ? (
              <Skeleton className="h-32" />
            ) : advisories.length === 0 ? (
              <p className="text-sm text-slate-400">No area advisories reported yet.</p>
            ) : (
              <div className="space-y-4">
                {advisories.map((n) => (
                  <div key={n.id} className="border-b border-slate-100 last:border-0 pb-4 last:pb-0">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.areaAdvisories}</p>
                    <p className="text-xs text-slate-400 mt-1.5">
                      {n.venueName ?? (n.location || "Unspecified location")}
                      {n.venueCity && `, ${n.venueCity}`} &middot; {n.operatorName ?? "Unknown operator"} &middot; {timeAgo(n.updatedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <CloudSun className="w-4 h-4 text-slate-400" />
              Current Operating Conditions
            </h2>
            {isLoading ? (
              <Skeleton className="h-32" />
            ) : conditions.length === 0 ? (
              <p className="text-sm text-slate-400">No operating conditions reported yet.</p>
            ) : (
              <div className="space-y-4">
                {conditions.map((n) => (
                  <div key={n.id} className="border-b border-slate-100 last:border-0 pb-4 last:pb-0">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.currentOperatingConditions}</p>
                    <p className="text-xs text-slate-400 mt-1.5">
                      {n.venueName ?? (n.location || "Unspecified location")}
                      {n.venueCity && `, ${n.venueCity}`} &middot; {n.operatorName ?? "Unknown operator"} &middot; {timeAgo(n.updatedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isLoading && notes.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <MapPinned className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No field notes yet</h3>
            <p className="text-sm text-slate-400">These populate automatically as CPOs fill in risk assessments on tasks.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
