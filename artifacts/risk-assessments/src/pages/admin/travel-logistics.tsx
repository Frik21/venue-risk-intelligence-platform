import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type TravelLogisticsEntry, type TravelLogisticsEntryType } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plane, Plus, Pencil, Trash2, Search, FileText, Building2, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/display-utils";

export const ENTRY_TYPE_CONFIG: Record<TravelLogisticsEntryType, { label: string; icon: typeof FileText }> = {
  visa_requirement: { label: "Visa Requirement", icon: FileText },
  embassy_contact: { label: "Embassy Contact", icon: Building2 },
  fixer_contact: { label: "Local Fixer Contact", icon: UserCog },
};

// Add/edit form for one entry - Manager-maintained reference data, not
// live-fetched (see schema/travel-logistics.ts for why). destinationCountry
// is freeform text, matching venues.country's own convention - no shared
// canonical country list exists for either.
function TravelLogisticsDialog({
  entry,
  defaultCountry,
  onClose,
}: {
  entry: TravelLogisticsEntry | null;
  defaultCountry?: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    destinationCountry: entry?.destinationCountry ?? defaultCountry ?? "",
    entryType: (entry?.entryType ?? "visa_requirement") as TravelLogisticsEntryType,
    title: entry?.title ?? "",
    details: entry?.details ?? "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => (entry ? api.travelLogistics.update(entry.id, form) : api.travelLogistics.create(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-logistics"] });
      toast({ title: entry ? "Entry updated" : "Entry added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.destinationCountry.trim() && form.title.trim() && form.details.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">{entry ? "Edit Entry" : "Add Travel Logistics Entry"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Destination Country *</Label>
            <Input placeholder="e.g. Nigeria" value={form.destinationCountry} onChange={(e) => set("destinationCountry", e.target.value)} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.entryType} onValueChange={(v) => set("entryType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ENTRY_TYPE_CONFIG) as TravelLogisticsEntryType[]).map((t) => (
                  <SelectItem key={t} value={t}>{ENTRY_TYPE_CONFIG[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Title *</Label>
          <Input
            placeholder={
              form.entryType === "visa_requirement" ? "e.g. South African Nationals"
              : form.entryType === "embassy_contact" ? "e.g. South African High Commission, Lagos"
              : "e.g. Ahmed Bello - local fixer"
            }
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div>
          <Label>Details *</Label>
          <Textarea
            placeholder={
              form.entryType === "visa_requirement" ? "Visa on arrival / apply in advance / requirements, processing time, fees..."
              : "Address, phone, email, hours, and any notes CPOs should know before contacting them..."
            }
            rows={5}
            value={form.details}
            onChange={(e) => set("details", e.target.value)}
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Saving..." : entry ? "Save Changes" : "Add Entry"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Travel/visa logistics reference database - Following Roadmap Tier
// 3, item 16. Manager-maintained (confirmed via AskUserQuestion:
// there's no reliable free public API for "visa requirements by
// nationality + destination", and a wrong answer here can genuinely
// get a CPO denied entry) - a small CRM-style reference table a
// Manager keeps current, grouped by destination country. Surfaces
// automatically on a task's own row in Operators Note whenever an
// entry exists for that task's venue country (pages/dashboard.tsx) -
// no dedicated "surfaced to the Brief" hook exists in this app today,
// per that same scoping pass.
export default function TravelLogisticsPage() {
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TravelLogisticsEntry | null>(null);
  const [addingForCountry, setAddingForCountry] = useState<string | undefined>(undefined);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useQuery<TravelLogisticsEntry[]>({ queryKey: ["travel-logistics"], queryFn: () => api.travelLogistics.list() });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.travelLogistics.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-logistics"] });
      toast({ title: "Entry removed" });
    },
  });

  const filtered = search.trim()
    ? entries.filter((e) => e.destinationCountry.toLowerCase().includes(search.trim().toLowerCase()))
    : entries;

  const byCountry = new Map<string, TravelLogisticsEntry[]>();
  for (const e of filtered) {
    const key = e.destinationCountry;
    if (!byCountry.has(key)) byCountry.set(key, []);
    byCountry.get(key)!.push(e);
  }
  const countries = [...byCountry.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      {showDialog && <TravelLogisticsDialog entry={null} defaultCountry={addingForCountry} onClose={() => { setShowDialog(false); setAddingForCountry(undefined); }} />}
      {editingEntry && <TravelLogisticsDialog entry={editingEntry} onClose={() => setEditingEntry(null)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Plane className="w-5 h-5 text-slate-400" /> Travel Logistics
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Visa requirements, embassy contacts, and local fixer contacts by destination - reference data for internationally-deployed CPOs.</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Entry
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search by country..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : countries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-400 text-sm">
            {search.trim() ? "No entries for that country." : "No travel logistics entries yet - add the first one above."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {countries.map((country) => (
            <Card key={country}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-900">{country}</h2>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    onClick={() => { setAddingForCountry(country); setShowDialog(true); }}
                  >
                    <Plus className="w-3 h-3" /> Add entry for {country}
                  </button>
                </div>
                <div className="space-y-2">
                  {byCountry.get(country)!.map((entry) => {
                    const config = ENTRY_TYPE_CONFIG[entry.entryType];
                    const Icon = config.icon;
                    return (
                      <div key={entry.id} className="flex items-start gap-3 text-sm border border-slate-200 rounded-md p-3">
                        <Icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{config.label}</span>
                            <span className="font-medium text-slate-900">{entry.title}</span>
                          </div>
                          <p className="text-slate-600 mt-1 whitespace-pre-wrap">{entry.details}</p>
                          <p className="text-xs text-slate-400 mt-1.5">Added by {entry.createdByName ?? "Unknown"} · {formatDate(entry.updatedAt)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingEntry(entry)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => deleteMutation.mutate(entry.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
