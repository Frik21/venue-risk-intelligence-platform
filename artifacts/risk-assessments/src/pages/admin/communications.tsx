import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Announcement, type User } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";

// Manager-to-CPO broadcast instructions/announcements - one-way, no
// chat, no per-CPO targeting (every CPO sees every announcement), per
// direct product direction. Posted here, they show up on every CPO's
// own Communications panel on the Operational Canvas and surface in
// their Alerts too - see instructionAlerts in dashboard.tsx.
export default function CommunicationsPage() {
  const [message, setMessage] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: api.announcements.list,
  });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const currentUserId = users.find((u) => u.role === "manager" || u.role === "admin")?.id;

  const postMutation = useMutation({
    mutationFn: () => api.announcements.create({ message: message.trim(), createdBy: currentUserId ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setMessage("");
      toast({ title: "Announcement posted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.announcements.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Announcement removed" });
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Communications</h1>
        <p className="text-slate-500 text-sm mt-0.5">Broadcast instructions to every operator - shows up on their Operational Canvas and in their Alerts</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-slate-400" /> Post an Announcement
          </h2>
          <div className="flex items-start gap-2">
            <Textarea
              placeholder="e.g. Principal delayed 30 minutes - hold at current position until further notice."
              className="text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button
              className="shrink-0"
              onClick={() => postMutation.mutate()}
              disabled={postMutation.isPending || !message.trim()}
            >
              {postMutation.isPending ? "Posting..." : "Post"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Sent</h2>
          {isLoading ? (
            <Skeleton className="h-20" />
          ) : announcements.length === 0 ? (
            <p className="text-sm text-slate-400">No announcements posted yet.</p>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-3 last:pb-0 group">
                  <div className="min-w-0">
                    <p className="text-slate-700 whitespace-pre-wrap">{a.message}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {a.createdByName ?? "Unknown"} · {formatDateTime(a.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(a.id)}
                    className="text-slate-300 hover:text-red-600 shrink-0 opacity-0 group-hover:opacity-100"
                    aria-label="Delete announcement"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
