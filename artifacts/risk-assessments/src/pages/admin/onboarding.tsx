import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type OnboardingOverviewRecord, type OnboardingRecord, type OnboardingDocument, type DocumentType, type OnboardingStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useRef, useState } from "react";
import { UserPlus, ChevronDown, ChevronUp, FileText, CheckCircle2, Trash2, Plus, Search } from "lucide-react";
import { formatDate } from "@/lib/display-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Labels only - the underlying status values (in_progress/onboarded/denied)
// stay as-is in the schema and API to avoid a migration.
const STATUS_CONFIG: Record<OnboardingStatus, { label: string; color: string }> = {
  onboarded: { label: "Approved", color: "text-green-700 bg-green-50 border-green-200" },
  in_progress: { label: "Pending", color: "text-amber-700 bg-amber-50 border-amber-200" },
  denied: { label: "Denied", color: "text-red-700 bg-red-50 border-red-200" },
};

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "id_document", label: "ID Document" },
  { value: "passport", label: "Passport" },
];

// Comfortably under the api-server's 10mb JSON body limit once
// base64-encoded (~33% larger than the raw file) - see app.ts.
const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024;

// Always-shown either/or indicator for the two mutually-exclusive
// "engagement_type" checklist items (see onboarding-checklist.ts) -
// filled in when checked, outlined/dim when not, so both read as
// consistent columns down the operator list rather than badges that
// only appear once set.
function EngagementBadge({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium uppercase px-1.5 py-0.5 rounded border shrink-0",
        checked ? "text-blue-700 bg-blue-50 border-blue-200" : "text-slate-400 bg-slate-50 border-slate-200",
      )}
    >
      {checked && <CheckCircle2 className="w-3 h-3" />} {label}
    </span>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const days = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days < 30;
}

