import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  format,
} from "date-fns";
import { api, type Task } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 3;

// Month-grid Calendar - built from Task.dueDate, the only date/time
// the platform tracks per task (same underlying data as the Operations
// Schedule list view at /admin/schedule, just a different layout).
export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const tasksByDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const key = format(new Date(t.dueDate), "yyyy-MM-dd");
    const bucket = tasksByDay.get(key) ?? [];
    bucket.push(t);
    tasksByDay.set(key, bucket);
  }

  const today = new Date();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Tasks by due date. Full detail on <Link href="/tasks" className="text-blue-600 hover:underline">Tasks</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold text-slate-900 w-32 text-center">{format(month, "MMMM yyyy")}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[600px]" />
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2 text-xs font-semibold text-slate-500 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              const isToday = isSameDay(day, today);
              const visible = dayTasks.slice(0, MAX_VISIBLE_PER_DAY);
              const overflow = dayTasks.length - visible.length;

              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[110px] border-b border-r border-slate-100 p-1.5 last:border-r-0",
                    !inMonth && "bg-slate-50/60",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-6 h-6 text-xs rounded-full mb-1",
                      isToday ? "bg-blue-600 text-white font-semibold" : inMonth ? "text-slate-700" : "text-slate-300",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="space-y-1">
                    {visible.map((t) => (
                      <Link
                        key={t.id}
                        href="/tasks"
                        className="block text-[10px] leading-tight px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100 truncate hover:bg-blue-100"
                        title={`${t.taskNumber} · ${t.title}`}
                      >
                        {t.title}
                      </Link>
                    ))}
                    {overflow > 0 && (
                      <Link href="/tasks" className="block text-[10px] text-slate-400 hover:text-blue-600 px-1.5">
                        +{overflow} more
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
