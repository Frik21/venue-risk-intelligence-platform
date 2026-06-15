import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Incident } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Plus, Search, Filter, CheckCircle2, ExternalLink } from "lucide-react";
import { getSeverityColor, formatDate, INCIDENT_TYPES } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

function NewIncidentDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    incidentType: "crime", severity: "medium" as "low"|"medium"|"high"|"critical",
    summary: "", sourceName: "", sourceUrl: "", incidentDate: new Date().toISOString().slice(0, 10),
  });
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.incidents.create({ ...form, incidentDate: form.incidentDate + "T00:00:00Z" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["incidents"] }); onClose(); },
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-bold">Log New Incident</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Type</label>
            <Select value={form.incidentType} onValueChange={v => set("incidentType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INCIDENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Severity</label>
            <Select value={form.severity} onValueChange={v => set("severity", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Date</label>
          <Input type="date" value={form.incidentDate} onChange={e => set("incidentDate", e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Summary *</label>
          <Input placeholder="Brief description of the incident..." value={form.summary} onChange={e => set("summary", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">Source Name</label>
            <Input placeholder="Reuters, Police Advisory..." value={form.sourceName} onChange={e => set("sourceName", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Source URL</label>
            <Input placeholder="https://..." value={form.sourceUrl} onChange={e => set("sourceUrl", e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.summary}>
            {mutation.isPending ? "Saving..." : "Log Incident"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function IncidentsList() {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const { data: incidents = [], isLoading } = useQuery<Incident[]>({
    queryKey: ["incidents"],
    queryFn: api.incidents.list,
  });

  const filtered = incidents.filter(inc => {
    const matchSearch = inc.summary.toLowerCase().includes(search.toLowerCase()) ||
      (inc.venueName?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchSeverity = severityFilter === "all" || inc.severity === severityFilter;
    return matchSearch && matchSeverity;
  });

  const typelabel = (t: string) => INCIDENT_TYPES.find(x => x.value === t)?.label ?? t;

  return (
    <div className="space-y-5">
      {showNew && <NewIncidentDialog onClose={() => setShowNew(false)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Incidents</h1>
          <p className="text-slate-500 text-sm mt-0.5">Security incident log and intelligence feed</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Log Incident
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search incidents..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No incidents found</h3>
            <p className="text-sm text-slate-400 mb-4">Log security incidents to build the intelligence picture</p>
            <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1.5" />Log Incident</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {filtered.map((inc) => (
              <div key={inc.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 mt-0.5", getSeverityColor(inc.severity))}>
                    {inc.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{inc.summary}</span>
                      {inc.verified && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] capitalize">{typelabel(inc.incidentType)}</Badge>
                      {inc.venueName && <span>@ {inc.venueName}</span>}
                      <span>{formatDate(inc.incidentDate)}</span>
                      {inc.distanceFromVenue && <span>{inc.distanceFromVenue}m from venue</span>}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {inc.sourceUrl && (
                      <a href={inc.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {inc.sourceName && <span className="text-xs text-slate-400 hidden sm:block">{inc.sourceName}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
