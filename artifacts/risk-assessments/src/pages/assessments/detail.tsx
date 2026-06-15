import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { api, type AssessmentDetail, type RiskMatrix, type Evidence, type AssessmentVersion } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Building2, ClipboardList, Shield, FolderOpen, History, CheckCircle2, Edit2, Trash2, Plus, ExternalLink, FileText,
} from "lucide-react";
import {
  getStatusColor, getStatusLabel, getRiskRatingColor, getRiskRatingLabel,
  formatDate, formatDateTime, RISK_RATINGS, EVIDENCE_TYPES,
} from "@/lib/display-utils";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type RatingKey = "areaRisk" | "accessControl" | "arrivalDeparture" | "parking" | "personnel" | "medical" | "hse" | "extraction";

const MATRIX_FIELDS: { key: RatingKey; label: string; description: string }[] = [
  { key: "areaRisk", label: "Area Risk", description: "Crime rates, political stability, civil unrest in surrounding area" },
  { key: "accessControl", label: "Access Control", description: "Entry/exit points, perimeter security, credentialling" },
  { key: "arrivalDeparture", label: "Arrival / Departure", description: "Route safety, drop-off/pick-up procedures, threat exposure" },
  { key: "parking", label: "Parking / Vehicles", description: "Secure parking, VBIED threat, vehicle control measures" },
  { key: "personnel", label: "Personnel Security", description: "On-site security staff, response capability, vetting" },
  { key: "medical", label: "Medical / First Aid", description: "On-site medical facilities, hospital proximity, response time" },
  { key: "hse", label: "HSE / Structural", description: "Fire safety, structural integrity, hazmat risks, egress routes" },
  { key: "extraction", label: "Extraction", description: "Emergency extraction routes, rally points, safe havens" },
];

