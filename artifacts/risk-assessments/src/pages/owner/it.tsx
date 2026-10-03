import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { api, type SystemStatus, type SupportTicket, type TicketStatus, type TicketPriority, type StatusIncident } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ArrowLeft, Compass, Database, Clock, Server, Globe, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

const INCIDENT_STATUS_LABELS: Record<StatusIncident["status"], string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};
const INCIDENT_STATUS_COLORS: Record<StatusIncident["status"], string> = {
  investigating: "text-red-700 bg-red-50 border-red-200",
  identified: "text-amber-700 bg-amber-50 border-amber-200",
  monitoring: "text-blue-700 bg-blue-50 border-blue-200",
  resolved: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

// Owner-side posting for the public status page (pages/status.tsx) -
// Platform Maturity Roadmap, Tier 5, item 11. A flat post log, not a
// single incident with a nested timeline - "post an update" is the one
// action, same complexity budget as this page's own existing
// support-ticket handling.
function StatusIncidentSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<StatusIncident["status"]>("investigating");

  const { data, isLoading } = useQuery({ queryKey: ["status-incidents"], queryFn: api.status.get });

  const postMutation = useMutation({
    mutationFn: () => api.status.create({ title, message, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["status-incidents"] });
      setTitle("");
      setMessage("");
      setStatus("investigating");
      toast({ title: "Posted to the public status page" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusIncident["status"] }) => api.status.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["status-incidents"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.status.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["status-incidents"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Public Status Page</h2>
        <a href="/status" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View public page →</a>
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          <Input placeholder={'Title (e.g. "Investigating slow page loads")'} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="What's happening, and what subscribers should expect" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as StatusIncident["status"])}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(INCIDENT_STATUS_LABELS) as StatusIncident["status"][]).map((s) => (
                  <SelectItem key={s} value={s}>{INCIDENT_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => postMutation.mutate()} disabled={postMutation.isPending || !title.trim() || !message.trim()}>
              Post update
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2 mt-3">{Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (data?.incidents.length ?? 0) > 0 && (
        <div className="space-y-2 mt-3">
          {data!.incidents.map((incident) => (
            <Card key={incident.id}>
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-900">{incident.title}</span>
                    <Badge variant="outline" className={cn("text-[10px]", INCIDENT_STATUS_COLORS[incident.status])}>
                      {INCIDENT_STATUS_LABELS[incident.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{incident.message}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(incident.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={incident.status} onValueChange={(v) => updateStatusMutation.mutate({ id: incident.id, status: v as StatusIncident["status"] })}>
                    <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(INCIDENT_STATUS_LABELS) as StatusIncident["status"][]).map((s) => (
                        <SelectItem key={s} value={s}>{INCIDENT_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button type="button" onClick={() => deleteMutation.mutate(incident.id)} className="text-slate-400 hover:text-red-600 p-1" aria-label="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: "text-amber-700 bg-amber-50 border-amber-200",
  in_progress: "text-blue-700 bg-blue-50 border-blue-200",
  resolved: "text-emerald-700 bg-emerald-50 border-emerald-200",
  closed: "text-slate-500 bg-slate-100 border-slate-200",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = { low: "Low", normal: "Normal", high: "High" };
const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: "text-slate-500 bg-slate-100 border-slate-200",
  normal: "text-slate-700 bg-slate-100 border-slate-200",
  high: "text-red-700 bg-red-50 border-red-200",
};

const SOURCE_LABELS = { command_desk: "Command Desk", operators_note: "Operators Note" } as const;

function StatusTile({ icon: Icon, label, value, tone }: { icon: typeof Database; label: string; value: string; tone?: "ok" | "error" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
          <Icon className="w-3.5 h-3.5" /> {label}
        </div>
        <div className={cn("text-lg font-mono tabular-nums font-semibold", tone === "error" ? "text-red-600" : "text-slate-900")}>{value}</div>
      </CardContent>
    </Card>
  );
}

// The Owner's own technical view - "IT" on /quick-access, per direct
// product direction ("this needs to monitor the website/App health,
// were logged tickets get send to all off IT"). Two halves: (1) basic
// system status - deliberately modest, real monitoring (Sentry etc.)
// is still on CLAUDE.md's roadmap and doesn't exist yet, this only
// reports what's actually checkable today; (2) the real support-ticket
// inbox - any Command Desk/Operators Note user can submit one
// (components/report-issue-dialog.tsx), it lands here, visible to any
// Owner-role account. No email delivery involved.
export default function ItPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: status, isLoading: statusLoading } = useQuery<SystemStatus>({
    queryKey: ["system-status"],
    queryFn: api.system.status,
    refetchInterval: 30000,
  });
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<SupportTicket[]>({
    queryKey: ["support-tickets"],
    queryFn: api.supportTickets.list,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ status: TicketStatus; priority: TicketPriority }> }) =>
      api.supportTickets.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      toast({ title: "Ticket updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCount = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="h-14 flex items-center px-6 bg-slate-950 text-white gap-2.5">
        <ShieldAlert className="w-5 h-5 text-blue-400" />
        <div>
          <div className="text-sm font-bold tracking-wide">VENUEGUARD</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest -mt-0.5">Master Console</div>
        </div>
        <div className="flex-1" />
        <Link href="/quick-access" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mr-4">
          <Compass className="w-3.5 h-3.5" />
          Quick Access
        </Link>
        <Link href="/owner" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Master Console
        </Link>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">IT</h1>
          <p className="text-slate-500 text-sm mt-0.5">Platform health and the support-ticket inbox for every subscriber.</p>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">System Status</h2>
          {statusLoading || !status ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatusTile
                icon={Database}
                label="Database"
                value={status.dbStatus === "ok" ? "Connected" : "Error"}
                tone={status.dbStatus === "ok" ? "ok" : "error"}
              />
              <StatusTile icon={Clock} label="API Uptime" value={`${Math.floor(status.serverUptimeSeconds / 60)}m`} />
              <StatusTile icon={Server} label="Environment" value={status.environment} />
              <StatusTile icon={Globe} label="Server Time" value={formatDateTime(status.serverTime)} />
            </div>
          )}
          {status?.dbStatus === "error" && status.dbError && (
            <p className="text-xs text-red-600 mt-2">{status.dbError}</p>
          )}
        </div>

        <StatusIncidentSection />

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Support Tickets</h2>
            {openCount > 0 && <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200">{openCount} open</Badge>}
          </div>
          {ticketsLoading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : tickets.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-400">No tickets reported yet</CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <Card key={ticket.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{ticket.subject}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {ticket.companyName ?? "Unknown subscriber"} · {ticket.userName ?? "Unknown user"} · {SOURCE_LABELS[ticket.source]} ·{" "}
                          {formatDateTime(ticket.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={ticket.priority}
                          onValueChange={(v) => updateMutation.mutate({ id: ticket.id, data: { priority: v as TicketPriority } })}
                        >
                          <SelectTrigger className={cn("h-7 text-xs w-28 border", PRIORITY_COLORS[ticket.priority])}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => (
                              <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={ticket.status}
                          onValueChange={(v) => updateMutation.mutate({ id: ticket.id, data: { status: v as TicketStatus } })}
                        >
                          <SelectTrigger className={cn("h-7 text-xs w-32 border", STATUS_COLORS[ticket.status])}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{ticket.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
