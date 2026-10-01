import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, Download, FileText, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api, type ClientPortalData } from "@/lib/api";
import { formatDate } from "@/lib/display-utils";

const TASK_STATUS_LABELS: Record<string, string> = {
  not_completed: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  sent: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// The public, unauthenticated side of the Client Portal - Following
// Roadmap Tier 3, item 25. Reached via a persistent link a Manager
// generates on the Client's own detail page and sends manually (see
// routes/client-portal.ts's own comment for why there's no real
// client login). Deliberately outside RequireAuth/Layout's normal
// gating (see components/require-auth.tsx and components/layout.tsx's
// /portal/ bypasses), same treatment as /feedback/:token.
export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery<ClientPortalData>({
    queryKey: ["client-portal", token],
    queryFn: () => api.publicClientPortal.get(token),
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="w-full max-w-2xl mx-auto space-y-8 py-8">
        <div className="flex flex-col items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-blue-400" />
          <div className="text-center">
            <div className="text-lg font-bold tracking-wide">VENUEGUARD</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">Client Portal</div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400 text-center">Loading...</p>
        ) : error || !data ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-sm text-red-400 text-center">{(error as Error | undefined)?.message ?? "This portal link is invalid or has been revoked."}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-slate-400">Welcome back,</p>
              <p className="text-xl font-semibold">{data.clientName}</p>
              <p className="text-xs text-slate-500 mt-1">{data.companyName}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-slate-400" /> Your Jobs
              </h2>
              {data.tasks.length === 0 ? (
                <p className="text-sm text-slate-500">No jobs on file yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.tasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between border-b border-slate-800 last:border-0 pb-2 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-slate-500">{t.dueDate ? formatDate(t.dueDate) : "Date TBC"}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 border-slate-700 text-slate-300">
                        {TASK_STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-slate-400" /> Invoices
              </h2>
              {data.invoices.length === 0 ? (
                <p className="text-sm text-slate-500">No invoices on file yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.invoices.map((i) => (
                    <div key={i.id} className="flex items-center justify-between border-b border-slate-800 last:border-0 pb-2 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{i.invoiceNumber}</p>
                        <p className="text-xs text-slate-500">
                          {i.dueDate ? `Due ${formatDate(i.dueDate)}` : "No due date"} · {formatMoney(i.totalAmount, i.currency)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={INVOICE_STATUS_STYLES[i.status] ?? "border-slate-700 text-slate-300"}>
                          {i.status === "paid" ? "Paid" : "Sent"}
                        </Badge>
                        <a
                          href={api.publicClientPortal.invoicePdfUrl(token, i.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                          aria-label={`Download ${i.invoiceNumber}`}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
