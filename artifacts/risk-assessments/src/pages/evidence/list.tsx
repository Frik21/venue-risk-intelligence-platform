import { useQuery } from "@tanstack/react-query";
import { api, type Evidence } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderOpen, Search, ExternalLink, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { formatDate, EVIDENCE_TYPES } from "@/lib/display-utils";
import { Link } from "wouter";

// Evidence is fetched per-assessment; for the global evidence page we show a placeholder with instructions
export default function EvidencePage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Evidence Repository</h1>
        <p className="text-slate-500 text-sm mt-0.5">All collected intelligence evidence across assessments</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search evidence..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {EVIDENCE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="py-16 text-center">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-blue-300" />
          <h3 className="font-semibold text-slate-600 text-lg mb-2">Evidence lives inside Assessments</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
            Evidence is collected and managed per-assessment. Open an assessment and navigate to its
            Evidence tab to add OSINT sources, analyst notes, images, and documents.
          </p>
          <Link href="/assessments">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
              Browse Assessments →
            </span>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
