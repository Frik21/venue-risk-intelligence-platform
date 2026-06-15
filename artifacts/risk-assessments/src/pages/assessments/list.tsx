import { useListAssessments, getListAssessmentsQueryKey, useDeleteAssessment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search, MoreHorizontal, Trash2, Edit } from "lucide-react";
import { Link } from "wouter";
import { getStatusBadgeVariant, formatDate } from "@/lib/display-utils";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AssessmentsList() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assessments, isLoading } = useListAssessments({
    query: {
      queryKey: getListAssessmentsQueryKey()
    }
  });

  const deleteMutation = useDeleteAssessment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Assessment deleted" });
        queryClient.invalidateQueries({ queryKey: getListAssessmentsQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to delete", variant: "destructive" });
      }
    }
  });

  const filtered = assessments?.filter(a => 
    a.title.toLowerCase().includes(search.toLowerCase()) || 
    (a.project && a.project.toLowerCase().includes(search.toLowerCase()))
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground mt-1">Manage and track your project risk assessments.</p>
        </div>
        <Link href="/assessments/new" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-10 px-4 hover:bg-primary/90 shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          New Assessment
        </Link>
      </div>

      <Card>
        <div className="p-4 border-b flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search assessments..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Risks</TableHead>
              <TableHead className="text-right">High/Crit</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-8 ml-auto" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No assessments found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((assessment) => (
                <TableRow key={assessment.id} className="group">
                  <TableCell className="font-medium">
                    <Link href={`/assessments/${assessment.id}`} className="hover:text-primary hover:underline transition-colors block">
                      {assessment.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{assessment.project || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(assessment.status)} className="capitalize">
                      {assessment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{assessment.riskCount}</TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={assessment.highRiskCount > 0 ? "text-destructive font-bold" : "text-muted-foreground"}>
                      {assessment.highRiskCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="w-4 h-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/assessments/${assessment.id}/edit`} className="cursor-pointer">
                            <Edit className="w-4 h-4 mr-2" /> Edit Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                          onClick={() => {
                            if(confirm("Are you sure you want to delete this assessment?")) {
                              deleteMutation.mutate({ id: assessment.id });
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
