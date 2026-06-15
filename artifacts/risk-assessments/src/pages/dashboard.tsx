import { useGetAssessmentsSummary, getGetAssessmentsSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, FileText, Activity } from "lucide-react";
import { Link } from "wouter";
import { getStatusBadgeVariant, formatDate } from "@/lib/display-utils";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: summary, isLoading, error } = useGetAssessmentsSummary({
    query: {
      queryKey: getGetAssessmentsSummaryQueryKey()
    }
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="w-10 h-10 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
        <p className="text-muted-foreground">Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">High-level summary of your risk management workspace.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assessments</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold">{summary?.total || 0}</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Assessments</CardTitle>
            <Activity className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold text-primary">{summary?.byStatus.active || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Risks Identified</CardTitle>
            <AlertTriangle className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold">{summary?.totalRisks || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">High/Critical Risks</CardTitle>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold text-destructive">{summary?.highRisks || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Assessments</CardTitle>
                  <CardDescription>Latest risk assessment documents modified.</CardDescription>
                </div>
                <Link href="/assessments" className="text-sm text-primary font-medium hover:underline">
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (summary?.recentAssessments && summary.recentAssessments.length > 0) ? (
                <div className="divide-y divide-border">
                  {summary.recentAssessments.map((assessment) => (
                    <div key={assessment.id} className="py-4 flex items-center justify-between hover:bg-muted/50 px-2 -mx-2 rounded transition-colors group">
                      <div className="flex-1 min-w-0 pr-4">
                        <Link href={`/assessments/${assessment.id}`} className="font-medium text-foreground hover:text-primary transition-colors block truncate">
                          {assessment.title}
                        </Link>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                          <span className="truncate max-w-[120px]">{assessment.project || 'No project'}</span>
                          <span>•</span>
                          <span>{formatDate(assessment.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-medium font-mono">{assessment.riskCount}</div>
                          <div className="text-xs text-muted-foreground">Risks</div>
                        </div>
                        <Badge variant={getStatusBadgeVariant(assessment.status)} className="capitalize w-20 justify-center">
                          {assessment.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 border border-dashed rounded-lg">
                  <FileText className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                  <h3 className="font-medium">No assessments yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create your first risk assessment to get started.</p>
                  <Link href="/assessments/new" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 hover:bg-primary/90">
                    New Assessment
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="h-full bg-slate-900 text-slate-50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-32 w-full bg-slate-800" /> : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-slate-400" />
                      <span className="text-sm text-slate-300">Draft</span>
                    </div>
                    <span className="font-mono text-slate-100 font-medium">{summary?.byStatus.draft || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <span className="text-sm text-slate-300">Active</span>
                    </div>
                    <span className="font-mono text-slate-100 font-medium">{summary?.byStatus.active || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-slate-600" />
                      <span className="text-sm text-slate-300">Completed</span>
                    </div>
                    <span className="font-mono text-slate-100 font-medium">{summary?.byStatus.completed || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-slate-800 border border-slate-700" />
                      <span className="text-sm text-slate-300">Archived</span>
                    </div>
                    <span className="font-mono text-slate-100 font-medium">{summary?.byStatus.archived || 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
