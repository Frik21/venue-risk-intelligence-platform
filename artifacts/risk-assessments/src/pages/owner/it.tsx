import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type SystemStatus, type SupportTicket, type TicketStatus, type TicketPriority } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ArrowLeft, Database, Clock, Server, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

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
