import { useQuery } from "@tanstack/react-query";
import { api, type AssessmentSummary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useLocation } from "wouter";
import { ClipboardList, Plus, Search, Filter } from "lucide-react";
import { useState } from "react";
import { getStatusColor, getStatusLabel, getRiskRatingColor, getRiskRatingLabel, formatDate, ASSESSMENT_STATUSES } from "@/lib/display-utils";
import { cn } from "@/lib/utils";

export default function AssessmentsList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: assessments = [], isLoading } = useQuery<AssessmentSummary[]>({
    queryKey: ["assessments"],
    queryFn: api.assessments.list,
  });

  const filtered = assessments.filter((a) => {
    const matchSearch =
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.venueName?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assessments</h1>
          <p className="text-slate-500 text-sm mt-0.5">Physical Venue Risk Assessment documents</p>
        </div>
        <Button onClick={() => navigate("/assessments/new")}>
          <Plus className="w-4 h-4 mr-1.5" /> New Assessment
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search assessments..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <Filter className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ASSESSMENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-600 mb-1">No assessments found</h3>
            <p className="text-sm text-slate-400 mb-4">
              {search || statusFilter !== "all" ? "Try changing filters" : "Create your first venue risk assessment"}
            </p>
            {!search && statusFilter === "all" && (
              <Button onClick={() => navigate("/assessments/new")}>
                <Plus className="w-4 h-4 mr-1.5" /> New Assessment
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {filtered.map((a) => (
              <Link key={a.id} href={`/assessments/${a.id}`}>
                <div className="px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 text-sm">{a.title}</span>
                        <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">v{a.version}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {a.venueName
                          ? `${a.venueName}${a.venueCity ? `, ${a.venueCity}` : ""}`
                          : "No venue"}{" "}
                        · Updated {formatDate(a.updatedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.overallRating && (
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase", getRiskRatingColor(a.overallRating))}>
                          {getRiskRatingLabel(a.overallRating)}
                        </span>
                      )}
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase", getStatusColor(a.status))}>
                        {getStatusLabel(a.status)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
