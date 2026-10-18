import { readWidgetPrefs } from "@/lib/widgetPrefs";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useToday } from "@/hooks/useToday";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  loadAppStorage, saveAppStorage, loadCalendarNotes, saveCalendarNotes,
} from "@/lib/appStorage";
import { CalendarView } from "@/components/CalendarView";
import {
  getDaysInMonth, getHabitsForMonth, createDateString,
  getCompletedDaysForMonth, calculateCompletionRate, getAllTimeStats, calculateTotalStreak,
  toggleHabitDayMark,
} from "@/lib/habitUtils";
import { getTasksByType } from "@/lib/taskUtils";
import { HabitCalendar } from "@/components/HabitCalendar";
import { Habit } from "@/types/habit";
import { Task } from "@/types/task";
import { CalendarNote } from "@/types/calendarNote";
import { syncWidgetData } from "@/services/widgetSync";
import {
  ArrowLeft, LayoutGrid, BarChart3, PieChart,
  Trophy, CheckCircle2, Flame, ListChecks,
} from "lucide-react";
import { toast } from "sonner";

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Run heavy work after the tap has painted so the tick shows instantly. */
const afterPaint = (fn: () => void) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(fn, 0));
  else setTimeout(fn, 0);
};

export default function Widgets() {
  const navigate = useNavigate();
  const { user, username } = useAuth();
  const userId = user?.id;

  const [habits, setHabits] = useState<Habit[]>(() => loadAppStorage(userId)?.habits ?? []);
  const [tasks, setTasks] = useState<Task[]>(() => loadAppStorage(userId)?.tasks ?? []);
  const [notes, setNotes] = useState<CalendarNote[]>(() => loadCalendarNotes(userId));
  const frozenDates = useMemo<string[]>(() => [], []);

  // Always-fresh refs so taps never act on stale data, even hours later.
  const habitsRef = useRef(habits);
  const tasksRef = useRef(tasks);
  const notesRef = useRef(notes);
  habitsRef.current = habits;
  tasksRef.current = tasks;
  notesRef.current = notes;

  // Reload from storage when the user id resolves or the app comes back to the foreground.
  const reload = useCallback(() => {
    const s = loadAppStorage(userId);
    if (s) {
      setHabits(s.habits ?? []);
      setTasks(s.tasks ?? []);
    }
    setNotes(loadCalendarNotes(userId));
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const now = useToday();
  const today = dayKey(now);
  const yesterday = useMemo(() => {
    const y = new Date(now); y.setDate(y.getDate() - 1); return dayKey(y);
  }, [now]);
  const monthKey = today.slice(0, 7);
  const totalDaysInMonth = getDaysInMonth(now);

  const widgetPrefs = useMemo(() => readWidgetPrefs(), []);
  const monthHabits = useMemo(
    () => getHabitsForMonth(habits, now).filter(h => !widgetPrefs.habits.includes(h.id)),
    [habits, now, widgetPrefs.habits]
  );

  // Save + sync are deferred and coalesced so rapid taps stay smooth.
  const pendingSave = useRef(false);
  const persist = useCallback(() => {
    if (pendingSave.current) return;
    pendingSave.current = true;
    afterPaint(() => {
      pendingSave.current = false;
      const h = habitsRef.current, t = tasksRef.current;
      const stored = loadAppStorage(userId);
      saveAppStorage({ habits: h, tasks: t, currentMonth: stored?.currentMonth ?? new Date() }, userId);
      void syncWidgetData({ habits: h, tasks: t, notes: notesRef.current, frozenDates }).catch(() => {});
    });
  }, [userId, frozenDates]);

  const handleToggleHabitDay = useCallback((habitId: string, dateStr: string) => {
    const nowKey = dayKey(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (dateStr !== nowKey && dateStr !== dayKey(y)) {
      toast.error("Can only complete today or yesterday");
      return;
    }
    const habit = habitsRef.current.find(h => h.id === habitId);
    if (habit?.skippedDays?.includes(dateStr) && !habit.completedDays.includes(dateStr)) {
      toast.error("Remove the N/A mark first, then mark it done");
      return;
    }
    const next = habitsRef.current.map(h =>
      h.id === habitId ? toggleHabitDayMark(h, dateStr, "complete") : h
    );
    habitsRef.current = next;
    setHabits(next);
    persist();
  }, [persist]);

  const handleToggleSkipDay = useCallback((habitId: string, dateStr: string) => {
    const next = habitsRef.current.map(h =>
      h.id === habitId ? toggleHabitDayMark(h, dateStr, "skip") : h
    );
    habitsRef.current = next;
    setHabits(next);
    persist();
  }, [persist]);

  const handleToggleTask = useCallback((taskId: string) => {
    const next = tasksRef.current.map(t => (t.id === taskId ? { ...t, completed: !t.completed } : t));
    tasksRef.current = next;
    setTasks(next);
    persist();
  }, [persist]);


  // ─── Widget data helpers ────────────────────────────────────────────────────

  const allTime = useMemo(() => getAllTimeStats(habits, frozenDates), [habits, frozenDates]);

  const analytics = useMemo(
    () =>
      monthHabits
        .map((h) => ({
          name: h.name,
          pct: calculateCompletionRate(h, now, totalDaysInMonth),
          completed: getCompletedDaysForMonth(h, now).length,
        }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5),
    [monthHabits, now, totalDaysInMonth]
  );


  const saveNotes = (next: CalendarNote[]) => {
    notesRef.current = next;
    setNotes(next);
    afterPaint(() => {
      saveCalendarNotes(next, userId);
      void syncWidgetData({ habits: habitsRef.current, tasks: tasksRef.current, notes: next, frozenDates }).catch(() => {});
    });
  };
  const handleAddNote = (note: CalendarNote) => saveNotes([...notesRef.current, note]);
  const handleDeleteNote = (id: string) => saveNotes(notesRef.current.filter((n) => n.id !== id));
  const handleEditNote = (id: string, updated: Partial<CalendarNote>) =>
    saveNotes(notesRef.current.map((n) => (n.id === id ? { ...n, ...updated } : n)));

  const habitReports = useMemo(
    () =>
      monthHabits.map((h) => ({
        name: h.name,
        completed: getCompletedDaysForMonth(h, now).length,
        total: totalDaysInMonth,
        rate: calculateCompletionRate(h, now, totalDaysInMonth),
        streak: calculateTotalStreak(h, frozenDates),
      })),
    [monthHabits, now, totalDaysInMonth, frozenDates]
  );

  const taskReports = useMemo(() => {
    const monthTasks = tasks.filter((t) => !t.month || t.month === monthKey);
    const dayNum = now.getDate();
    const weekNum = Math.ceil(
      (dayNum + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7
    );

    const daily = monthTasks.filter((t) => t.type === "daily" && t.day === dayNum);
    const weekly = monthTasks.filter((t) => t.type === "weekly" && t.weekNumber === weekNum);
    const monthly = monthTasks.filter((t) => t.type === "monthly");
    const general = getTasksByType(monthTasks, "general");

    return [
      { title: "Daily", done: daily.filter((t) => t.completed).length, total: daily.length, tasks: daily },
      { title: "Weekly", done: weekly.filter((t) => t.completed).length, total: weekly.length, tasks: weekly },
      { title: "Monthly", done: monthly.filter((t) => t.completed).length, total: monthly.length, tasks: monthly },
      { title: "General", done: general.filter((t) => t.completed).length, total: general.length, tasks: general },
    ];
  }, [tasks, monthKey, now]);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const WidgetHeader = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="p-1.5 rounded-md bg-primary/10">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold truncate">{title}</h3>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-8 w-8 flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">Widgets</h1>
                <p className="text-xs text-muted-foreground truncate">{username ? `Hello, ${username}` : "Home screen preview"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => navigate("/")} className="hidden sm:flex gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                Back to app
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <p className="text-sm text-muted-foreground mb-4 sm:mb-6">
          These are the same widgets that appear on your Android home screen. Tap a habit day in the Monthly Tracking Grid to check it off.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {/* 1. Monthly Tracking Grid */}
          <Card className="p-4 border-border bg-card md:col-span-2 xl:col-span-2">
            <WidgetHeader icon={LayoutGrid} title="Monthly Tracking Grid" subtitle={now.toLocaleString("default", { month: "long", year: "numeric" })} />
            {monthHabits.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No habits for this month</div>
            ) : (
              <div className="space-y-3">
                {monthHabits.slice(0, 5).map((habit) => {
                  const completedDays = getCompletedDaysForMonth(habit, now);
                  const skipped = new Set((habit.skippedDays ?? []).filter((d) => d.startsWith(`${monthKey}-`)).map((d) => parseInt(d.slice(-2), 10)));
                  return (
                    <div key={habit.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate max-w-[60%]">{habit.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {completedDays.length}/{totalDaysInMonth}
                        </span>
                      </div>
                      <div className="grid grid-cols-7 sm:grid-cols-[repeat(31,minmax(0,1fr))] gap-0.5">
                        {Array.from({ length: totalDaysInMonth }, (_, i) => i + 1).map((day) => {
                          const dateStr = createDateString(now, day);
                          const isCompleted = completedDays.includes(day);
                          const isSkipped = skipped.has(day);
                          const isFrozen = !isCompleted && !isSkipped && frozenDates.includes(dateStr);
                          const isToday = dateStr === today;
                          const canToggle = isToday || dateStr === yesterday;

                          return (
                            <button
                              key={day}
                              type="button"
                              onPointerDown={canToggle ? (e) => { e.preventDefault(); handleToggleHabitDay(habit.id, dateStr); } : undefined}
                              onKeyDown={canToggle ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggleHabitDay(habit.id, dateStr); } } : undefined}
                              disabled={!canToggle && !isCompleted && !isSkipped && !isFrozen}
                              aria-current={isToday ? "date" : undefined}
                              className={cn(
                                "aspect-square rounded-[2px] text-[9px] sm:text-[10px] font-medium flex items-center justify-center touch-manipulation select-none active:scale-90 transition-transform duration-75",
                                isCompleted
                                  ? "bg-primary text-primary-foreground"
                                  : isSkipped
                                  ? "bg-yellow-500/30 text-yellow-400"
                                  : isFrozen
                                  ? "bg-blue-500/30 text-blue-400"
                                  : isToday
                                  ? "bg-primary/25 text-primary font-bold"
                                  : "bg-muted/50 text-muted-foreground",
                                isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                                canToggle && !isCompleted && !isSkipped && "hover:bg-muted cursor-pointer",
                                !canToggle && !isCompleted && !isSkipped && !isFrozen && "opacity-50 cursor-default"
                              )}
                              title={day.toString()}
                            >
                              {isCompleted ? "✓" : isSkipped ? "–" : day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary" /> Done</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/30" /> N/A</span>
              
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted/50 border border-border" /> Pending</span>
              <span className="ml-auto">Tap today/yesterday to toggle</span>
            </div>
          </Card>

          {/* 2. Habit Skip Days — same component & behaviour as the app */}
          <HabitCalendar
            habits={monthHabits}
            currentMonth={now}
            onToggleSkipDay={handleToggleSkipDay}
          />

          {/* 3. Habit Analytics + All-Time Statistics (combined) */}
          <Card className="p-4 border-border bg-card">
            <WidgetHeader icon={BarChart3} title="Habit Analytics" subtitle="Performance & all-time stats" />

            {analytics.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No habits to analyze</div>
            ) : (
              <div className="space-y-3">
                {analytics.map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate max-w-[65%]">{item.name}</span>
                      <span className="font-bold">{item.pct}%</span>
                    </div>
                    <Progress value={item.pct} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold">All-Time Statistics</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-md bg-muted/40">
                  <p className="text-[10px] text-muted-foreground">Completions</p>
                  <p className="text-xl font-bold">{allTime.totalCompletions}</p>
                </div>
                <div className="p-2.5 rounded-md bg-muted/40">
                  <p className="text-[10px] text-muted-foreground">Months</p>
                  <p className="text-xl font-bold">{allTime.totalMonths}</p>
                </div>
                <div className="p-2.5 rounded-md bg-muted/40">
                  <p className="text-[10px] text-muted-foreground">Rate</p>
                  <p className="text-xl font-bold">{allTime.allTimeRate}%</p>
                </div>
              </div>
              {allTime.bestHabit && (
                <div className="mt-3 p-2.5 rounded-md bg-primary/10">
                  <p className="text-[10px] text-muted-foreground">Best Habit</p>
                  <p className="text-sm font-semibold truncate">{allTime.bestHabit.name}</p>
                </div>
              )}
            </div>
          </Card>

          {/* 4. Calendar — same component & behaviour as the app */}
          <CalendarView
            notes={notes}
            onAddNote={handleAddNote}
            onDeleteNote={handleDeleteNote}
            onEditNote={handleEditNote}
          />


          {/* 6. Habit Reports */}
          <Card className="p-4 border-border bg-card">
            <WidgetHeader icon={PieChart} title="Habit Reports" subtitle="Monthly per-habit summary" />
            {habitReports.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No habits this month</div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {habitReports.map((item) => (
                  <div key={item.name} className="p-2.5 rounded-md bg-muted/40 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate max-w-[60%]">{item.name}</span>
                      <span className="font-bold">{item.rate}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{item.completed}/{item.total} days</span>
                      {item.streak > 0 && <span className="flex items-center gap-0.5"><Flame className="w-3 h-3" /> {item.streak}d</span>}
                    </div>
                    <Progress value={item.rate} className="h-1" />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 7. Task Reports */}
          <Card className="p-4 border-border bg-card">
            <WidgetHeader icon={ListChecks} title="Task Reports" subtitle="Task completion by type" />
            {taskReports.every((r) => r.total === 0) ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No tasks set</div>
            ) : (
              <div className="space-y-3">
                {taskReports.map((report) => (
                  <div key={report.title} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{report.title}</span>
                      <span className="font-bold">{report.total > 0 ? Math.round((report.done / report.total) * 100) : 0}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={report.total > 0 ? (report.done / report.total) * 100 : 0} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{report.done}/{report.total}</span>
                    </div>
                    {report.tasks.length > 0 && (
                      <div className="space-y-1 pt-1">
                        {report.tasks.slice(0, 3).map((task) => (
                          <button
                            key={task.id}
                            onClick={() => handleToggleTask(task.id)}
                            className="w-full flex items-center gap-1.5 text-[10px] text-left touch-manipulation hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                          >
                            <span className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0", task.completed ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                              {task.completed && <CheckCircle2 className="w-3 h-3" />}
                            </span>
                            <span className={cn("truncate", task.completed && "line-through text-muted-foreground")}>{task.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
