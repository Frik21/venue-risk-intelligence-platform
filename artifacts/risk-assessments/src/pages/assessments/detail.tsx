import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { api, type AssessmentDetail, type RiskMatrix, type Evidence, type AssessmentVersion, type Route, type RouteFinding, type RouteType, type RouteCreationMethod } from "@/lib/api";
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
  ArrowLeft, Building2, Shield, FolderOpen, History, CheckCircle2, Edit2, Trash2, Plus, ExternalLink,
  Navigation, BarChart2, RefreshCw, Route as RouteIcon,
} from "lucide-react";
import {
  getStatusColor, getStatusLabel, getRiskRatingColor, getRiskRatingLabel,
  formatDate, formatDateTime, RISK_RATINGS, EVIDENCE_TYPES,
  getRouteTypeColor, getRouteTypeLabel, formatDistance, formatTravelTime,
  getPriorityColor, ROUTE_TYPES, ROUTE_CREATION_METHODS, ROUTE_CONSTRAINTS,
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

// ── Routes Tab ────────────────────────────────────────────────────────────────

interface RouteFormState {
  routeName: string; routeType: RouteType; creationMethod: RouteCreationMethod;
  startLabel: string; endLabel: string; analystNotes: string;
  constraints: string[]; streets: string;
}
const defaultRouteForm = (): RouteFormState => ({
  routeName: "", routeType: "primary_extraction", creationMethod: "endpoint_marker",
  startLabel: "Start", endLabel: "End", analystNotes: "", constraints: [], streets: "",
});

function RoutesTab({ assessmentId, venueId }: { assessmentId: number; venueId?: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [form, setForm] = useState<RouteFormState>(defaultRouteForm());
  const [showFindings, setShowFindings] = useState(false);

  const { data: routes = [], isLoading } = useQuery<Route[]>({
    queryKey: ["routes", "assessment", assessmentId],
    queryFn: () => api.routes.list({ assessmentId }),
  });

  const { data: findings = [], isLoading: fLoading } = useQuery<RouteFinding[]>({
    queryKey: ["routes", selectedRoute?.id, "findings"],
    queryFn: () => api.routes.findings(selectedRoute!.id),
    enabled: !!selectedRoute && showFindings,
  });

  const createMutation = useMutation({
    mutationFn: () => api.routes.create({
      routeName: form.routeName,
      routeType: form.routeType,
      creationMethod: form.creationMethod,
      startLabel: form.startLabel || undefined,
      endLabel: form.endLabel || undefined,
      analystNotes: form.analystNotes || undefined,
      constraints: form.constraints.length ? form.constraints : undefined,
      waypointsJson: form.creationMethod === "street_builder" && form.streets
        ? form.streets.split("\n").filter(Boolean).map((s) => ({ label: s.trim(), lat: 0, lng: 0 }))
        : undefined,
      assessmentId,
      venueId,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["routes", "assessment", assessmentId] });
      toast({ title: `Route "${r.routeName}" created`, description: r.findings?.length ? `${r.findings.length} corridor findings detected` : "No findings in corridor" });
      setForm(defaultRouteForm());
      setShowCreate(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) => api.routes.verify(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["routes", "assessment", assessmentId] });
      setSelectedRoute(r);
      toast({ title: "Route verified", description: "Route marked as analyst-verified" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.routes.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routes", "assessment", assessmentId] });
      setSelectedRoute(null);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (id: number) => api.routes.analyze(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routes", selectedRoute?.id, "findings"] }),
  });

  const set = (k: keyof RouteFormState, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleConstraint = (c: string) =>
    setForm(f => ({ ...f, constraints: f.constraints.includes(c) ? f.constraints.filter(x => x !== c) : [...f.constraints, c] }));

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Operational Routes ({routes.length})</h3>
          <p className="text-xs text-slate-500 mt-0.5">Extraction, access, and evacuation routes linked to this assessment</p>
        </div>
        <Button size="sm" onClick={() => { setShowCreate(!showCreate); setSelectedRoute(null); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Route
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-4 space-y-3">
            <div className="font-semibold text-sm text-slate-800 mb-1">Create New Route</div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Route Name *</Label>
                <Input className="h-8 text-xs mt-1" placeholder="e.g. Primary Extraction Route A" value={form.routeName} onChange={e => set("routeName", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Route Type *</Label>
                <Select value={form.routeType} onValueChange={v => set("routeType", v as RouteType)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getRouteTypeColor(form.routeType) }} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTE_TYPES.map(rt => (
                      <SelectItem key={rt.value} value={rt.value}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: rt.color }} />
                          {rt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Creation Method</Label>
              <Select value={form.creationMethod} onValueChange={v => set("creationMethod", v as RouteCreationMethod)}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROUTE_CREATION_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.creationMethod === "street_builder" ? (
              <div>
                <Label className="text-xs">Street Sequence (one per line)</Label>
                <Textarea className="text-xs mt-1 resize-none" rows={3}
                  placeholder={"Main St\nBroadway\nPark Ave\nHotel driveway"}
                  value={form.streets} onChange={e => set("streets", e.target.value)} />
                <p className="text-[10px] text-slate-400 mt-0.5">Enter road names in order from start to end</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Start Label</Label>
                  <Input className="h-8 text-xs mt-1" placeholder="Start point" value={form.startLabel} onChange={e => set("startLabel", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">End Label</Label>
                  <Input className="h-8 text-xs mt-1" placeholder="End point" value={form.endLabel} onChange={e => set("endLabel", e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Route Constraints</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {ROUTE_CONSTRAINTS.map(c => (
                  <button key={c} onClick={() => toggleConstraint(c)}
                    className={cn("text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                      form.constraints.includes(c) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-400")}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Analyst Notes</Label>
              <Textarea className="text-xs mt-1 resize-none" rows={2}
                placeholder="Route-specific observations, warnings, tactical notes..."
                value={form.analystNotes} onChange={e => set("analystNotes", e.target.value)} />
            </div>

            <div className="flex gap-2 pt-1 border-t border-blue-200">
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.routeName}>
                {createMutation.isPending ? "Creating..." : "Create Route"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setForm(defaultRouteForm()); }}>Cancel</Button>
            </div>
            <p className="text-[10px] text-slate-400">Corridor intelligence will be auto-generated on save. Route approval must be manual.</p>
          </CardContent>
        </Card>
      )}

      {/* Routes list */}
      {routes.length === 0 ? (
        <div className="py-10 text-center">
          <RouteIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500 font-medium mb-1">No routes yet</p>
          <p className="text-xs text-slate-400">Add extraction, evacuation, and access routes for this assessment</p>
        </div>
      ) : (
        <div className="space-y-2">
          {routes.map(r => (
            <div key={r.id} className={cn("border rounded-lg bg-white transition-all", selectedRoute?.id === r.id ? "border-blue-300 shadow-sm" : "border-slate-200")}>
              <button className="w-full text-left px-4 py-3" onClick={() => { setSelectedRoute(selectedRoute?.id === r.id ? null : r); setShowFindings(false); }}>
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ background: getRouteTypeColor(r.routeType) }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{r.routeName}</span>
                      {r.verified && (
                        <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 border">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Verified
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] capitalize">{r.creationMethod.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{getRouteTypeLabel(r.routeType)}</div>
                    {(r.estimatedDistance || r.estimatedTravelTime) && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {formatDistance(r.estimatedDistance)} {r.estimatedTravelTime ? `· ${formatTravelTime(r.estimatedTravelTime)}` : ""}
                      </div>
                    )}
                    {r.constraints && Array.isArray(r.constraints) && r.constraints.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(r.constraints as string[]).slice(0, 3).map((c, i) => (
                          <Badge key={i} variant="outline" className="text-[9px] px-1 py-0">{c}</Badge>
                        ))}
                        {(r.constraints as string[]).length > 3 && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">+{(r.constraints as string[]).length - 3} more</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {selectedRoute?.id === r.id && (
                <div className="px-4 pb-3 border-t border-slate-100 mt-0.5">
                  {/* Notes */}
                  {r.analystNotes && (
                    <div className="mb-3 mt-2">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Analyst Notes</div>
                      <p className="text-xs text-slate-600 bg-amber-50 border border-amber-100 p-2 rounded">{r.analystNotes}</p>
                    </div>
                  )}

                  {/* Start / End */}
                  {(r.startLabel || r.endLabel) && (
                    <div className="mb-3 mt-2 grid grid-cols-2 gap-2">
                      {r.startLabel && (
                        <div className="bg-slate-50 rounded p-2">
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Start</div>
                          <div className="text-xs text-slate-700 font-medium">{r.startLabel}</div>
                          {r.startLat && <div className="text-[10px] text-slate-400">{r.startLat.toFixed(4)}, {r.startLng?.toFixed(4)}</div>}
                        </div>
                      )}
                      {r.endLabel && (
                        <div className="bg-slate-50 rounded p-2">
                          <div className="text-[9px] font-bold text-slate-400 uppercase">End</div>
                          <div className="text-xs text-slate-700 font-medium">{r.endLabel}</div>
                          {r.endLat && <div className="text-[10px] text-slate-400">{r.endLat.toFixed(4)}, {r.endLng?.toFixed(4)}</div>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Findings */}
                  {showFindings && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Corridor Intelligence</div>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                          onClick={() => analyzeMutation.mutate(r.id)} disabled={analyzeMutation.isPending}>
                          <RefreshCw className={cn("w-2.5 h-2.5 mr-1", analyzeMutation.isPending && "animate-spin")} />
                          Re-run
                        </Button>
                      </div>
                      {fLoading ? <Skeleton className="h-10" /> : findings.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-2">No findings</div>
                      ) : (
                        <div className="space-y-1.5">
                          {findings.map(f => (
                            <div key={f.id} className="border border-slate-200 rounded p-2 bg-white">
                              <div className="flex items-start gap-2">
                                <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded border uppercase shrink-0", getPriorityColor(f.severity))}>{f.severity}</span>
                                <div className="min-w-0">
                                  <p className="text-[11px] text-slate-700 leading-snug">{f.summary}</p>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                    {f.distanceFromRoute && <span>{f.distanceFromRoute}m from route</span>}
                                    {f.sourceName && <span>{f.sourceName}</span>}
                                    {f.verified && <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => setShowFindings(f => !f)}>
                      <BarChart2 className="w-3 h-3 mr-1" />
                      {showFindings ? "Hide" : "View"} Corridor Intel
                    </Button>
                    {!r.verified && (
                      <Button size="sm" className="text-xs h-7 bg-green-600 hover:bg-green-700"
                        onClick={() => verifyMutation.mutate(r.id)} disabled={verifyMutation.isPending}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {verifyMutation.isPending ? "Verifying..." : "Verify Route"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500 hover:text-red-700"
                      onClick={() => { if (confirm("Delete route?")) deleteMutation.mutate(r.id); }}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
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
            { value: "routes", label: "Routes", icon: RouteIcon },
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
        <TabsContent value="routes" className="mt-4">
          <RoutesTab assessmentId={id} venueId={assessment.venueId ?? undefined} />
        </TabsContent>
        <TabsContent value="versions" className="mt-4">
          <VersionHistoryTab assessmentId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
