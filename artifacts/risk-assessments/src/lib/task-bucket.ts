import type { Task } from "@/lib/api";

// Data-completeness / allocation bucket - independent of Task.status
// (that's the CPO's own work progress). Precedence, most to least
// "done": Completed (status) > Pending Details (Client Name and/or
// Client Contact still blank - a task is intentionally allowed to be
// created without these, per direct product direction: "i should be
// able to not fill in all the details and still create the task") >
// Pending Allocation (details filled in, just needs a CPO - see
// Operator Deployment's Assign Task dropdown) > Running (details filled
// in and staffed). Shared between the Tasks list (badges/filters) and
// Operator Deployment (Assign Task's task options) so both always agree
// on what counts as needing allocation.
export type TaskBucket = "pending_details" | "pending_allocation" | "running" | "completed";

export const BUCKET_CONFIG: Record<TaskBucket, { label: string; color: string }> = {
  pending_details: { label: "Pending Details", color: "text-amber-700 bg-amber-50 border-amber-200" },
  pending_allocation: { label: "Pending Allocation", color: "text-purple-700 bg-purple-50 border-purple-200" },
  running: { label: "Running", color: "text-blue-700 bg-blue-50 border-blue-200" },
  completed: { label: "Completed", color: "text-green-700 bg-green-50 border-green-200" },
};

export function taskBucket(task: Task): TaskBucket {
  if (task.status === "completed") return "completed";
  if (!task.clientName.trim() || !task.clientContact.trim()) return "pending_details";
  return task.assignedToIds.length === 0 ? "pending_allocation" : "running";
}
