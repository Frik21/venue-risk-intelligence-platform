import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Client } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Briefcase, Plus, Phone, MoreVertical, Pencil, Trash2, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function ClientDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: client?.name ?? "",
    contact: client?.contact ?? "",
    dayRate: client?.dayRate != null ? String(client.dayRate) : "",
    nightRate: client?.nightRate != null ? String(client.nightRate) : "",
    notes: client?.notes ?? "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name,
        contact: form.contact,
        dayRate: form.dayRate.trim() === "" ? null : Number(form.dayRate),
        nightRate: form.nightRate.trim() === "" ? null : Number(form.nightRate),
        notes: form.notes,
      };
      return client ? api.clients.update(client.id, data) : api.clients.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: client ? "Client updated" : "Client added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canSubmit = form.name.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold">{client ? "Edit Client" : "Add Client"}</h2>
        <div>
          <Label>Client Name *</Label>
          <Input placeholder="e.g. Acme Events" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label>Contact</Label>
          <Input placeholder="Phone / email" value={form.contact} onChange={(e) => set("contact", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Day Rate</Label>
            <Input type="number" min={0} step="0.01" value={form.dayRate} onChange={(e) => set("dayRate", e.target.value)} />
          </div>
          <div>
            <Label>Night Rate</Label>
            <Input type="number" min={0} step="0.01" value={form.nightRate} onChange={(e) => set("nightRate", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Saving..." : client ? "Save Changes" : "Add Client"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Clients - the organizations/people requesting CPO services, kept
// separate from the freeform clientName/clientContact still typed on
// each task (see clientId in lib/db/src/schema/tasks.ts), since quotes
// and daily rates differ from client to client, per direct product
// direction. A task can still be created for a one-off client with no
// record here at all - the picker on the task form is optional.
export default function ClientsPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: clients = [], isLoading } = useQuery<Client[]>({ queryKey: ["clients"], queryFn: api.clients.list });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.clients.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Client removed" });
    },
  });

  return (
    <div className="space-y-5">
      {showDialog && <ClientDialog client={null} onClose={() => setShowDialog(false)} />}
      {editingClient && <ClientDialog client={editingClient} onClose={() => setEditingClient(null)} />}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm mt-0.5">Client organizations, contacts, and day/night rates - link a task to one from the request form</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Client
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No clients yet</h3>
            <p className="text-sm text-slate-400 mb-4">Add your first client to start linking tasks and rates to them</p>
            <Button onClick={() => setShowDialog(true)}><Plus className="w-4 h-4 mr-1.5" />Add Client</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <Card key={client.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Briefcase className="w-5 h-5 text-blue-600" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingClient(client)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteMutation.mutate(client.id)} className="text-red-600">
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="font-semibold text-slate-900 text-sm mb-1">{client.name}</h3>
                {client.contact && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span className="truncate">{client.contact}</span>
                  </div>
                )}
                {(client.dayRate != null || client.nightRate != null) && (
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <DollarSign className="w-3 h-3 shrink-0" />
                    {client.dayRate != null && <span>Day {client.dayRate.toLocaleString()}</span>}
                    {client.dayRate != null && client.nightRate != null && <span>·</span>}
                    {client.nightRate != null && <span>Night {client.nightRate.toLocaleString()}</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
