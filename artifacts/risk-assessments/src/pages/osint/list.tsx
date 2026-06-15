import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type OsintEvent, type Venue } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useSearch } from "wouter";
import { Radio, CheckCircle2, XCircle, ExternalLink, Globe } from "lucide-react";
import { timeAgo } from "@/lib/display-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const EVENT_COLORS: Record<string, string> = {
  crime:        "text-red-700 bg-red-50 border-red-200",
  protest:      "text-orange-700 bg-orange-50 border-orange-200",
  riot:         "text-red-800 bg-red-100 border-red-300",
  police_advisory: "text-blue-700 bg-blue-50 border-blue-200",
  political:    "text-purple-700 bg-purple-50 border-purple-200",
  default:      "text-slate-600 bg-slate-50 border-slate-200",
};

function ReviewModal({ event, onClose }: { event: OsintEvent; onClose: () => void }) {
  const [decision, setDecision] = useState<"accepted" | "rejected">("accepted");
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => api.osint.review(event.id, { status: decision, analystNote: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["osint"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast({ title: decision === "accepted" ? "Event accepted — alert raised" : "Event rejected" });
      onClose();
    },
  });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Review OSINT Event</h2>
        <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700">{event.summary}</div>
        <div>
          <label className="text-sm font-medium block mb-2">Decision</label>
          <div className="flex gap-3">
            <Button
              variant={decision === "accepted" ? "default" : "outline"}
              size="sm"
              onClick={() => setDecision("accepted")}
              className="flex-1"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Accept (raise alert)
            </Button>
            <Button
              variant={decision === "rejected" ? "destructive" : "outline"}
              size="sm"
              onClick={() => setDecision("rejected")}
              className="flex-1"
            >
              <XCircle className="w-4 h-4 mr-1.5" /> Reject
            </Button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Analyst Note</label>
          <Textarea placeholder="Reason for decision, additional context..." value={note} onChange={e => setNote(e.target.value)} rows={3} />
        </div>
        <div className="flex gap-3">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Submitting..." : "Submit Review"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function OsintList() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const preVenueId = params.get("venueId");

  const [selectedVenue, setSelectedVenue] = useState(preVenueId ?? "");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [reviewing, setReviewing] = useState<OsintEvent | null>(null);

  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: events = [], isLoading } = useQuery<OsintEvent[]>({
    queryKey: ["osint", selectedVenue],
    queryFn: () => api.venues.osint(Number(selectedVenue)),
    enabled: !!selectedVenue,
  });

  const filtered = statusFilter === "all" ? events : events.filter(e => e.status === statusFilter);
  const eventColor = (type: string) => EVENT_COLORS[type] ?? EVENT_COLORS.default;

  return (
    <div className="space-y-5">
      {reviewing && <ReviewModal event={reviewing} onClose={() => setReviewing(null)} />}

      <div>
        <h1 className="text-2xl font-bold text-slate-900">OSINT Monitor</h1>
        <p className="text-slate-500 text-sm mt-0.5">Open-source intelligence events for venue threat assessment</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={selectedVenue} onValueChange={setSelectedVenue}>
          <SelectTrigger className="w-64">
            <Globe className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Select a venue" />
          </SelectTrigger>
          <SelectContent>
            {venues.map(v => (
              <SelectItem key={v.id} value={String(v.id)}>{v.name} — {v.city}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!selectedVenue ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Radio className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600">Select a venue</h3>
            <p className="text-sm text-slate-400 mt-1">Choose a venue to load OSINT events for that location</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Radio className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-400">No {statusFilter !== "all" ? statusFilter : ""} events found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((ev) => (
            <Card key={ev.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 mt-0.5", eventColor(ev.eventType))}>
                    {ev.eventType.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800">{ev.summary}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                      {ev.sourceName && <span>{ev.sourceName}</span>}
                      {ev.sourceUrl && (
                        <a href={ev.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-500 flex items-center gap-0.5">
                          <ExternalLink className="w-3 h-3" /> Source
                        </a>
                      )}
                      {ev.lat && <span className="font-mono text-[10px]">{ev.lat.toFixed(4)}, {ev.lng?.toFixed(4)}</span>}
                      <span className="ml-auto">{timeAgo(ev.createdAt)}</span>
                    </div>
                    {ev.analystNote && (
                      <div className="mt-2 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                        Note: {ev.analystNote}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {ev.status === "pending" ? (
                      <Button size="sm" variant="outline" onClick={() => setReviewing(ev)}>
                        Review
                      </Button>
                    ) : (
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase",
                        ev.status === "accepted"
                          ? "text-green-700 bg-green-50 border-green-200"
                          : "text-slate-500 bg-slate-100 border-slate-200"
                      )}>
                        {ev.status}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
