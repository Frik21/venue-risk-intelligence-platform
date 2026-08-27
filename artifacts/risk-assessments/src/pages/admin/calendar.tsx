import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
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

// A task's calendar range is [dueDate, endDate] inclusive (endDate
// falling back to dueDate for a single-day task, and never before it -
// guards against a mis-entered endDate producing a negative range).
function taskRange(t: Task): { start: Date; end: Date } {
  const start = startOfDay(new Date(t.dueDate!));
  const endRaw = t.endDate ? startOfDay(new Date(t.endDate)) : start;
  return { start, end: endRaw < start ? start : endRaw };
}

// Month-grid Calendar - built from each Task's [dueDate, endDate] span
// (same underlying data as the Operations Schedule list view at
// /admin/schedule, just a different layout). A multi-day task appears
// as a continuous bar across every day it runs, re-labeled at the
// start of each week row so it stays readable without repeating the
// title on every single day.
export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Cancelled tasks are already excluded - api.tasks.list() defaults to
  // archived:false. Completed tasks are filtered here too, since a
  // finished engagement no longer needs to occupy a calendar slot.
  const datedTasks = [...tasks]
    .filter((t) => t.dueDate && t.status !== "completed")
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));

  const tasksByDay = new Map<string, Task[]>();
  for (const t of datedTasks) {
    const { start, end } = taskRange(t);
    // Clamped to the visible grid - both correct (nothing to show
    // outside it) and safe (bounds the loop below regardless of how
    // far out endDate is set).
    const rangeStart = start < gridStart ? gridStart : start;
    const rangeEnd = end > gridEnd ? gridEnd : end;
    if (rangeStart > rangeEnd) continue;

    for (const day of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
      const key = format(day, "yyyy-MM-dd");
      const bucket = tasksByDay.get(key) ?? [];
      bucket.push(t);
      tasksByDay.set(key, bucket);
    }
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
                    {visible.map((t) => {
                      const { start: taskStart, end: taskEnd } = taskRange(t);
                      const weekday = day.getDay();
                      // A segment gets a rounded, bordered cap at each
                      // end it's actually true (the task's own start/end)
                      // or a week-row boundary - everywhere else it
                      // bridges into the neighboring cell via negative
                      // margin so it reads as one continuous bar.
                      const capLeft = isSameDay(day, taskStart) || weekday === 0;
                      const capRight = isSameDay(day, taskEnd) || weekday === 6;
                      const spans = taskEnd.getTime() !== taskStart.getTime();

                      return (
                        <Link
                          key={t.id}
                          href="/tasks"
                          className={cn(
                            "block text-[10px] leading-tight py-0.5 truncate border-y bg-blue-50 text-blue-800 border-blue-100 hover:bg-blue-100",
                            capLeft ? "rounded-l pl-1.5 border-l" : "-ml-1.5 pl-1.5",
                            capRight ? "rounded-r pr-1.5 border-r" : "-mr-1.5 pr-1.5",
                          )}
                          title={`${t.taskNumber} · ${t.title}${spans ? ` (${format(taskStart, "MMM d")} – ${format(taskEnd, "MMM d")})` : ""}`}
                        >
                          {capLeft ? t.title : " "}
                        </Link>
                      );
                    })}
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
