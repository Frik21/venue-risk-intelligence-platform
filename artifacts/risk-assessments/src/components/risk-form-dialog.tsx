import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateRisk, useUpdateRisk, getListRisksQueryKey, getGetAssessmentQueryKey, Risk } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const riskCategories = [
  "operational", "financial", "strategic", "compliance", "reputational", "technical", "other"
] as const;

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.enum(riskCategories),
  description: z.string().optional(),
  likelihood: z.coerce.number().min(1).max(5),
  impact: z.coerce.number().min(1).max(5),
  mitigation: z.string().optional(),
  owner: z.string().optional(),
  status: z.enum(["open", "mitigated", "accepted", "closed"]).default("open"),
});

type FormValues = z.infer<typeof schema>;

interface RiskFormDialogProps {
  assessmentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riskId?: number;
  existingRisk?: Risk;
}

export default function RiskFormDialog({ assessmentId, open, onOpenChange, riskId, existingRisk }: RiskFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!riskId;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      category: "operational",
      description: "",
      likelihood: 3,
      impact: 3,
      mitigation: "",
      owner: "",
      status: "open",
    }
  });

  useEffect(() => {
    if (open) {
      if (isEditing && existingRisk) {
        form.reset({
          title: existingRisk.title,
          category: existingRisk.category as any,
          description: existingRisk.description || "",
          likelihood: existingRisk.likelihood,
          impact: existingRisk.impact,
          mitigation: existingRisk.mitigation || "",
          owner: existingRisk.owner || "",
          status: (existingRisk.status as any) || "open",
        });
      } else {
        form.reset({
          title: "",
          category: "operational",
          description: "",
          likelihood: 3,
          impact: 3,
          mitigation: "",
          owner: "",
          status: "open",
        });
      }
    }
  }, [open, isEditing, existingRisk, form]);

  const createMutation = useCreateRisk({
    mutation: {
      onSuccess: () => {
        toast({ title: "Risk added successfully" });
        queryClient.invalidateQueries({ queryKey: getListRisksQueryKey(assessmentId) });
        queryClient.invalidateQueries({ queryKey: getGetAssessmentQueryKey(assessmentId) });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to add risk", variant: "destructive" })
    }
  });

  const updateMutation = useUpdateRisk({
    mutation: {
      onSuccess: () => {
        toast({ title: "Risk updated successfully" });
        queryClient.invalidateQueries({ queryKey: getListRisksQueryKey(assessmentId) });
        queryClient.invalidateQueries({ queryKey: getGetAssessmentQueryKey(assessmentId) });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to update risk", variant: "destructive" })
    }
  });

  const onSubmit = (data: FormValues) => {
    if (isEditing && riskId) {
      updateMutation.mutate({ assessmentId, riskId, data });
    } else {
      createMutation.mutate({ assessmentId, data });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const score = form.watch("likelihood") * form.watch("impact");
  
  let scoreColor = "text-green-500";
  if (score >= 15) scoreColor = "text-red-500 font-bold";
  else if (score >= 8) scoreColor = "text-orange-500 font-medium";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Risk Item" : "Add Risk Item"}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Risk Title</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Vendor API deprecation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="capitalize">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {riskCategories.map(cat => (
                          <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="capitalize">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="mitigated">Mitigated</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Detailed explanation of the risk..." 
                      className="resize-none h-20"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="p-4 bg-muted/50 rounded-lg border flex flex-col gap-4">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="font-semibold text-sm uppercase tracking-wider">Risk Matrix</span>
                <span className="text-sm">Score: <span className={`text-lg font-mono ml-1 ${scoreColor}`}>{score}</span></span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="likelihood"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Likelihood (1-5)</FormLabel>
                      <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1 - Rare</SelectItem>
                          <SelectItem value="2">2 - Unlikely</SelectItem>
                          <SelectItem value="3">3 - Possible</SelectItem>
                          <SelectItem value="4">4 - Likely</SelectItem>
                          <SelectItem value="5">5 - Almost Certain</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="impact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Impact (1-5)</FormLabel>
                      <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1 - Negligible</SelectItem>
                          <SelectItem value="2">2 - Minor</SelectItem>
                          <SelectItem value="3">3 - Moderate</SelectItem>
                          <SelectItem value="4">4 - Major</SelectItem>
                          <SelectItem value="5">5 - Catastrophic</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="owner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Who is responsible?" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="mitigation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mitigation Plan (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Steps to reduce likelihood or impact..." 
                      className="resize-none h-20"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save Risk"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
