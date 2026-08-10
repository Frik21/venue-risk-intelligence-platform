import type { Task } from "@/lib/api";

// Data-completeness / allocation bucket - independent of Task.status
// (that's the CPO's own work progress). Precedence, most to least
// "done": Completed (status) > Pending Details (any of the fields below
// still blank - a task is intentionally allowed to be created with only
// client name/contact/requirements + assigned by filled in, per direct
// product direction: "not all the details are required only those that
// I shared with you... if all the other details are not filled in it
// will then go into Pending Details... I have to fill in all the
// remaining details for the task to move to Pending Allocation") >
// Pending Allocation (every field below is filled in, just needs a CPO
// - see Operator Deployment's Assign Task dropdown) > Running (details
// complete and staffed). Shared between the Tasks list (badges/filters)
// and Operator Deployment (Assign Task's task options) so both always
// agree on what counts as needing allocation.
export type TaskBucket = "pending_details" | "pending_allocation" | "running" | "completed";

export const BUCKET_CONFIG: Record<TaskBucket, { label: string; color: string }> = {
  pending_details: { label: "Pending Details", color: "text-amber-700 bg-amber-50 border-amber-200" },
  pending_allocation: { label: "Pending Allocation", color: "text-purple-700 bg-purple-50 border-purple-200" },
  running: { label: "Running", color: "text-blue-700 bg-blue-50 border-blue-200" },
  completed: { label: "Completed", color: "text-green-700 bg-green-50 border-green-200" },
};

// Estimated Cost is deliberately not checked here - it's off both task
// forms for now (coming back later), so it can never be satisfied.
function detailsComplete(task: Task): boolean {
  return (
    task.title.trim() !== "" &&
    task.venueId != null &&
    task.clientName.trim() !== "" &&
    task.clientContact.trim() !== "" &&
    task.clientRequirements.trim() !== "" &&
    task.dueDate != null &&
    task.endDate != null
  );
}

export function taskBucket(task: Task): TaskBucket {
  if (task.status === "completed") return "completed";
  if (!detailsComplete(task)) return "pending_details";
  return task.assignedToIds.length === 0 ? "pending_allocation" : "running";
}
