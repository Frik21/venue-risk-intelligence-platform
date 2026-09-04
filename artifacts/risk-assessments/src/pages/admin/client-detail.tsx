import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { api, type Client, type ClientActivity, type Principal, type Task, type Quote, type User } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2, Mail, Phone, MapPin, Briefcase, ListChecks, FileText, MessageSquare, ShieldCheck, Plus, X } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ClientDialog, CLIENT_STATUS_CONFIG } from "./clients";

const QUOTE_STATUS_CONFIG: Record<Quote["status"], { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-slate-600 bg-slate-100 border-slate-200" },
  sent: { label: "Sent", color: "text-amber-700 bg-amber-50 border-amber-200" },
  approved: { label: "Approved", color: "text-green-700 bg-green-50 border-green-200" },
  rejected: { label: "Rejected", color: "text-red-700 bg-red-50 border-red-200" },
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function ProfileRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-slate-700">{value || "—"}</div>
      </div>
    </div>
  );
}

// Activity log - a running dated history of calls/emails/meetings
// against this client, replacing the old freeform Notes field per
// direct product direction ("CRM style"). Append-only; the "logged
// by" author defaults to the first Manager/Admin found, same "no real
// login" convention used elsewhere in the app (e.g. currentManagerId
// on the Tasks list).
function ActivityLog({ clientId, currentUserId }: { clientId: number; currentUserId: number | undefined }) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: activities = [], isLoading } = useQuery<ClientActivity[]>({
    queryKey: ["client-activities", clientId],
    queryFn: () => api.clientActivities.list(clientId),
  });

  const addMutation = useMutation({
    mutationFn: () => api.clientActivities.create(clientId, { note: note.trim(), createdBy: currentUserId ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-activities", clientId] });
      setNote("");
      toast({ title: "Logged" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.clientActivities.delete(clientId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-activities", clientId] });
      toast({ title: "Entry removed" });
    },
  });

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-slate-400" /> Activity Log
        </h2>
        <div className="flex items-start gap-2 mb-4">
          <Textarea
            placeholder="Log a call, meeting, or email..."
            className="text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || !note.trim()}
          >
            Log
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-20" />
        ) : activities.length === 0 ? (
          <p className="text-sm text-slate-400">No activity logged yet.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-3 last:pb-0 group">
                <div className="min-w-0">
                  <p className="text-slate-700 whitespace-pre-wrap">{a.note}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {a.createdByName ?? "Unknown"} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(a.id)}
                  className="text-slate-300 hover:text-red-600 shrink-0 opacity-0 group-hover:opacity-100"
                  aria-label="Delete entry"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PRINCIPAL_FIELDS: { key: keyof Pick<Principal, "medicalInfo" | "knownThreats" | "routineNotes" | "familyNotes">; label: string; placeholder: string }[] = [
  { key: "medicalInfo", label: "Medical Info", placeholder: "Conditions, allergies, medications, blood type" },
  { key: "knownThreats", label: "Known Threats", placeholder: "Prior incidents, specific concerns, restraining orders" },
  { key: "routineNotes", label: "Routine", placeholder: "Regular schedule, habits, places frequently visited" },
  { key: "familyNotes", label: "Family", placeholder: "Spouse, children, dependents, emergency contacts" },
];

type PrincipalFormState = { name: string; relationship: string; medicalInfo: string; knownThreats: string; routineNotes: string; familyNotes: string };
const EMPTY_PRINCIPAL_FORM: PrincipalFormState = { name: "", relationship: "", medicalInfo: "", knownThreats: "", routineNotes: "", familyNotes: "" };

function principalToForm(p: Principal): PrincipalFormState {
  return {
    name: p.name,
    relationship: p.relationship,
    medicalInfo: p.medicalInfo ?? "",
    knownThreats: p.knownThreats ?? "",
    routineNotes: p.routineNotes ?? "",
    familyNotes: p.familyNotes ?? "",
  };
}

function PrincipalForm({ form, onChange }: { form: PrincipalFormState; onChange: (form: PrincipalFormState) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Name *</Label>
          <Input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Full name" />
        </div>
        <div>
          <Label>Relationship</Label>
          <Input value={form.relationship} onChange={(e) => onChange({ ...form, relationship: e.target.value })} placeholder="Principal, Spouse, Executive..." />
        </div>
      </div>
      {PRINCIPAL_FIELDS.map(({ key, label, placeholder }) => (
        <div key={key}>
          <Label>{label}</Label>
          <Textarea rows={2} value={form[key]} onChange={(e) => onChange({ ...form, [key]: e.target.value })} placeholder={placeholder} />
        </div>
      ))}
    </div>
  );
}

// Protection profiles for the individually-protected people under this
// client - Following Roadmap, Tier 2 item 8. A roster (not one profile
// per client, see principalsTable's own schema comment), each with
// their own medical/threats/routine/family sections. Surfaced
// automatically to the assigned CPO on their own task (api.tasks.
// principals) - this is the Command Desk side that maintains it.
function PrincipalsPanel({ clientId }: { clientId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<PrincipalFormState>(EMPTY_PRINCIPAL_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PrincipalFormState>(EMPTY_PRINCIPAL_FORM);

  const { data: principals = [], isLoading } = useQuery<Principal[]>({
    queryKey: ["principals", clientId],
    queryFn: () => api.principals.list(clientId),
  });

  const createMutation = useMutation({
    mutationFn: () => api.principals.create(clientId, addForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["principals", clientId] });
      setAdding(false);
      setAddForm(EMPTY_PRINCIPAL_FORM);
      toast({ title: "Principal added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (id: number) => api.principals.update(clientId, id, editForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["principals", clientId] });
      setEditingId(null);
      toast({ title: "Principal updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.principals.delete(clientId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["principals", clientId] });
      toast({ title: "Principal removed" });
    },
  });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-400" /> Protection Profiles
          </h2>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Principal
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Shown automatically to any CPO assigned to a task for this client.
        </p>

        {adding && (
          <div className="border border-slate-200 rounded-lg p-4 mb-4 space-y-3">
            <PrincipalForm form={addForm} onChange={setAddForm} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !addForm.name.trim()}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setAddForm(EMPTY_PRINCIPAL_FORM); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-20" />
        ) : principals.length === 0 && !adding ? (
          <p className="text-sm text-slate-400">No principals recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {principals.map((p) =>
              editingId === p.id ? (
                <div key={p.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <PrincipalForm form={editForm} onChange={setEditForm} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateMutation.mutate(p.id)} disabled={updateMutation.isPending || !editForm.name.trim()}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={p.id} className="border border-slate-200 rounded-lg p-4 space-y-2 group">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-900">{p.name}</span>
                      {p.relationship && <span className="text-xs text-slate-400 ml-2">{p.relationship}</span>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => { setEditingId(p.id); setEditForm(principalToForm(p)); }}
                        className="text-slate-400 hover:text-blue-600 p-1"
                        aria-label="Edit principal"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(p.id)}
                        className="text-slate-400 hover:text-red-600 p-1"
                        aria-label="Remove principal"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {PRINCIPAL_FIELDS.map(({ key, label }) =>
                    p[key] ? (
                      <p key={key} className="text-sm text-slate-600"><span className="font-medium text-slate-500">{label}: </span>{p[key]}</p>
                    ) : null,
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [showEdit, setShowEdit] = useState(false);

  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });
  const { data: quotes = [] } = useQuery<Quote[]>({ queryKey: ["quotes"], queryFn: api.quotes.list });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["users"], queryFn: api.users.list });
  const currentUserId = users.find((u) => u.role === "manager" || u.role === "admin")?.id;

  const client = clients.find((c) => c.id === id);
  const clientTasks = tasks.filter((t) => t.clientId === id && !t.archived);
  const clientQuotes = quotes.filter((q) => q.clientId === id);

  const quoted: Record<string, number> = {};
  const approved: Record<string, number> = {};
  for (const t of clientTasks) {
    if (t.estimatedCost == null) continue;
    quoted[t.estimatedCostCurrency] = (quoted[t.estimatedCostCurrency] ?? 0) + t.estimatedCost;
    if (t.quotationStatus === "approved") {
      approved[t.estimatedCostCurrency] = (approved[t.estimatedCostCurrency] ?? 0) + t.estimatedCost;
    }
  }

  if (clientsLoading) {
    return <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  }
  if (!client) {
    return (
      <div className="text-center py-20 text-slate-400">
        Client not found. <Link href="/admin/clients" className="text-blue-600 hover:underline">Back to Clients</Link>
      </div>
    );
  }

  const sc = CLIENT_STATUS_CONFIG[client.status];

  return (
    <div className="space-y-5">
      {showEdit && <ClientDialog client={client} onClose={() => setShowEdit(false)} />}

      <div>
        <Link href="/admin/clients" className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Clients
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border uppercase", sc.color)}>{sc.label}</span>
          </div>
          <Button variant="outline" onClick={() => setShowEdit(true)}>
            <Pencil className="w-4 h-4 mr-1.5" /> Edit
          </Button>
        </div>
        {client.industry && <p className="text-slate-500 text-sm mt-0.5">{client.industry}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1">
          <CardContent className="p-5 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-slate-400" /> Profile
            </h2>
            <ProfileRow icon={Briefcase} label="Primary Contact" value={[client.primaryContactName, client.primaryContactRole].filter(Boolean).join(" · ")} />
            <ProfileRow icon={Mail} label="Email" value={client.email} />
            <ProfileRow icon={Phone} label="Phone" value={client.phone} />
            <ProfileRow icon={MapPin} label="Address" value={client.address} />
            <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-400">Day Rate</div>
                <div className="font-mono tabular-nums text-slate-900">{client.dayRate != null ? client.dayRate.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Night Rate</div>
                <div className="font-mono tabular-nums text-slate-900">{client.nightRate != null ? client.nightRate.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-slate-200 rounded-lg bg-white px-4 py-3">
              <div className="text-xs text-slate-500 mb-1">Tasks</div>
              <div className="text-lg font-semibold text-slate-900">{clientTasks.length}</div>
            </div>
            <div className="border border-slate-200 rounded-lg bg-white px-4 py-3">
              <div className="text-xs text-slate-500 mb-1">Total Quoted</div>
              {Object.keys(quoted).length === 0 ? <div className="text-slate-300">—</div> : Object.entries(quoted).map(([cur, amt]) => (
                <div key={cur} className="font-mono tabular-nums text-slate-900">{formatMoney(amt, cur)}</div>
              ))}
            </div>
            <div className="border border-slate-200 rounded-lg bg-white px-4 py-3">
              <div className="text-xs text-slate-500 mb-1">Approved</div>
              {Object.keys(approved).length === 0 ? <div className="text-slate-300">—</div> : Object.entries(approved).map(([cur, amt]) => (
                <div key={cur} className="font-mono tabular-nums text-green-700">{formatMoney(amt, cur)}</div>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
                <ListChecks className="w-4 h-4 text-slate-400" /> Tasks
              </h2>
              {clientTasks.length === 0 ? (
                <p className="text-sm text-slate-400">No tasks linked yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {clientTasks.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 pr-2">
                          <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded mr-2">{t.taskNumber}</span>
                          <Link href="/tasks" className="text-slate-900 hover:text-blue-600 hover:underline">{t.title || "Untitled task"}</Link>
                        </td>
                        <td className="py-2 text-slate-500 text-right">{t.dueDate ? formatDate(t.dueDate) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-slate-400" /> Quotes
              </h2>
              {clientQuotes.length === 0 ? (
                <p className="text-sm text-slate-400">No quotes linked yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {clientQuotes.map((q) => (
                      <tr key={q.id}>
                        <td className="py-2 pr-2">
                          <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded mr-2">{q.quoteNumber}</span>
                          <Link href="/admin/costs" className="text-slate-900 hover:text-blue-600 hover:underline">{q.title || "Untitled quote"}</Link>
                        </td>
                        <td className="py-2 text-right">
                          <span className={cn("text-xs font-medium border rounded-full px-2 py-0.5", QUOTE_STATUS_CONFIG[q.status].color)}>
                            {QUOTE_STATUS_CONFIG[q.status].label}
                          </span>
                        </td>
                        <td className="py-2 pl-3 text-right font-mono tabular-nums text-slate-900">{formatMoney(q.totalQuoteValue, q.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <PrincipalsPanel clientId={client.id} />

          <ActivityLog clientId={client.id} currentUserId={currentUserId} />
        </div>
      </div>
    </div>
  );
}
