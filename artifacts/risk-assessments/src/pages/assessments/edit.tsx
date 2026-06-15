import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Venue, type AssessmentDetail } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ASSESSMENT_STATUSES } from "@/lib/display-utils";

export default function AssessmentEdit() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const id = Number(params.id);

  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ["venues"], queryFn: api.venues.list });
  const { data: assessment, isLoading } = useQuery<AssessmentDetail>({
    queryKey: ["assessments", id],
    queryFn: () => api.assessments.get(id),
    enabled: !isNaN(id),
  });

  const [form, setForm] = useState({
    title: "", venueId: "", status: "draft",
    description: "", intelSummary: "", analystNotes: "",
  });

  useEffect(() => {
    if (assessment) {
      setForm({
        title: assessment.title,
        venueId: assessment.venueId ? String(assessment.venueId) : "",
        status: assessment.status,
        description: assessment.description ?? "",
        intelSummary: assessment.intelSummary ?? "",
        analystNotes: assessment.analystNotes ?? "",
      });
    }
  }, [assessment]);

  const mutation = useMutation({
    mutationFn: () => api.assessments.update(id, {
      title: form.title,
      venueId: form.venueId ? Number(form.venueId) : undefined,
      status: form.status as any,
      description: form.description || undefined,
      intelSummary: form.intelSummary || undefined,
      analystNotes: form.analystNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      qc.invalidateQueries({ queryKey: ["assessments", id] });
      toast({ title: "Assessment updated" });
      navigate(`/assessments/${id}`);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;

  return (
    <div className="max-w-2xl space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/assessments/${id}`)}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Assessment
      </Button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Edit Assessment</h1>
        <p className="text-slate-500 text-sm mt-0.5">Update assessment details and status</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assessment Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Venue</Label>
              <Select value={form.venueId} onValueChange={v => set("venueId", v)}>
                <SelectTrigger><SelectValue placeholder="No venue" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No venue</SelectItem>
                  {venues.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSESSMENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Intelligence Content</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Intel Summary</Label>
            <Textarea value={form.intelSummary} onChange={e => set("intelSummary", e.target.value)} rows={4} />
          </div>
          <div>
            <Label>Analyst Notes</Label>
            <Textarea value={form.analystNotes} onChange={e => set("analystNotes", e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.title}>
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
        <Button variant="outline" onClick={() => navigate(`/assessments/${id}`)}>Cancel</Button>
      </div>
    </div>
  );
}
