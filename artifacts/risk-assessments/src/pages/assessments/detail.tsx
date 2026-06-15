import { useParams, useLocation } from "wouter";
import { useGetAssessment, getGetAssessmentQueryKey, useListRisks, getListRisksQueryKey, useDeleteRisk } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Edit, Plus, Trash2, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { getStatusBadgeVariant, getRiskLevelColor, formatDate } from "@/lib/display-utils";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import RiskFormDialog from "@/components/risk-form-dialog";

export default function AssessmentDetail() {
  const { id } = useParams();
  const assessmentId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [isRiskDialogOpen, setIsRiskDialogOpen] = useState(false);
  const [editingRiskId, setEditingRiskId] = useState<number | undefined>();

  const { data: assessment, isLoading: isAssessmentLoading, error } = useGetAssessment(assessmentId, {
    query: {
      enabled: !!assessmentId,
      queryKey: getGetAssessmentQueryKey(assessmentId)
    }
  });

  const { data: risks, isLoading: isRisksLoading } = useListRisks(assessmentId, {
    query: {
      enabled: !!assessmentId,
      queryKey: getListRisksQueryKey(assessmentId)
    }
  });

  const deleteRiskMutation = useDeleteRisk({
    mutation: {
      onSuccess: () => {
        toast({ title: "Risk removed" });
        queryClient.invalidateQueries({ queryKey: getListRisksQueryKey(assessmentId) });
        queryClient.invalidateQueries({ queryKey: getGetAssessmentQueryKey(assessmentId) });
      }
    }
  });

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold">Assessment not found</h2>
        <Button className="mt-4" onClick={() => setLocation("/assessments")}>Back to list</Button>
      </div>
    );
  }

  const handleEditRisk = (riskId: number) => {
    setEditingRiskId(riskId);
    setIsRiskDialogOpen(true);
  };

  const handleAddRisk = () => {
    setEditingRiskId(undefined);
    setIsRiskDialogOpen(true);
  };

  const handleDeleteRisk = (riskId: number) => {
    if (confirm("Remove this risk from the assessment?")) {
      deleteRiskMutation.mutate({ assessmentId, riskId });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Link href="/assessments" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Assessments
        </Link>
        
        {isAssessmentLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : assessment ? (
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold tracking-tight">{assessment.title}</h1>
                <Badge variant={getStatusBadgeVariant(assessment.status)} className="capitalize">
                  {assessment.status}
                </Badge>
              </div>
              <div className="text-muted-foreground space-y-1">
                {assessment.project && (
                  <p><span className="font-medium">Project:</span> {assessment.project}</p>
                )}
                <p className="text-sm">Created {formatDate(assessment.createdAt)} • Last updated {formatDate(assessment.updatedAt)}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setLocation(`/assessments/${assessment.id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" /> Edit Details
            </Button>
          </div>
        ) : null}
      </div>

      {!isAssessmentLoading && assessment?.description && (
        <Card className="bg-muted/30 shadow-none border-dashed">
          <CardContent className="p-4 text-sm text-foreground/80">
            {assessment.description}
          </CardContent>
        </Card>
      )}

      <div className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Risk Register</h2>
          <Button onClick={handleAddRisk}>
            <Plus className="w-4 h-4 mr-2" /> Add Risk
          </Button>
        </div>

        <Card>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[300px]">Risk / Category</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="text-center">Score (L×I)</TableHead>
                <TableHead>Mitigation / Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isRisksLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-12 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : !risks || risks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16">
                    <ShieldAlert className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="font-medium text-lg mb-1">No risks identified</h3>
                    <p className="text-muted-foreground mb-4">Add the first risk item to begin tracking.</p>
                    <Button variant="outline" onClick={handleAddRisk}>Add First Risk</Button>
                  </TableCell>
                </TableRow>
              ) : (
                risks.map((risk) => (
                  <TableRow key={risk.id} className="group">
                    <TableCell>
                      <div className="font-medium">{risk.title}</div>
                      <div className="text-xs text-muted-foreground capitalize mt-1">{risk.category}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${getRiskLevelColor(risk.riskLevel)}`}>
                        {risk.riskLevel || 'Unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      <div className="font-semibold text-lg">{risk.riskScore}</div>
                      <div className="text-[10px] text-muted-foreground">{risk.likelihood} × {risk.impact}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm line-clamp-2" title={risk.mitigation || ''}>
                        {risk.mitigation || <span className="text-muted-foreground italic">No mitigation plan</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Owner: {risk.owner || 'Unassigned'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(risk.status || 'open')} className="capitalize">
                        {risk.status || 'open'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleEditRisk(risk.id)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteRisk(risk.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <RiskFormDialog 
        assessmentId={assessmentId}
        open={isRiskDialogOpen}
        onOpenChange={setIsRiskDialogOpen}
        riskId={editingRiskId}
        existingRisk={risks?.find(r => r.id === editingRiskId)}
      />
    </div>
  );
}
