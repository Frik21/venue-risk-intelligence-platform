import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type Task } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays } from "lucide-react";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function TaskRow({ task }: { task: Task }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0 text-sm">
      <div className="min-w-0">
        <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded mr-2">{task.taskNumber}</span>
        <span className="font-medium text-slate-900">{task.title}</span>
        <p className="text-xs text-slate-400">
          {task.venueName ?? "No venue"} · {task.assignedToName ?? "Unassigned"}
        </p>
      </div>
      {task.dueDate && <span className="text-xs text-slate-400 shrink-0">{new Date(task.dueDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
    </div>
  );
}

// Operations Schedule - grouped from Task.dueDate, which is the only
// date/time the platform tracks per task (no separate start/end or a
// dedicated CPO/team calendar - Schedule is a view over the same task
// data, not a new entity).
export default function SchedulePage() {
  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });

  const today = startOfDay(new Date());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

  // Cancelled tasks are already excluded - api.tasks.list() defaults to
  // archived:false. Completed ones are filtered here too, same
  // reasoning as the Calendar page - a finished task doesn't need to
  // keep occupying a schedule slot.
  const withDates = tasks.filter((t) => t.dueDate && t.status !== "completed");
  const todayTasks = withDates.filter((t) => startOfDay(new Date(t.dueDate!)).getTime() === today.getTime());
  const tomorrowTasks = withDates.filter((t) => startOfDay(new Date(t.dueDate!)).getTime() === tomorrow.getTime());
  const thisWeekTasks = withDates
    .filter((t) => {
      const d = startOfDay(new Date(t.dueDate!));
      return d.getTime() > tomorrow.getTime() && d.getTime() <= weekEnd.getTime();
    })
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const undated = tasks.filter((t) => !t.dueDate && t.status !== "completed");

  const sections = [
    { label: "Today", tasks: todayTasks },
    { label: "Tomorrow", tasks: tomorrowTasks },
    { label: "Rest of This Week", tasks: thisWeekTasks },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Operations Schedule</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Tasks by due date. Full detail on <Link href="/tasks" className="text-blue-600 hover:underline">Tasks</Link>.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {sections.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5">
                <h2 className="font-semibold text-slate-900 mb-3">{s.label}</h2>
                {s.tasks.length === 0 ? (
                  <p className="text-sm text-slate-400">Nothing scheduled.</p>
                ) : (
                  <div>{s.tasks.map((t) => <TaskRow key={t.id} task={t} />)}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && undated.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400" /> No Due Date Set
            </h2>
            <div>{undated.map((t) => <TaskRow key={t.id} task={t} />)}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
