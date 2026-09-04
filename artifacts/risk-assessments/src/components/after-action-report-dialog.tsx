import { useState } from "react";
import { enqueueOfflineSubmission } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Structured after-action report - Following Roadmap, Tier 2 item 7.
// Launched from a specific task row in Operators Note (unlike Report
// Incident, taskId is always known here, no selector needed), so this
// stays a small task-scoped form. Same offline-queue submission
// pattern as Report Incident - saves locally first, syncs once the
// network's actually reachable, so a report drafted at the end of a
// long day in a dead zone isn't lost.
export function AfterActionReportDialog({ taskId, taskTitle, onClose }: { taskId: number; taskTitle: string; onClose: () => void }) {
  const { toast } = useToast();
  const [summary, setSummary] = useState("");
  const [incidentsEncountered, setIncidentsEncountered] = useState("");
  const [routeDeviations, setRouteDeviations] = useState("");
  const [clientFeedback, setClientFeedback] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    if (!summary.trim()) return;
    setSubmitting(true);
    enqueueOfflineSubmission("after_action_report", {
      taskId,
      summary: summary.trim(),
      incidentsEncountered: incidentsEncountered.trim() || undefined,
      routeDeviations: routeDeviations.trim() || undefined,
      clientFeedback: clientFeedback.trim() || undefined,
      recommendations: recommendations.trim() || undefined,
    });
    toast({ title: "After-action report saved", description: "It's queued and will sync to your Command Desk automatically." });
    setSubmitting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">After-Action Report</h2>
          <p className="text-xs text-slate-500 mt-0.5">{taskTitle}</p>
        </div>
        <div>
          <Label>Summary *</Label>
          <Textarea placeholder="What happened overall - how the task went" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div>
          <Label>Incidents Encountered</Label>
          <Textarea placeholder="Anything worth flagging beyond a separate incident report" rows={3} value={incidentsEncountered} onChange={(e) => setIncidentsEncountered(e.target.value)} />
        </div>
        <div>
          <Label>Route / Schedule Deviations</Label>
          <Textarea placeholder="Where the plan didn't hold and why" rows={3} value={routeDeviations} onChange={(e) => setRouteDeviations(e.target.value)} />
        </div>
        <div>
          <Label>Client Feedback</Label>
          <Textarea placeholder="Anything the client said or asked for" rows={3} value={clientFeedback} onChange={(e) => setClientFeedback(e.target.value)} />
        </div>
        <div>
          <Label>Recommendations</Label>
          <Textarea placeholder="What to do differently next time" rows={3} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={submit} disabled={submitting || !summary.trim()}>Save Report</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
