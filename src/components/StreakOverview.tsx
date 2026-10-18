import { Card } from "@/components/ui/card";
import { Flame, Trophy, Sparkles } from "lucide-react";
import type { Habit } from "@/types/habit";
import { calculateBestStreak, calculateTotalStreak } from "@/lib/habitUtils";

interface StreakOverviewProps {
  /** Every habit ever created — streaks run across months. */
  allHabits: Habit[];
  /** Habits shown for the month currently open. */
  habits: Habit[];
  frozenDates?: string[];
}

export const StreakOverview = ({ allHabits, habits, frozenDates = [] }: StreakOverviewProps) => {
  if (habits.length === 0) return null;

  // Match this month's habits to their full history by name.
  const rows = habits
    .map(habit => {
      const history = allHabits.filter(h => h.name === habit.name);
      const merged: Habit = {
        ...habit,
        completedDays: history.flatMap(h => h.completedDays ?? []),
        skippedDays: history.flatMap(h => h.skippedDays ?? []),
      };
      return {
        name: habit.name,
        current: calculateTotalStreak(merged, frozenDates),
        best: calculateBestStreak(merged, frozenDates),
      };
    })
    .sort((a, b) => b.current - a.current || b.best - a.best);

  const topCurrent = rows[0]?.current ?? 0;
  const topBest = rows.reduce((max, r) => Math.max(max, r.best), 0);
  const onFire = rows.filter(r => r.current > 0).length;

  const summary = [
    { label: "Best streak running", value: `${topCurrent}d`, icon: Flame },
    { label: "Longest ever", value: `${topBest}d`, icon: Trophy },
    { label: "Habits on a roll", value: `${onFire}/${rows.length}`, icon: Sparkles },
  ];

  return (
    <Card className="border-border overflow-hidden animate-slide-up">
      <div className="p-3 sm:p-4 border-b border-border">
        <h2 className="font-semibold text-sm sm:text-base">Streaks</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Days in a row, counted across every month
        </p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {summary.map(item => (
          <div key={item.label} className="p-3 sm:p-4">
            <item.icon className="w-4 h-4 text-muted-foreground mb-1.5" />
            <p className="text-xl sm:text-2xl font-bold leading-none">{item.value}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <ul className="divide-y divide-border">
        {rows.map(row => (
          <li key={row.name} className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5">
            <span className="text-sm truncate">{row.name}</span>
            <span className="flex items-center gap-3 flex-shrink-0">
              <span
                className={`flex items-center gap-1 text-sm font-semibold ${
                  row.current > 0 ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                {row.current}
              </span>
              <span className="text-xs text-muted-foreground">best {row.best}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
};
