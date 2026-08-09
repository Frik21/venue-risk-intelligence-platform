import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type OnboardingOverviewRecord, type OnboardingRecord, type OnboardingDocument, type DocumentType, type OnboardingStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useRef, useState } from "react";
import { UserPlus, ChevronDown, ChevronUp, FileText, CheckCircle2, Trash2, Plus } from "lucide-react";
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
  { value: "psira_registration", label: "PSIRA Registration" },
  { value: "firearm_competency", label: "Firearm Competency Certificate" },
  { value: "drivers_license", label: "Driver's License" },
  { value: "medical_certificate", label: "Medical Certificate" },
  { value: "background_check_report", label: "Background Check Report" },
  { value: "other", label: "Other" },
];

// Comfortably under the api-server's 10mb JSON body limit once
// base64-encoded (~33% larger than the raw file) - see app.ts.
const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024;

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

function DocumentUploadForm({ onboardingId, onAdded }: { onboardingId: number; onAdded: () => void }) {
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
    </div>
  );
}

// Creates a pending onboarding candidate - deliberately does NOT
// create a real CPO user account yet. That only happens once a
// Manager approves them (see CpoOnboardingDetail's statusMutation),
// so a Pending/Denied operator can't be assigned tasks or show up in
// Operator View until they're actually approved.
function AddOperatorDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (onboardingId: number) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => api.onboarding.create({ name, email }),
    onSuccess: async (record) => {
      // Wait for the overview list to include the new operator before
      // handing off to onCreated, which expands their row - otherwise
      // there's nothing to expand yet.
      await qc.invalidateQueries({ queryKey: ["onboarding-overview"] });
      toast({ title: "Operator added" });
      onCreated(record.id);
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
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

function CpoOnboardingDetail({ onboardingId }: { onboardingId: number }) {
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.onboarding.deleteDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-documents", onboardingId] });
      toast({ title: "Document removed" });
    },
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
            {record?.userId == null && (
              <p className="text-xs text-slate-400 mt-1.5">No CPO account exists yet - approving them creates one.</p>
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
        <DocumentUploadForm onboardingId={onboardingId} onAdded={() => qc.invalidateQueries({ queryKey: ["onboarding-documents", onboardingId] })} />
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
  const [expandedOnboardingId, setExpandedOnboardingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const { data: records = [], isLoading } = useQuery<OnboardingOverviewRecord[]>({
    queryKey: ["onboarding-overview"],
    queryFn: api.onboarding.listAll,
  });

  // Scroll a freshly-added operator's row into view once it's expanded,
  // so creating them flows straight into their onboarding checklist.
  useEffect(() => {
    if (expandedOnboardingId != null) cardRefs.current[expandedOnboardingId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [expandedOnboardingId, records]);

  const counts = {
    onboarded: records.filter((r) => r.status === "onboarded").length,
    in_progress: records.filter((r) => r.status === "in_progress").length,
    denied: records.filter((r) => r.status === "denied").length,
  };

  return (
    <div className="space-y-5">
      {showAdd && (
        <AddOperatorDialog
          onClose={() => setShowAdd(false)}
          onCreated={(onboardingId) => setExpandedOnboardingId(onboardingId)}
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
            <Card key={s}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-slate-900">{counts[s]}</div>
                <div className="text-xs text-slate-500">{STATUS_CONFIG[s].label}</div>
              </CardContent>
            </Card>
          ))}
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
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const pct = r.totalCount === 0 ? 0 : Math.round((r.checkedCount / r.totalCount) * 100);
            return (
              <Card key={r.id} ref={(el) => { cardRefs.current[r.id] = el; }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-semibold text-slate-900 text-sm">{r.userName}</span>
                        <Badge variant="secondary" className={cn("text-[10px] uppercase", STATUS_CONFIG[r.status].color)}>
                          {STATUS_CONFIG[r.status].label}
                        </Badge>
                        <span className="text-xs text-slate-400">{r.documentCount} document{r.documentCount !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-1.5 flex-1 max-w-xs" />
                        <span className="text-xs text-slate-500 shrink-0">{r.checkedCount}/{r.totalCount}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedOnboardingId((id) => (id === r.id ? null : r.id))}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"
                    >
                      {expandedOnboardingId === r.id ? "Hide" : "Manage"}
                      {expandedOnboardingId === r.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {expandedOnboardingId === r.id && <CpoOnboardingDetail onboardingId={r.id} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
