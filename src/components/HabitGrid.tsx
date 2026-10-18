import { memo, useCallback, useMemo, useState } from "react";
import { Habit } from "@/types/habit";
import {
  getDaysInMonth, getDayOfWeek, getWeekNumber,
  calculateCompletionRate, isDayCompleted, getCompletedDaysForMonth,
  calculateTotalStreak,
} from "@/lib/habitUtils";
import { Check, Trash2, Flame, X, GripVertical, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface HabitGridProps {
  habits: Habit[];
  currentMonth: Date;
  onToggleDay: (habitId: string, day: number) => void;
  onDeleteHabit: (habitId: string) => void;
  onReorderHabits?: (reordered: Habit[]) => void;
  onRenameHabit?: (habitId: string, newName: string) => void;
  frozenDates?: string[];
}

const getCompletionColorClass = (rate: number): string => {
  if (rate >= 80) return "bg-foreground";
  if (rate >= 60) return "bg-primary";
  if (rate >= 40) return "bg-muted-foreground";
  return "bg-secondary-foreground";
};

const getCompletionTextClass = (rate: number): string => {
  if (rate >= 80) return "text-foreground";
  if (rate >= 60) return "text-primary";
  if (rate >= 40) return "text-muted-foreground";
  return "text-secondary-foreground";
};

// Memoized single day cell
const DayCell = memo(({
  day, isCompleted, canToggle, isMissed, dayIsFuture, isToday, isYesterday, isSkipped, onToggle,
}: {
  day: number; isCompleted: boolean; canToggle: boolean; isMissed: boolean;
  dayIsFuture: boolean; isToday: boolean; isYesterday: boolean; isSkipped: boolean;
  onToggle: (day: number) => void;
}) => (
  <td className="p-0 border-l border-border">
    <button
      onClick={() => canToggle && !isSkipped && onToggle(day)}
      disabled={!canToggle || isSkipped}
      title={
        isSkipped ? "⊘ N/A (skipped)" :
        isCompleted ? "✓ Completed" :
        canToggle ? "Click to complete" :
        isMissed ? "✗ Missed" : "Upcoming"
      }
      className={cn(
        "w-7 sm:w-10 h-7 sm:h-10 flex items-center justify-center transition-all duration-200",
        (isToday || isYesterday) && "ring-2 ring-primary ring-inset",
        isSkipped
          ? "bg-orange-500/15 cursor-not-allowed"
          : isCompleted
          ? "bg-primary"
          : isMissed && canToggle
          ? "bg-background hover:bg-muted cursor-pointer"
          : isMissed
          ? "bg-background"
          : dayIsFuture
          ? "bg-muted/50 cursor-not-allowed"
          : "bg-background hover:bg-muted",
        !canToggle && !isCompleted && !isSkipped && "cursor-not-allowed opacity-70"
      )}
    >
      {isSkipped && <span className="text-[10px] sm:text-xs text-orange-400 font-bold">⊘</span>}
      {!isSkipped && isCompleted && <Check className="w-3 h-3 sm:w-4 sm:h-4 text-primary-foreground animate-check-bounce" strokeWidth={3} />}
      {!isSkipped && isMissed && !canToggle && <X className="w-3 h-3 sm:w-4 sm:h-4 text-foreground/30" strokeWidth={2.5} />}
    </button>
  </td>
));

export const HabitGrid = memo(({
  habits, currentMonth, onToggleDay, onDeleteHabit, onReorderHabits, onRenameHabit, frozenDates = [],
}: HabitGridProps) => {
  const daysInMonth = useMemo(() => getDaysInMonth(currentMonth), [currentMonth]);
  const today = useMemo(() => new Date(), []);
  const todayDay = today.getDate();
  const isCurrentMonth = today.getFullYear() === currentMonth.getFullYear() &&
                         today.getMonth() === currentMonth.getMonth();

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const isToday = useCallback((day: number) => isCurrentMonth && day === todayDay, [isCurrentMonth, todayDay]);
  const isYesterday = useCallback((day: number) => {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.getFullYear() === currentMonth.getFullYear() &&
      yesterday.getMonth() === currentMonth.getMonth() &&
      day === yesterday.getDate();
  }, [today, currentMonth]);
  const isPast = useCallback((day: number) => {
    if (!isCurrentMonth) return currentMonth < new Date(today.getFullYear(), today.getMonth(), 1);
    return day < todayDay;
  }, [isCurrentMonth, currentMonth, today, todayDay]);
  const isFuture = useCallback((day: number) => {
    if (!isCurrentMonth) return currentMonth > new Date(today.getFullYear(), today.getMonth(), 1);
    return day > todayDay;
  }, [isCurrentMonth, currentMonth, today, todayDay]);

  const weeks = useMemo(() => {
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const result: { week: number; days: number[] }[] = [];
    days.forEach(day => {
      const weekNum = getWeekNumber(currentMonth, day);
      const existing = result.find(w => w.week === weekNum);
      if (existing) existing.days.push(day);
      else result.push({ week: weekNum, days: [day] });
    });
    return result;
  }, [daysInMonth, currentMonth]);

  // Stable per-habit toggle callbacks so memoized DayCells skip re-rendering.
  const togglerCache = useMemo(() => new Map<string, (day: number) => void>(), [onToggleDay]);
  const getToggler = (habitId: string) => {
    let fn = togglerCache.get(habitId);
    if (!fn) { fn = (day: number) => onToggleDay(habitId, day); togglerCache.set(habitId, fn); }
    return fn;
  };

  const getDayHabitStats = useCallback((day: number) => {
    const completedCount = habits.filter(h => isDayCompleted(h, currentMonth, day)).length;
    const totalCount = habits.length;
    const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    return { completedCount, totalCount, percentage };
  }, [habits, currentMonth]);

  // Drag handlers
  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId || !onReorderHabits) return;
    const reordered = [...habits];
    const fromIdx = reordered.findIndex(h => h.id === draggedId);
    const toIdx = reordered.findIndex(h => h.id === targetId);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    onReorderHabits(reordered.map((h, i) => ({ ...h, order: i })));
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  const startRename = (habit: Habit) => {
    setRenamingId(habit.id);
    setRenameValue(habit.name);
  };
  const commitRename = (habitId: string) => {
    if (renameValue.trim() && onRenameHabit) {
      onRenameHabit(habitId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className="overflow-x-auto animate-fade-in -mx-3 sm:mx-0 px-3 sm:px-0">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="w-44 sm:w-56 p-2 sm:p-3 text-left font-semibold text-foreground text-xs sm:text-sm sticky left-0 bg-card z-10">
              Habits
            </th>
            {weeks.map((week, idx) => (
              <th key={week.week} colSpan={week.days.length} className="border-l border-border p-0">
                <div className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1">W{idx + 1}</div>
              </th>
            ))}
            <th className="w-24 sm:w-32 p-2 sm:p-3 font-semibold text-foreground border-l border-border text-center text-[10px] sm:text-sm">Progress</th>
            <th className="w-14 sm:w-16 p-2 sm:p-3 font-semibold text-foreground border-l border-border text-center text-[10px] sm:text-sm">
              <Flame className="w-3 h-3 sm:w-4 sm:h-4 mx-auto text-muted-foreground" />
            </th>
          </tr>
          <tr className="border-b border-border">
            <th className="w-44 sm:w-56 p-0 sticky left-0 bg-card z-10"></th>
            {weeks.map(week =>
              week.days.map(day => {
                const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const frozen = frozenDates.includes(dateStr);
                return (
                  <th key={day} className={cn("w-7 sm:w-10 text-center p-0.5 sm:p-1 border-l border-border font-normal", isToday(day) && "bg-primary/20")}>
                    <div className="text-[8px] sm:text-[10px] text-muted-foreground">{getDayOfWeek(currentMonth, day)}</div>
                    <div className={cn("text-[10px] sm:text-xs font-medium", isToday(day) && "text-primary font-bold")}>{day}</div>
                  </th>
                );
              })
            )}
            <th className="w-24 sm:w-32 p-0 border-l border-border"></th>
            <th className="w-14 sm:w-16 p-0 border-l border-border"></th>
          </tr>
        </thead>

        <tbody>
          {/* Total Stats Row */}
          <tr className="border-b border-border bg-muted/30">
            <td className="w-44 sm:w-56 p-2 sm:p-3 font-semibold text-foreground sticky left-0 bg-muted/30 z-10">
              <div className="text-[10px] sm:text-xs text-muted-foreground">Daily Totals</div>
            </td>
            {weeks.map(week =>
              week.days.map(day => {
                const stats = getDayHabitStats(day);
                return (
                  <td key={day} className="w-7 sm:w-10 h-7 sm:h-10 text-center border-l border-border text-[7px] sm:text-[9px]">
                    <span className="font-medium text-foreground">{stats.completedCount}</span>
                    <br />
                    <span className="text-muted-foreground">{stats.percentage}%</span>
                  </td>
                );
              })
            )}
            <td className="w-24 sm:w-32 p-2 border-l border-border"></td>
            <td className="w-14 sm:w-16 p-2 border-l border-border"></td>
          </tr>

          {/* Habit Rows */}
          {habits.map((habit, habitIdx) => {
            const completionRate = calculateCompletionRate(habit, currentMonth, daysInMonth);
            const streak = calculateTotalStreak(habit, frozenDates);
            const completedDaysCount = getCompletedDaysForMonth(habit, currentMonth).length;
            const isDragging = draggedId === habit.id;
            const isDragOver = dragOverId === habit.id;

            return (
              <tr
                key={habit.id}
                draggable
                onDragStart={() => handleDragStart(habit.id)}
                onDragOver={(e) => handleDragOver(e, habit.id)}
                onDrop={() => handleDrop(habit.id)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "border-b border-border transition-colors hover:bg-muted/50 group",
                  habitIdx % 2 === 0 ? "bg-background" : "bg-secondary/30",
                  isDragging && "opacity-40",
                  isDragOver && "border-t-2 border-t-primary",
                )}
              >
                <td className={cn(
                  "w-44 sm:w-56 p-2 sm:p-3 sticky left-0 z-10",
                  habitIdx % 2 === 0 ? "bg-background" : "bg-secondary/30",
                  "group-hover:bg-muted/50",
                )}>
                  {renamingId === habit.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(habit.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(habit.id);
                          if (e.key === 'Escape') { setRenamingId(null); setRenameValue(""); }
                        }}
                        className="h-6 text-xs px-1"
                        autoFocus
                        maxLength={40}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <GripVertical className="w-3 h-3 text-muted-foreground/40 cursor-grab flex-shrink-0 hidden sm:block" />
                      <button
                        onClick={() => onDeleteHabit(habit.id)}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground flex-shrink-0"
                        title="Delete habit"
                      >
                        <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                      <span
                        className="font-medium text-foreground truncate text-xs sm:text-sm flex-1"
                        title={`${habit.name} - ${completedDaysCount} days completed this month`}
                      >
                        {habit.name}
                      </span>
                      {onRenameHabit && (
                        <button
                          onClick={() => startRename(habit)}
                          className="p-1 hover:bg-muted rounded text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Rename habit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
                {weeks.map(week =>
                  week.days.map(day => {
                    const isCompleted = isDayCompleted(habit, currentMonth, day);
                    const dayIsToday = isToday(day);
                    const dayIsPast = isPast(day);
                    const dayIsFuture = isFuture(day);
                    const isMissed = dayIsPast && !isCompleted;
                    const dayIsYesterday = isYesterday(day);
                    const canToggle = dayIsToday || dayIsYesterday;
                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isSkipped = (habit.skippedDays ?? []).includes(dateStr);
                    return (
                      <DayCell
                        key={day}
                        day={day}
                        isCompleted={isCompleted}
                        canToggle={canToggle}
                        isMissed={isMissed && !isSkipped}
                        dayIsFuture={dayIsFuture}
                        isToday={dayIsToday}
                        isYesterday={dayIsYesterday}
                        isSkipped={isSkipped}
                        onToggle={getToggler(habit.id)}
                      />
                    );
                  })
                )}
                <td className="w-24 sm:w-32 p-2 sm:p-3 border-l border-border">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 sm:h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full transition-all duration-500 ease-out", getCompletionColorClass(completionRate))}
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                    <span className={cn("text-xs sm:text-sm font-bold min-w-[3rem] text-right", getCompletionTextClass(completionRate))}>
                      {completionRate}%
                    </span>
                  </div>
                </td>
                <td className="w-14 sm:w-16 p-2 border-l border-border text-center">
                  {streak > 0 ? (
                    <div className="flex items-center justify-center gap-0.5 text-foreground" title={`${streak} day streak`}>
                      <Flame className="w-3 h-3 sm:w-4 sm:h-4 text-foreground" />
                      <span className="text-xs sm:text-sm font-bold">{streak}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {habits.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">No habits yet. Add your first habit to get started!</p>
        </div>
      )}
    </div>
  );
});
