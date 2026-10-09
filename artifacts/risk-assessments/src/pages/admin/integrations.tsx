import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type IntegrationProviderInfo, type CompanyIntegration } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plug, KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/display-utils";

// Connect/rotate-key dialog for one provider - per direct product
// direction ("subscribers can insert other platforms API keys to
// connect to the management system... AlertMedia is just an example").
// The provider itself is never hardcoded here - every label/description/
// key-field-name comes from GET /integrations/providers
// (lib/integration-providers.ts's registry), so a second real provider
// needs zero frontend changes beyond that registry gaining an entry.
function ConnectDialog({
  provider,
  existing,
  onClose,
}: {
  provider: IntegrationProviderInfo;
  existing: CompanyIntegration | null;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => (existing ? api.integrations.update(existing.id, { apiKey }) : api.integrations.connect({ provider: provider.id, apiKey })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast({ title: existing ? "API key rotated" : `${provider.label} connected` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Plug className="w-4 h-4 text-slate-400" /> {existing ? `Rotate ${provider.label} Key` : `Connect ${provider.label}`}
        </h2>
        <p className="text-sm text-slate-500">{provider.description}</p>
        <div>
          <Label>{provider.apiKeyLabel} *</Label>
          <Input type="password" placeholder="Paste your API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoFocus />
          <p className="text-xs text-slate-400 mt-1">Stored encrypted - once saved, this key is never shown again (only its last 4 characters).</p>
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !apiKey.trim()}>
            {mutation.isPending ? "Saving..." : existing ? "Save New Key" : "Connect"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider, existing }: { provider: IntegrationProviderInfo; existing: CompanyIntegration | null }) {
  const [showDialog, setShowDialog] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.integrations.update(existing!.id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.integrations.disconnect(existing!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast({ title: `${provider.label} disconnected` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      {showDialog && <ConnectDialog provider={provider} existing={existing} onClose={() => setShowDialog(false)} />}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">{provider.label}</h2>
                {existing ? (
                  <Badge variant="outline" className={existing.enabled ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-slate-500 bg-slate-50 border-slate-200"}>
                    {existing.enabled ? "Connected" : "Paused"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-400 bg-slate-50 border-slate-200">Not connected</Badge>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">{provider.description}</p>
            </div>
            {existing && <Switch checked={existing.enabled} onCheckedChange={(v) => toggleMutation.mutate(v)} disabled={toggleMutation.isPending} />}
          </div>

          {existing ? (
            <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" /> Key ending in <span className="font-mono">····{existing.apiKeyLastFour}</span>
                {existing.connectedByName && <span>· connected by {existing.connectedByName}</span>}
              </div>
              {existing.lastUsedAt && (
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Last used {formatDateTime(existing.lastUsedAt)}
                </div>
              )}
              {existing.lastErrorMessage && (
                <div className="flex items-center gap-1.5 text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Last error ({existing.lastErrorAt ? formatDateTime(existing.lastErrorAt) : ""}): {existing.lastErrorMessage}
                </div>
              )}
              <div className="flex gap-3 pt-1.5">
                <button type="button" className="text-blue-600 hover:underline" onClick={() => setShowDialog(true)}>Rotate key</button>
                <button type="button" className="text-red-600 hover:underline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowDialog(true)}>
              <Plug className="w-3.5 h-3.5 mr-1.5" /> Connect
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// Integrations - per direct product direction: a subscriber connects a
// third-party platform (AlertMedia is the first real example provider)
// by pasting in its own API key, which then becomes an extra channel
// lib/notifications.ts's notifyManagement() dispatches panic alerts/
// overdue invoices/expiring certs through, alongside the existing
// email/SMS/push fan-out. The provider catalog itself
// (lib/integration-providers.ts) is a small backend registry, not
// hardcoded here - adding a second real provider is one more registry
// entry, no frontend change needed; this page always renders from
// GET /integrations/providers.
export default function IntegrationsPage() {
  const { data: providers = [], isLoading: providersLoading } = useQuery<IntegrationProviderInfo[]>({
    queryKey: ["integration-providers"],
    queryFn: () => api.integrations.providers(),
  });
  const { data, isLoading: integrationsLoading } = useQuery({ queryKey: ["integrations"], queryFn: () => api.integrations.list() });

  const byProvider = new Map((data?.integrations ?? []).map((i) => [i.provider, i]));
  const loading = providersLoading || integrationsLoading;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Plug className="w-5 h-5 text-slate-400" /> Integrations
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Connect other platforms you already use - a connected integration becomes an extra channel for VenueGuard's own alerts (panic signals, overdue invoices, expiring certifications).
        </p>
      </div>

      {!loading && data && !data.encryptionConfigured && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Integrations aren't connected yet in this environment - an administrator needs to configure the server before a key can be saved.
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} existing={byProvider.get(p.id) ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
