import { useQuery } from "@tanstack/react-query";
import { api, type AssessmentSummary, type AssessmentDetail, type RiskMatrix } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { FileText, Download, Printer, Shield } from "lucide-react";
import { getStatusLabel, getRiskRatingLabel, getRiskRatingColor, formatDate, formatDateTime } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

const MATRIX_FIELDS = [
  { key: "areaRisk",           label: "Area Risk" },
  { key: "accessControl",      label: "Access Control" },
  { key: "arrivalDeparture",   label: "Arrival / Departure" },
  { key: "parking",            label: "Parking / Vehicles" },
  { key: "personnel",          label: "Personnel Security" },
  { key: "medical",            label: "Medical / First Aid" },
  { key: "hse",                label: "HSE / Structural" },
  { key: "extraction",         label: "Extraction Routes" },
];

function ReportPreview({ assessment, matrix }: { assessment: AssessmentDetail; matrix: RiskMatrix | null }) {
  return (
    <div id="report-content" className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6 max-w-4xl mx-auto font-serif">
      {/* Header */}
      <div className="border-b-2 border-slate-900 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-widest mb-1">Physical Venue Risk Assessment</div>
            <h1 className="text-2xl font-bold text-slate-900">{assessment.title}</h1>
            {assessment.venueName && (
              <div className="text-slate-500 font-sans text-sm mt-1">
                {assessment.venueName}{assessment.venueCity ? `, ${assessment.venueCity}` : ""}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className={cn(
              "text-sm font-bold px-3 py-1.5 rounded border uppercase font-sans",
              getRiskRatingColor(assessment.overallRating ?? "unknown")
            )}>
              {getRiskRatingLabel(assessment.overallRating)} RISK
            </div>
            <div className="text-xs text-slate-400 font-sans mt-1">v{assessment.version}</div>
          </div>
        </div>
      </div>

      {/* Metadata table */}
      <div className="grid grid-cols-2 gap-4 text-sm font-sans">
        <div><span className="text-slate-500">Status:</span> <span className="font-semibold">{getStatusLabel(assessment.status)}</span></div>
        <div><span className="text-slate-500">Created:</span> <span className="font-semibold">{formatDate(assessment.createdAt)}</span></div>
        <div><span className="text-slate-500">Last Updated:</span> <span className="font-semibold">{formatDate(assessment.updatedAt)}</span></div>
        {assessment.approvedAt && <div><span className="text-slate-500">Approved:</span> <span className="font-semibold">{formatDate(assessment.approvedAt)}</span></div>}
      </div>

      {/* Intel summary */}
      {assessment.intelSummary && (
        <div>
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3 font-sans uppercase tracking-wide text-sm">
            1. Intelligence Summary
          </h2>
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">{assessment.intelSummary}</p>
        </div>
      )}

      {/* Risk Matrix */}
      {matrix && (
        <div>
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3 font-sans uppercase tracking-wide text-sm">
            2. Risk Matrix
          </h2>
          <table className="w-full text-sm border-collapse font-sans">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="text-left px-3 py-2 font-semibold">Security Domain</th>
                <th className="text-center px-3 py-2 font-semibold w-28">Rating</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX_FIELDS.map(({ key, label }, i) => {
                const rating = (matrix as any)[key];
                return (
                  <tr key={key} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                    <td className="px-3 py-2 text-slate-700">{label}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", getRiskRatingColor(rating))}>
                        {getRiskRatingLabel(rating)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-bold">
                <td className="px-3 py-2">OVERALL RISK RATING</td>
                <td className="px-3 py-2 text-center">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", getRiskRatingColor(matrix.overallRating))}>
                    {getRiskRatingLabel(matrix.overallRating)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
          {matrix.notes && <p className="text-xs text-slate-500 mt-2 italic">{matrix.notes}</p>}
        </div>
      )}

      {/* Analyst Notes */}
      {assessment.analystNotes && (
        <div>
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-3 font-sans uppercase tracking-wide text-sm">
            3. Analyst Notes
          </h2>
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">{assessment.analystNotes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-slate-200 pt-4 text-xs text-slate-400 font-sans flex justify-between">
        <span>CONFIDENTIAL — For authorised recipient only</span>
        <span>Generated {formatDateTime(new Date().toISOString())}</span>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [selectedId, setSelectedId] = useState<string>("");

  const { data: assessments = [], isLoading: listLoading } = useQuery<AssessmentSummary[]>({
    queryKey: ["assessments"],
    queryFn: api.assessments.list,
  });

  const { data: assessment, isLoading: detailLoading } = useQuery<AssessmentDetail>({
    queryKey: ["assessments", Number(selectedId)],
    queryFn: () => api.assessments.get(Number(selectedId)),
    enabled: !!selectedId,
  });

  const { data: matrix } = useQuery<RiskMatrix>({
    queryKey: ["assessments", Number(selectedId), "risk-matrix"],
    queryFn: () => api.assessments.riskMatrix(Number(selectedId)),
    enabled: !!selectedId,
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Report Generator</h1>
          <p className="text-slate-500 text-sm mt-0.5">Generate printable PDF risk assessment reports</p>
        </div>
        {assessment && (
          <Button onClick={handlePrint} className="print:hidden">
            <Printer className="w-4 h-4 mr-1.5" /> Print / Save as PDF
          </Button>
        )}
      </div>

      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-500 shrink-0" />
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="flex-1 max-w-md">
                <SelectValue placeholder="Select an assessment to generate report..." />
              </SelectTrigger>
              <SelectContent>
                {assessments.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.title} — {a.venueName ?? "No venue"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <h3 className="font-semibold text-slate-600 text-lg mb-2">Select an Assessment</h3>
            <p className="text-sm text-slate-400">Choose an assessment above to generate a formatted report</p>
          </CardContent>
        </Card>
      ) : detailLoading ? (
        <Skeleton className="h-96" />
      ) : assessment ? (
        <ReportPreview assessment={assessment} matrix={matrix ?? null} />
      ) : null}
    </div>
  );
}