function DocumentUploadForm({
  onboardingId,
  onAdded,
  isOnboarded,
  onOnboard,
  onboarding,
  operationalAccessGranted,
  operationalAccessAvailable,
  onToggleOperationalAccess,
  togglingOperationalAccess,
  onRemove,
  removing,
}: {
  onboardingId: number;
  onAdded: () => void;
  // A one-click shortcut to Approve (status: "onboarded") right here
  // in the document workflow, instead of scrolling back up to the
  // Status dropdown - same status change, just handier once documents
  // are in and the operator's ready to move to Assign Operational
  // Access next to it.
  isOnboarded: boolean;
  onOnboard: () => void;
  onboarding: boolean;
  operationalAccessGranted: boolean;
  // Granting is only allowed once the operator is Approved - the
  // server enforces this too, this just disables the button early
  // with an explanation instead of letting the request fail.
  operationalAccessAvailable: boolean;
  onToggleOperationalAccess: () => void;
  togglingOperationalAccess: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const [documentType, setDocumentType] = useState<DocumentType>("id_document");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (data: { filename: string; fileDataUrl: string }) =>
      api.onboarding.addDocument(onboardingId, { documentType, expiryDate: expiryDate || undefined, ...data }),
    onSuccess: () => {
      toast({ title: "Document added" });
      setExpiryDate("");
      onAdded();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast({ title: "File too large", description: "Max 6MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      mutation.mutate({ filename: file.name, fileDataUrl: dataUrl });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        <Label className="text-xs">Document Type</Label>
        <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Expiry Date</Label>
        <Input type="date" className="h-8 w-36 text-xs" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
      </div>
      <label className="h-8 px-3 flex items-center rounded-md border border-slate-200 text-xs font-medium cursor-pointer hover:bg-slate-50">
        {uploading || mutation.isPending ? "Uploading..." : "Choose File"}
        <input type="file" className="hidden" onChange={handleFile} disabled={uploading || mutation.isPending} />
      </label>
      <button
        type="button"
        onClick={onOnboard}
        disabled={isOnboarded || onboarding}
        className={cn(
          "h-8 px-3 flex items-center gap-1.5 rounded-md border text-xs font-medium",
          isOnboarded
            ? "border-green-200 bg-green-50 text-green-700 cursor-not-allowed"
            : "border-slate-200 hover:bg-slate-50",
        )}
      >
        {isOnboarded && <CheckCircle2 className="w-3.5 h-3.5" />}
        {onboarding ? "Onboarding..." : isOnboarded ? "Onboarded" : "Onboard"}
      </button>
      <button
        type="button"
        onClick={onToggleOperationalAccess}
        disabled={togglingOperationalAccess || (!operationalAccessGranted && !operationalAccessAvailable)}
        title={!operationalAccessGranted && !operationalAccessAvailable ? "Approve this operator first" : undefined}
        className={cn(
          "h-8 px-3 flex items-center gap-1.5 rounded-md border text-xs font-medium",
          operationalAccessGranted
            ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
            : operationalAccessAvailable
              ? "border-slate-200 hover:bg-slate-50"
              : "border-slate-100 text-slate-300 cursor-not-allowed",
        )}
      >
        {operationalAccessGranted && <CheckCircle2 className="w-3.5 h-3.5" />}
        {togglingOperationalAccess ? "Updating..." : operationalAccessGranted ? "Operational Access Granted" : "Assign Operational Access"}
      </button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            disabled={removing}
            className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove operator</AlertDialogTitle>
            <AlertDialogDescription>This will remove the operator from the database.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Creates a pending onboarding candidate - deliberately does NOT
// create a real CPO user account yet. That only happens once a
// Manager approves them (see CpoOnboardingDetail's statusMutation),
// so a Pending/Denied operator can't be assigned tasks or show up in
// Operator View until they're actually approved.
function AddOperatorDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.onboarding.create({ name, email }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["onboarding-overview"] });
      toast({ title: "Operator added" });
      onCreated();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <h2 className="text-lg font-bold">Add Operator</h2>
        <div>
          <Label>Full Name *</Label>
          <Input placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Email *</Label>
          <Input type="email" placeholder="john@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !email}>
            {mutation.isPending ? "Adding..." : "Add Operator"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function CpoOnboardingDetail({ onboardingId, onRemoved }: { onboardingId: number; onRemoved: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: record, isLoading: recordLoading } = useQuery<OnboardingRecord>({
    queryKey: ["onboarding", onboardingId],
    queryFn: () => api.onboarding.get(onboardingId),
  });
  const { data: documents = [], isLoading: docsLoading } = useQuery<OnboardingDocument[]>({
    queryKey: ["onboarding-documents", onboardingId],
    queryFn: () => api.onboarding.listDocuments(onboardingId),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, checked }: { key: string; checked: boolean }) =>
      api.onboarding.setChecklistItem(record!.id, key, checked),
    onSuccess: (updated) => {
      qc.setQueryData(["onboarding", onboardingId], updated);
      qc.invalidateQueries({ queryKey: ["onboarding-overview"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: OnboardingStatus) => api.onboarding.updateStatus(record!.id, status),
    onSuccess: (updated) => {
      qc.setQueryData(["onboarding", onboardingId], updated);
      qc.invalidateQueries({ queryKey: ["onboarding-overview"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Status updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, verified }: { id: number; verified: boolean }) => api.onboarding.updateDocument(id, { verified }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-documents", onboardingId] }),
  });

  const operationalAccessMutation = useMutation({
    mutationFn: (granted: boolean) => api.onboarding.setOperationalAccess(record!.id, granted),
    onSuccess: (updated) => {
      qc.setQueryData(["onboarding", onboardingId], updated);
      toast({ title: updated.operationalAccessGrantedAt ? "Operational access granted" : "Operational access revoked" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.onboarding.deleteDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-documents", onboardingId] });
      toast({ title: "Document removed" });
    },
  });

  const removeOperatorMutation = useMutation({
    mutationFn: () => api.onboarding.remove(onboardingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-overview"] });
      qc.removeQueries({ queryKey: ["onboarding", onboardingId] });
      toast({ title: "Operator removed" });
      onRemoved();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-4">
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Status</p>
        {recordLoading ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <>
            <Select value={record?.status} onValueChange={(v) => statusMutation.mutate(v as OnboardingStatus)}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_CONFIG) as OnboardingStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {record?.operationalAccessGrantedAt == null && (
              <p className="text-xs text-slate-400 mt-1.5">
                {record?.status === "onboarded"
                  ? "Approved, but no CPO account exists yet - use “Assign Operational Access” below to create one."
                  : "No CPO account exists yet - approve them, then grant operational access to create one."}
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Checklist</p>
        {recordLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="space-y-1.5">
            {record?.checklist.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={item.checked}
                  onCheckedChange={(v) => toggleMutation.mutate({ key: item.key, checked: v === true })}
                />
                <span className={item.checked ? "text-slate-700" : "text-slate-500"}>{item.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Documents</p>
        {docsLoading ? (
          <Skeleton className="h-16" />
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-400 mb-2">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {documents.map((doc) => {
              const expiring = isExpiringSoon(doc.expiryDate);
              return (
                <div key={doc.id} className="flex items-center justify-between gap-2 text-sm border border-slate-100 rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium text-slate-700">{DOCUMENT_TYPES.find((t) => t.value === doc.documentType)?.label ?? doc.documentType}</span>
                      <p className="text-xs text-slate-400 truncate">
                        {doc.filename}
                        {doc.expiryDate && (
                          <span className={expiring ? "text-orange-600 font-medium" : ""}>
                            {" "}· Expires {formatDate(doc.expiryDate)}{expiring && " (soon)"}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.verified ? (
                      <span className="flex items-center gap-1 text-[10px] font-medium uppercase text-green-600"><CheckCircle2 className="w-3 h-3" /> Verified</span>
                    ) : (
                      <button
                        onClick={() => verifyMutation.mutate({ id: doc.id, verified: true })}
                        className="text-[10px] font-medium uppercase text-blue-600 hover:underline"
                      >
                        Mark Verified
                      </button>
                    )}
                    <button onClick={() => deleteMutation.mutate(doc.id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <DocumentUploadForm
          onboardingId={onboardingId}
          onAdded={() => qc.invalidateQueries({ queryKey: ["onboarding-documents", onboardingId] })}
          isOnboarded={record?.status === "onboarded"}
          onOnboard={() => statusMutation.mutate("onboarded")}
          onboarding={statusMutation.isPending}
          operationalAccessGranted={record?.operationalAccessGrantedAt != null}
          operationalAccessAvailable={record?.status === "onboarded"}
          onToggleOperationalAccess={() => record && operationalAccessMutation.mutate(record.operationalAccessGrantedAt == null)}
          togglingOperationalAccess={operationalAccessMutation.isPending || recordLoading}
          onRemove={() => removeOperatorMutation.mutate()}
          removing={removeOperatorMutation.isPending}
        />
      </div>
    </div>
  );
}

// Operator Onboarding - status/checklist tracker plus document
// uploads (ID, PSIRA, firearm competency, etc. with expiry dates) per
// CPO, per direct product direction. The checklist is a fixed,
// server-defined list (same pattern as the Operational Plan
// checklist), not user-configurable.
export default function OnboardingPage() {
  // Keyed by `${column}-${id}`, matching cardRefs below, rather than
  // bare id - an unassigned operator (neither engagement checklist
  // item checked) renders a card in both the Freelancers and Long
  // Term Contract columns at once, and a bare-id key would expand
  // both cards together whenever either one was clicked.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | null>(null);
  // Freelancers and Long Term Contract are each their own searchable
  // list (independent of one another) rather than sharing a single
  // page-level search box, per direct product direction.
  const [freelancerSearch, setFreelancerSearch] = useState("");
  const [longTermSearch, setLongTermSearch] = useState("");
  // Collapses/expands the two Freelance/Long Term Contract columns as
  // a unit, per direct product direction - defaults open since that's
  // the existing always-visible behavior.
  const [columnsExpanded, setColumnsExpanded] = useState(true);
  // Keyed by `${column}-${id}` rather than just id - same reasoning as
  // expandedKey above.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: records = [], isLoading } = useQuery<OnboardingOverviewRecord[]>({
    queryKey: ["onboarding-overview"],
    queryFn: api.onboarding.listAll,
  });

  // Scroll a manually-expanded card into view (e.g. after "Manage" on
  // a row further down the list).
  useEffect(() => {
    if (expandedKey == null) return;
    cardRefs.current[expandedKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [expandedKey]);

  const counts = {
    onboarded: records.filter((r) => r.status === "onboarded").length,
    in_progress: records.filter((r) => r.status === "in_progress").length,
    denied: records.filter((r) => r.status === "denied").length,
  };

  const visibleRecords = records.filter((r) => {
    if (statusFilter != null && r.status !== statusFilter) return false;
    return true;
  });

  // Two columns by engagement type, per direct product direction. An
  // operator who hasn't had either "engagement_type" checklist item
  // checked yet appears in BOTH columns (rather than a third
  // "Unassigned" column or being hidden) so nobody drops out of view
  // while their onboarding is still in progress; the two items are
  // mutually exclusive (see onboarding-checklist.ts) so an assigned
  // operator can only ever land in exactly one column.
  const engagementOf = (r: OnboardingOverviewRecord) => ({
    isFreelancer: r.checklist.find((c) => c.key === "freelancer")?.checked ?? false,
    isLongTermContract: r.checklist.find((c) => c.key === "long_term_contract")?.checked ?? false,
  });
  const freelancerQuery = freelancerSearch.trim().toLowerCase();
  const freelancerColumnRecords = visibleRecords.filter((r) => {
    const { isFreelancer, isLongTermContract } = engagementOf(r);
    if (!(isFreelancer || (!isFreelancer && !isLongTermContract))) return false;
    if (freelancerQuery && !r.userName?.toLowerCase().includes(freelancerQuery)) return false;
    return true;
  });
  const longTermQuery = longTermSearch.trim().toLowerCase();
  const longTermColumnRecords = visibleRecords.filter((r) => {
    const { isFreelancer, isLongTermContract } = engagementOf(r);
    if (!(isLongTermContract || (!isFreelancer && !isLongTermContract))) return false;
    if (longTermQuery && !r.userName?.toLowerCase().includes(longTermQuery)) return false;
    return true;
  });

  function renderOperatorCard(r: OnboardingOverviewRecord, columnKey: string) {
    const pct = r.totalCount === 0 ? 0 : Math.round((r.checkedCount / r.totalCount) * 100);
    const { isFreelancer, isLongTermContract } = engagementOf(r);
    return (
      <Card key={`${columnKey}-${r.id}`} ref={(el) => { cardRefs.current[`${columnKey}-${r.id}`] = el; }}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="font-semibold text-slate-900 text-sm">{r.userName}</span>
                <Badge variant="secondary" className={cn("text-[10px] uppercase", STATUS_CONFIG[r.status].color)}>
                  {STATUS_CONFIG[r.status].label}
                </Badge>
                {r.operationalAccessGrantedAt != null && (
                  <span className="flex items-center gap-1 text-[10px] font-medium uppercase text-green-600">
                    <CheckCircle2 className="w-3 h-3" /> Access Granted
                  </span>
                )}
                <span className="text-xs text-slate-400">{r.documentCount} document{r.documentCount !== 1 ? "s" : ""}</span>
                <EngagementBadge label="Freelancer" checked={isFreelancer} />
                <EngagementBadge label="Long Term Contract" checked={isLongTermContract} />
              </div>
              <div className="flex items-center gap-2">
                <Progress value={pct} className="h-1.5 flex-1 max-w-xs" />
                <span className="text-xs text-slate-500 shrink-0">{r.checkedCount}/{r.totalCount}</span>
              </div>
            </div>
            <button
              onClick={() => {
                const key = `${columnKey}-${r.id}`;
                setExpandedKey((current) => (current === key ? null : key));
              }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"
            >
              {expandedKey === `${columnKey}-${r.id}` ? "Hide" : "Manage"}
              {expandedKey === `${columnKey}-${r.id}` ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {expandedKey === `${columnKey}-${r.id}` && (
            <CpoOnboardingDetail onboardingId={r.id} onRemoved={() => setExpandedKey(null)} />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {showAdd && (
        <AddOperatorDialog
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            // Clear any active status filter so the new (Pending)
            // operator is guaranteed to be visible in the list -
            // deliberately not auto-expanded/scrolled to, per direct
            // product direction: it should just appear in the list
            // like any other operator, opened only on an explicit
            // "Manage" click.
            setStatusFilter(null);
          }}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operator Onboarding</h1>
          <p className="text-slate-500 text-sm mt-0.5">Checklist progress and document verification for every CPO</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> Add Operator
        </Button>
      </div>

      {!isLoading && records.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {(["onboarded", "in_progress", "denied"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter((current) => (current === s ? null : s))}
              className="text-left"
            >
              <Card className={cn("transition-colors", statusFilter === s && "ring-2 ring-blue-500 border-blue-500")}>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-slate-900">{counts[s]}</div>
                  <div className="text-xs text-slate-500">{STATUS_CONFIG[s].label}</div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      {statusFilter != null && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          Showing only {STATUS_CONFIG[statusFilter].label.toLowerCase()} operators
          <button onClick={() => setStatusFilter(null)} className="text-blue-600 hover:underline">Clear filter</button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <UserPlus className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No CPOs yet</h3>
            <p className="text-sm text-slate-400">Add an operator above to start onboarding.</p>
          </CardContent>
        </Card>
      ) : visibleRecords.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <UserPlus className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">
              No {STATUS_CONFIG[statusFilter!].label.toLowerCase()} operators
            </h3>
          </CardContent>
        </Card>
      ) : statusFilter === "in_progress" ? (
        // Pending operators haven't been assigned an engagement type
        // yet (that's part of what "Pending" means), so the
        // Freelance/Long Term Contract split doesn't apply to them -
        // every pending operator would show in both columns at once,
        // duplicating the exact same card. A single flat list instead,
        // per direct product direction - no "Operator Database"
        // toggle either, since that's specifically the two-column
        // view (already available unfiltered or under Approved).
        <div className="space-y-3">
          {visibleRecords.map((r) => renderOperatorCard(r, "pending"))}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setColumnsExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 mb-3"
          >
            Operator Database
            {columnsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {columnsExpanded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2.5">Freelance Database</h2>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Search freelancers by name..."
                className="pl-8 h-9"
                value={freelancerSearch}
                onChange={(e) => setFreelancerSearch(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              {freelancerColumnRecords.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {freelancerQuery ? `No freelancers match "${freelancerSearch.trim()}"` : "No operators in this column."}
                </p>
              ) : (
                freelancerColumnRecords.map((r) => renderOperatorCard(r, "freelancer"))
              )}
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2.5">Long Term Contract Database</h2>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Search long term contract operators by name..."
                className="pl-8 h-9"
                value={longTermSearch}
                onChange={(e) => setLongTermSearch(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              {longTermColumnRecords.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {longTermQuery ? `No operators match "${longTermSearch.trim()}"` : "No operators in this column."}
                </p>
              ) : (
                longTermColumnRecords.map((r) => renderOperatorCard(r, "longterm"))
              )}
            </div>
          </div>
        </div>
          )}
        </div>
      )}
    </div>
  );
}
