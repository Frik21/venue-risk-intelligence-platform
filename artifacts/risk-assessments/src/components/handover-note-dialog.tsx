import { useState } from "react";
import { enqueueOfflineSubmission } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Shift Handover Note - Following Roadmap, Tier 2 item 13 ("shift
// handover notes between CPOs on multi-day details"). A leaner sibling
// of the After-Action Report dialog: same underlying record
// (after_action_reports, reportType: "handover") and offline-queue
// submission path, but a single freeform note rather than AAR's fixed
// sections - the point here is quick continuity for whoever's coming
// on next ("gate code changed", "principal running late", "extra
// watcher posted at the north exit"), not a structured report.
export function HandoverNoteDialog({ taskId, taskTitle, onClose }: { taskId: number; taskTitle: string; onClose: () => void }) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    if (!note.trim()) return;
    setSubmitting(true);
    enqueueOfflineSubmission("after_action_report", {
      taskId,
      reportType: "handover",
      summary: note.trim(),
    });
    toast({ title: "Handover note saved", description: "Your teammates on this task will see it, and it's queued to sync to Command Desk." });
    setSubmitting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Shift Handover Note</h2>
          <p className="text-xs text-slate-500 mt-0.5">{taskTitle}</p>
        </div>
        <Textarea
          placeholder="What does the next CPO on this task need to know? e.g. gate code, principal's mood, anything outstanding..."
          rows={5}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-3 pt-2">
          <Button onClick={submit} disabled={submitting || !note.trim()}>Save Note</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
