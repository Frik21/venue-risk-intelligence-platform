import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type TicketSource } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// The real "support channel for subscribers" - shared between Command
// Desk (components/layout.tsx) and Operators Note (pages/dashboard.tsx),
// so both surfaces submit through the same POST /support-tickets. Lands
// in the Owner's own IT inbox (/owner/it) - no email delivery, that
// inbox is the whole notification mechanism for now.
export function ReportIssueDialog({ source, onClose }: { source: TicketSource; onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.supportTickets.create({ subject, description, source }),
    onSuccess: () => {
      toast({ title: "Issue reported", description: "Thanks - the team has it." });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Report an Issue</h2>
          <p className="text-xs text-slate-500 mt-0.5">Describe what happened - this goes straight to the VenueGuard team.</p>
        </div>
        <div>
          <Label>Subject *</Label>
          <Input placeholder="Brief summary" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <Label>Description *</Label>
          <Textarea
            placeholder="What were you trying to do, and what happened instead?"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !subject.trim() || !description.trim()}
          >
            {mutation.isPending ? "Sending..." : "Send"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