function RatingCell({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const colors = {
    low: "bg-green-100 text-green-800 border-green-300",
    moderate: "bg-amber-100 text-amber-800 border-amber-300",
    moderate_high: "bg-orange-100 text-orange-800 border-orange-300",
    high: "bg-red-100 text-red-800 border-red-300",
    unknown: "bg-slate-100 text-slate-500 border-slate-300",
  } as Record<string, string>;

  if (disabled) {
    return (
      <span className={cn("text-[11px] font-bold px-2 py-1 rounded border uppercase", colors[value] ?? colors.unknown)}>
        {value === "moderate_high" ? "MOD-HIGH" : value?.toUpperCase() ?? "UNKNOWN"}
      </span>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 text-xs font-bold uppercase w-32 border", colors[value] ?? colors.unknown)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RISK_RATINGS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function RiskMatrixTab({ assessmentId }: { assessmentId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<RiskMatrix>>({});

  const { data: matrix, isLoading } = useQuery<RiskMatrix>({
    queryKey: ["assessments", assessmentId, "risk-matrix"],
    queryFn: () => api.assessments.riskMatrix(assessmentId),
  });

  const mutation = useMutation({
    mutationFn: () => api.assessments.upsertRiskMatrix(assessmentId, form),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["assessments", assessmentId, "risk-matrix"] });
      qc.invalidateQueries({ queryKey: ["assessments", assessmentId] });
      toast({ title: "Risk matrix saved" });
      setEditing(false);
      setForm(m);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const displayMatrix = editing ? form : (matrix ?? {});
  const setField = (k: RatingKey, v: string) => setForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Risk Matrix Assessment</h3>
          <p className="text-xs text-slate-500 mt-0.5">Rate each security domain from Low to High</p>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => { setForm(matrix ?? {}); setEditing(true); }}>
            <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Matrix"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setForm(matrix ?? {}); setEditing(false); }}>Cancel</Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-1/3">Domain</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Description</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-600 w-36">Rating</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX_FIELDS.map(({ key, label, description }) => (
              <tr key={key} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{label}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{description}</td>
                <td className="px-4 py-3 text-right">
                  <RatingCell
                    value={(displayMatrix as any)[key] ?? "unknown"}
                    onChange={(v) => setField(key, v)}
                    disabled={!editing}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white">
              <td className="px-4 py-3 font-bold" colSpan={2}>OVERALL RISK RATING</td>
              <td className="px-4 py-3 text-right">
                {editing ? (
                  <Select
                    value={(form as any).overallRating ?? "unknown"}
                    onValueChange={v => setForm(f => ({ ...f, overallRating: v as any }))}
                  >
                    <SelectTrigger className="h-8 text-xs font-bold uppercase w-32 bg-slate-700 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_RATINGS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={cn("text-xs font-bold px-2 py-1 rounded border uppercase",
                    getRiskRatingColor((matrix as any)?.overallRating ?? "unknown"))}>
                    {getRiskRatingLabel((matrix as any)?.overallRating)}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {(editing ? form.notes !== undefined : matrix?.notes) !== undefined && (
        <div>
          <Label className="text-xs">Matrix Notes</Label>
          {editing ? (
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional analyst notes on the risk matrix..."
            />
          ) : (
            matrix?.notes && <p className="text-sm text-slate-600 mt-1 bg-slate-50 p-3 rounded border">{matrix.notes}</p>
          )}
        </div>
      )}
      {editing && (
        <div>
          <Label className="text-xs">Matrix Notes</Label>
          <Textarea
            rows={3}
            value={form.notes ?? ""}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Additional analyst notes..."
          />
        </div>
      )}
    </div>
  );
}

function EvidenceTab({ assessmentId }: { assessmentId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    evidenceType: "analyst_note", label: "", content: "", url: "", section: "", analystNote: "",
  });

  const { data: evidence = [], isLoading } = useQuery<Evidence[]>({
    queryKey: ["assessments", assessmentId, "evidence"],
    queryFn: () => api.assessments.evidence(assessmentId),
  });

  const addMutation = useMutation({
    mutationFn: () => api.assessments.addEvidence(assessmentId, { ...addForm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments", assessmentId, "evidence"] });
      toast({ title: "Evidence added" });
      setShowAdd(false);
      setAddForm({ evidenceType: "analyst_note", label: "", content: "", url: "", section: "", analystNote: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.evidence.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessments", assessmentId, "evidence"] }),
  });

  const setF = (k: string, v: string) => setAddForm(f => ({ ...f, [k]: v }));
  const typeLabel = (t: string) => EVIDENCE_TYPES.find(e => e.value === t)?.label ?? t;

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Evidence Repository ({evidence.length})</h3>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Evidence
        </Button>
      </div>

      {showAdd && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={addForm.evidenceType} onValueChange={v => setF("evidenceType", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{EVIDENCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Section</Label>
                <Input className="h-8 text-xs" placeholder="e.g. Area Risk" value={addForm.section} onChange={e => setF("section", e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Label *</Label>
              <Input className="h-8 text-xs" placeholder="Evidence label or title" value={addForm.label} onChange={e => setF("label", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Content / Note</Label>
              <Textarea className="text-xs" rows={3} placeholder="Evidence content, analyst note, or description..." value={addForm.content} onChange={e => setF("content", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">URL</Label>
              <Input className="h-8 text-xs" placeholder="https://..." value={addForm.url} onChange={e => setF("url", e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !addForm.label}>
                {addMutation.isPending ? "Adding..." : "Add Evidence"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {evidence.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No evidence added yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {evidence.map((ev) => (
            <div key={ev.id} className="border border-slate-200 rounded-lg p-3 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{typeLabel(ev.evidenceType)}</Badge>
                    {ev.section && <Badge variant="outline" className="text-[10px]">{ev.section}</Badge>}
                    {ev.verified && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                  </div>
                  <div className="font-medium text-sm text-slate-800 mt-1">{ev.label}</div>
                  {ev.content && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ev.content}</p>}
                  {ev.url && (
                    <a href={ev.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> {ev.url.length > 60 ? ev.url.slice(0, 60) + "…" : ev.url}
                    </a>
                  )}
                  {ev.uploadedByName && (
                    <div className="text-[10px] text-slate-400 mt-1">{ev.uploadedByName} · {formatDate(ev.createdAt)}</div>
                  )}
                </div>
                <button
                  onClick={() => deleteMutation.mutate(ev.id)}
                  className="text-slate-400 hover:text-red-500 p-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VersionHistoryTab({ assessmentId }: { assessmentId: number }) {
  const { data: versions = [], isLoading } = useQuery<AssessmentVersion[]>({
    queryKey: ["assessments", assessmentId, "versions"],
    queryFn: () => api.assessments.versions(assessmentId),
  });
  if (isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-2">
      {versions.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No version history</div>
      ) : (
        versions.map((v) => (
          <div key={v.id} className="border border-slate-200 rounded-lg px-4 py-3 bg-white flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold shrink-0">
              {v.version}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800">Version {v.version}</div>
              {v.changeSummary && <p className="text-xs text-slate-500 mt-0.5">{v.changeSummary}</p>}
              <div className="text-[10px] text-slate-400 mt-1">
                {v.createdByName ?? "Unknown"} · {formatDateTime(v.createdAt)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function AssessmentDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const id = Number(params.id);

  const { data: assessment, isLoading } = useQuery<AssessmentDetail>({
    queryKey: ["assessments", id],
    queryFn: () => api.assessments.get(id),
    enabled: !isNaN(id),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.assessments.approve(id, { userId: 1, changeSummary: "Approved via UI" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments", id] });
      qc.invalidateQueries({ queryKey: ["assessments"] });
      toast({ title: "Assessment approved" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.assessments.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      navigate("/assessments");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!assessment) return <div className="py-20 text-center text-slate-400">Assessment not found</div>;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate("/assessments")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Assessments
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{assessment.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded border uppercase", getStatusColor(assessment.status))}>
              {getStatusLabel(assessment.status)}
            </span>
            {assessment.overallRating && (
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded border uppercase", getRiskRatingColor(assessment.overallRating))}>
                {getRiskRatingLabel(assessment.overallRating)}
              </span>
            )}
            <Badge variant="outline" className="text-[10px] font-mono">v{assessment.version}</Badge>
            {assessment.venueName && (
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                <button onClick={() => navigate(`/venues/${assessment.venueId}`)} className="hover:underline">
                  {assessment.venueName}{assessment.venueCity ? `, ${assessment.venueCity}` : ""}
                </button>
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {assessment.status === "draft" || assessment.status === "under_review" ? (
            <Button
              size="sm"
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => navigate(`/assessments/${id}/edit`)}>
            <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => { if (confirm("Delete this assessment?")) deleteMutation.mutate(); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Intel Summary */}
      {assessment.intelSummary && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Intelligence Summary</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{assessment.intelSummary}</p>
          </CardContent>
        </Card>
      )}
      {assessment.analystNotes && (
        <Card className="border-amber-100">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Analyst Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{assessment.analystNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="risk-matrix">
        <TabsList className="border-b border-slate-200 rounded-none bg-transparent p-0 gap-0 h-auto">
          {[
            { value: "risk-matrix", label: "Risk Matrix", icon: Shield },
            { value: "evidence", label: "Evidence", icon: FolderOpen },
            { value: "versions", label: "Version History", icon: History },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm text-slate-500 hover:text-slate-800"
            >
              <Icon className="w-4 h-4 mr-1.5" />{label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="risk-matrix" className="mt-4">
          <RiskMatrixTab assessmentId={id} />
        </TabsContent>
        <TabsContent value="evidence" className="mt-4">
          <EvidenceTab assessmentId={id} />
        </TabsContent>
        <TabsContent value="versions" className="mt-4">
          <VersionHistoryTab assessmentId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
