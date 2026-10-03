import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Star, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type PublicFeedbackInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

function StarPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <Label className="text-slate-300">{label}</Label>
      <div className="flex items-center gap-1 mt-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="p-0.5"
          >
            <Star className={cn("w-7 h-7 transition-colors", n <= value ? "fill-amber-400 text-amber-400" : "text-slate-700")} />
          </button>
        ))}
      </div>
    </div>
  );
}

// The public, unauthenticated side of Post-task client satisfaction -
// Following Roadmap Tier 3, item 19. Scoped via AskUserQuestion: a
// client fills this in directly (no login, since there's no client
// portal), reached via a one-time link a Manager generates on the
// Task (pages/tasks/list.tsx's FeedbackPanel) and sends manually - no
// email infra exists to send it automatically. Deliberately outside
// RequireAuth/Layout's normal gating (see components/require-auth.tsx
// and components/layout.tsx's own /feedback/ bypasses) since this page
// must render with no session at all, for someone who may never have
// one.
export default function FeedbackPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery<PublicFeedbackInfo>({
    queryKey: ["public-feedback", token],
    queryFn: () => api.publicFeedback.get(token),
    retry: false,
  });

  const [overallRating, setOverallRating] = useState(0);
  const [professionalismRating, setProfessionalismRating] = useState(0);
  const [punctualityRating, setPunctualityRating] = useState(0);
  const [communicationRating, setCommunicationRating] = useState(0);
  const [comment, setComment] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      api.publicFeedback.submit(token, {
        overallRating,
        professionalismRating,
        punctualityRating,
        communicationRating,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => setJustSubmitted(true),
  });

  const canSubmit = overallRating > 0 && professionalismRating > 0 && punctualityRating > 0 && communicationRating > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-blue-400" />
          <div className="text-center">
            <div className="text-lg font-bold tracking-wide">VENUEGUARD</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">Client Feedback</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          {isLoading ? (
            <p className="text-sm text-slate-400 text-center">Loading...</p>
          ) : error || !data ? (
            <p className="text-sm text-red-400 text-center">This feedback link is invalid or has expired.</p>
          ) : justSubmitted || data.submitted ? (
            <div className="text-center space-y-2 py-4">
              <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto" />
              <p className="font-medium">Thank you for your feedback.</p>
              <p className="text-sm text-slate-400">Your response for "{data.taskTitle}" has been recorded.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-slate-400">{data.companyName} would like your feedback on:</p>
                <p className="font-medium">{data.taskTitle}</p>
              </div>

              <StarPicker label="Overall Satisfaction" value={overallRating} onChange={setOverallRating} />
              <StarPicker label="Professionalism" value={professionalismRating} onChange={setProfessionalismRating} />
              <StarPicker label="Punctuality" value={punctualityRating} onChange={setPunctualityRating} />
              <StarPicker label="Communication" value={communicationRating} onChange={setCommunicationRating} />

              <div>
                <Label className="text-slate-300">Comments (optional)</Label>
                <Textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white mt-1.5"
                  placeholder="Anything else you'd like us to know..."
                />
              </div>

              {submitMutation.isError && (
                <p className="text-sm text-red-400">{(submitMutation.error as Error).message}</p>
              )}

              <Button className="w-full" disabled={!canSubmit || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
                {submitMutation.isPending ? "Submitting..." : "Submit Feedback"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
