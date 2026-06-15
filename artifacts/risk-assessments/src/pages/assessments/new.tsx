import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Venue } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AssessmentNew() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preVenueId = params.get("venueId");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: venues = [] } = useQuery<Venue[]>({
    queryKey: ["venues"],
    queryFn: api.venues.list,
  });

  const [form, setForm] = useState({
    title: "",
    venueId: preVenueId ?? "",
    description: "",
    intelSummary: "",
    analystNotes: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.assessments.create({
        title: form.title,
        venueId: form.venueId ? Number(form.venueId) : undefined,
        description: form.description || undefined,
        intelSummary: form.intelSummary || undefined,
        analystNotes: form.analystNotes || undefined,
      }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      toast({ title: "Assessment created" });
      navigate(`/assessments/${a.id}`);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate("/assessments")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Assessments
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Risk Assessment</h1>
        <p className="text-slate-500 text-sm mt-0.5">Create a new Physical Venue Risk Assessment</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assessment Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input
              placeholder="e.g. Grand Hyatt Dubai — Advance Security Assessment"
              value={form.title}
              onChange={e => set("title", e.target.value)}
            />
          </div>
          <div>
            <Label>Venue</Label>
            <Select value={form.venueId} onValueChange={v => set("venueId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a venue (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No venue</SelectItem>
                {venues.map(v => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name} — {v.city}, {v.country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              placeholder="Brief description of this assessment's scope..."
              value={form.description}
              onChange={e => set("description", e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Intelligence Summary</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Intel Summary</Label>
            <Textarea
              placeholder="Area security environment, threat overview, key intelligence..."
              value={form.intelSummary}
              onChange={e => set("intelSummary", e.target.value)}
              rows={4}
            />
          </div>
          <div>
            <Label>Analyst Notes</Label>
            <Textarea
              placeholder="Internal analyst notes, data sources, confidence levels..."
              value={form.analystNotes}
              onChange={e => set("analystNotes", e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.title}
        >
          {mutation.isPending ? "Creating..." : "Create Assessment"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/assessments")}>Cancel</Button>
      </div>
    </div>
  );
}
