import { useMemo, useState } from "react";
import { Habit } from "@/types/habit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDaysInMonth, createDateString, isDayCompleted } from "@/lib/habitUtils";
import { CalendarX2, Info } from "lucide-react";
import { toast } from "sonner";

interface HabitCalendarProps {
  habits: Habit[];
  currentMonth: Date;
  onToggleSkipDay: (habitId: string, dateStr: string) => void;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const HabitCalendar = ({ habits, currentMonth, onToggleSkipDay }: HabitCalendarProps) => {
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(
    habits.length > 0 ? habits[0].id : null
  );

  const daysInMonth = useMemo(() => getDaysInMonth(currentMonth), [currentMonth]);
  const firstDayOfWeek = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay(),
    [currentMonth]
  );

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const isCurrentMonth =
    today.getFullYear() === currentMonth.getFullYear() &&
    today.getMonth() === currentMonth.getMonth();

  const selectedHabit = habits.find((h) => h.id === selectedHabitId) ?? null;
  const skippedDays = selectedHabit?.skippedDays ?? [];

  const toDateStr = (day: number) => createDateString(currentMonth, day);

  const handleDayClick = (day: number) => {
    if (!selectedHabit) return;
    const dateStr = toDateStr(day);

    // Don't allow skipping future days
    const dayDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    if (isCurrentMonth && dayDate > today) {
      toast.error("Can't skip future days");
      return;
    }

    const isCompleted = isDayCompleted(selectedHabit, currentMonth, day);
    if (isCompleted) {
      toast.error("Day is already marked as completed — uncheck it first");
      return;
    }

    const isSkipped = skippedDays.includes(dateStr);
    onToggleSkipDay(selectedHabit.id, dateStr);
    if (isSkipped) {
      toast.success(`Restored day ${day} for "${selectedHabit.name}"`);
    } else {
      toast.success(`Day ${day} marked as N/A for "${selectedHabit.name}" ⊘`);
    }
  };

  // Build calendar grid
  const calendarCells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const skippedCount = skippedDays.filter((d) => {
    const prefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-`;
    return d.startsWith(prefix);
  }).length;

  if (habits.length === 0) return null;

  return (
    <Card className="p-3 sm:p-4 border-border">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarX2 className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm sm:text-base">Habit Skip Days</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mark specific days as N/A for individual habits — e.g. college closed on Sunday.
            Skipped days won't count against your completion rate.
          </p>
        </div>
        {skippedCount > 0 && (
          <Badge variant="secondary" className="self-start whitespace-nowrap">
            ⊘ {skippedCount} skipped this month
          </Badge>
        )}
      </div>

      {/* Habit selector */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {habits.map((habit) => {
          const habitSkipped = (habit.skippedDays ?? []).filter((d) => {
            const prefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-`;
            return d.startsWith(prefix);
          }).length;
          return (
            <button
              key={habit.id}
              onClick={() => setSelectedHabitId(habit.id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                selectedHabitId === habit.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {habit.name}
              {habitSkipped > 0 && (
                <span className={cn("ml-1 text-[10px]", selectedHabitId === habit.id ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
                  ⊘{habitSkipped}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Calendar grid */}
      <div className="select-none">
        {/* Day labels */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7 gap-0.5">
          {calendarCells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} />;

            const dateStr = toDateStr(day);
            const isToday = isCurrentMonth && day === today.getDate();
            const isFuture =
              isCurrentMonth
                ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day) > today
                : currentMonth > new Date(today.getFullYear(), today.getMonth(), 1);

            const isCompleted = selectedHabit ? isDayCompleted(selectedHabit, currentMonth, day) : false;
            const isSkipped = skippedDays.includes(dateStr);

            return (
              <button
                key={day}
                onClick={() => handleDayClick(day)}
                disabled={isFuture || isCompleted}
                title={
                  isFuture
                    ? "Future day"
                    : isCompleted
                    ? "Already completed — uncheck first to skip"
                    : isSkipped
                    ? `Click to restore day ${day}`
                    : `Click to mark day ${day} as N/A`
                }
                className={cn(
                  "aspect-square flex flex-col items-center justify-center rounded-md text-xs font-medium transition-all",
                  "border",
                  // Today ring
                  isToday && "ring-2 ring-primary ring-offset-1",
                  // States
                  isCompleted
                    ? "bg-primary/20 border-primary/30 text-primary cursor-not-allowed"
                    : isSkipped
                    ? "bg-orange-500/20 border-orange-500/40 text-orange-500 hover:bg-orange-500/30"
                    : isFuture
                    ? "bg-muted/30 border-border/50 text-muted-foreground/40 cursor-not-allowed"
                    : "bg-background border-border text-foreground hover:bg-muted cursor-pointer"
                )}
              >
                <span className="text-[11px] sm:text-xs">{day}</span>
                {isCompleted && <span className="text-[8px] leading-none">✓</span>}
                {isSkipped && <span className="text-[8px] leading-none">⊘</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-primary/20 border border-primary/30" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-orange-500/20 border border-orange-500/40" />
          <span>Skipped / N/A</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-background border border-border" />
          <span>Not done</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Info className="w-3 h-3" />
          <span>Skipped days excluded from % rate</span>
        </div>
      </div>
    </Card>
  );
};
