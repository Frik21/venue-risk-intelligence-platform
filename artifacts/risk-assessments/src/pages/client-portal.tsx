import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Download, FileText, Briefcase, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type ClientPortalData, type ClientPortalQuote } from "@/lib/api";
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

const QUOTE_STATUS_STYLES: Record<string, string> = {
  sent: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  approved: "bg-green-500/20 text-green-300 border-green-500/30",
  rejected: "bg-red-500/20 text-red-300 border-red-500/30",
};

const QUOTE_STATUS_LABELS: Record<string, string> = { sent: "Awaiting Your Decision", approved: "Signed", rejected: "Declined" };

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// E-signature - Following Roadmap Tier 3, item 26. A typed full name +
// an explicit "I agree" click is the signature itself (no drawn/image
// signature - same complexity budget as this app's other "the honest,
// simple version" stubs, see the payment-panel notes in CLAUDE.md) -
// what makes it "more defensible than a status flip" is that it's the
// client's own action on their own link, captured with a timestamp
// server-side (quotes.signedByName/signedAt), not a Manager clicking a
// button on the client's behalf.
function QuoteCard({ token, quote }: { token: string; quote: ClientPortalQuote }) {
  const qc = useQueryClient();
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState("");

  const signMutation = useMutation({
    mutationFn: () => api.publicClientPortal.signQuote(token, quote.id, name.trim()),
    onSuccess: (updated) => {
      qc.setQueryData<ClientPortalData>(["client-portal", token], (old) => old && { ...old, quotes: old.quotes.map((q) => (q.id === updated.id ? updated : q)) });
      setSigning(false);
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => api.publicClientPortal.declineQuote(token, quote.id),
    onSuccess: (updated) => {
      qc.setQueryData<ClientPortalData>(["client-portal", token], (old) => old && { ...old, quotes: old.quotes.map((q) => (q.id === updated.id ? updated : q)) });
    },
  });

  return (
    <div className="border-b border-slate-800 last:border-0 pb-3 last:pb-0 space-y-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">{quote.quoteNumber} - {quote.title || "Quote"}</p>
          <p className="text-xs text-slate-500">{formatMoney(quote.totalQuoteValue, quote.currency)}{quote.validUntil ? ` · Valid until ${formatDate(quote.validUntil)}` : ""}</p>
        </div>
        <Badge variant="outline" className={QUOTE_STATUS_STYLES[quote.status] ?? "border-slate-700 text-slate-300"}>
          {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
        </Badge>
      </div>

      {quote.status === "approved" && quote.signedByName && (
        <p className="text-xs text-slate-500">Signed by {quote.signedByName}{quote.signedAt ? ` on ${formatDate(quote.signedAt)}` : ""}</p>
      )}

      {quote.status === "sent" && (
        signing ? (
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your full name to sign"
              className="bg-slate-950 border-slate-800 text-white h-8 text-sm"
            />
            <Button size="sm" disabled={!name.trim() || signMutation.isPending} onClick={() => signMutation.mutate()}>
              Sign
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSigning(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setSigning(true)}>
              <PenLine className="w-3.5 h-3.5 mr-1" /> Sign
            </Button>
            <Button size="sm" variant="outline" className="text-red-300 border-red-900 hover:bg-red-950" disabled={declineMutation.isPending} onClick={() => declineMutation.mutate()}>
              Decline
            </Button>
          </div>
        )
      )}
    </div>
  );
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

            {data.quotes.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h2 className="font-semibold flex items-center gap-2 mb-3">
                  <PenLine className="w-4 h-4 text-slate-400" /> Quotes
                </h2>
                <div className="space-y-3">
                  {data.quotes.map((q) => <QuoteCard key={q.id} token={token} quote={q} />)}
                </div>
              </div>
            )}

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
