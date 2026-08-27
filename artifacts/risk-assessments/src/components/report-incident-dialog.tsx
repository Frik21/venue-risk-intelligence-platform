import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FieldIncidentReportSeverity } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { enqueueOfflineSubmission } from "@/lib/offline-queue";
import { resolveCurrentLocation } from "@/components/location-search";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const SEVERITY_LABELS: Record<FieldIncidentReportSeverity, string> = { low: "Low", medium: "Medium", high: "High" };

// A CPO's own field-filed incident report - Following Roadmap, Tier 2
// item 6, built alongside the offline queue (lib/offline-queue.ts) that
// makes it safe to submit from a dead zone. Deliberately not a
// react-query mutation hitting the API directly - enqueueOfflineSubmission
// writes to localStorage first and only then tries the network, so this
// dialog can close instantly regardless of connectivity rather than
// spinning on a request that might never complete.
export function ReportIncidentDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [severity, setSeverity] = useState<FieldIncidentReportSeverity>("medium");
  const [summary, setSummary] = useState("");
  const [taskId, setTaskId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "in_progress_for", user?.id],
    queryFn: () => api.tasks.list({ assignedTo: user!.id }),
    enabled: user != null,
    select: (all) => all.filter((t) => t.status === "in_progress"),
  });

  async function submit() {
    if (!summary.trim()) return;
    setSubmitting(true);
    let location: { latitude?: number; longitude?: number; locationLabel?: string } = {};
    try {
      const resolved = await resolveCurrentLocation();
      location = { latitude: resolved.lat ?? undefined, longitude: resolved.lng ?? undefined, locationLabel: resolved.label };
    } catch (err) {
      console.error("Could not resolve location for incident report:", err);
    }
    enqueueOfflineSubmission("incident", {
      taskId: taskId ? Number(taskId) : undefined,
      severity,
      summary: summary.trim(),
      ...location,
    });
    toast({ title: "Incident report saved", description: "It's queued and will sync to your Command Desk automatically." });
    setSubmitting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Report Incident</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Filed reports save locally and sync automatically, even without a signal right now.
          </p>
        </div>
        <div>
          <Label>Severity</Label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as FieldIncidentReportSeverity)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SEVERITY_LABELS) as FieldIncidentReportSeverity[]).map((s) => (
                <SelectItem key={s} value={s}>{SEVERITY_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {tasks.length > 0 && (
          <div>
            <Label>Related Task (optional)</Label>
            <Select value={taskId || "none"} onValueChange={(v) => setTaskId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not task-specific</SelectItem>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>What happened? *</Label>
          <Textarea
            placeholder="Describe the incident - what happened, who was involved, any immediate action taken"
            rows={5}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={submit} disabled={submitting || !summary.trim()}>
            Save Report
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
