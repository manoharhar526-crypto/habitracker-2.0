import { Habit } from "@/types/habit";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getDaysInMonth, isDayCompleted, calculateTotalStreak } from "@/lib/habitUtils";
import { Flame, TrendingUp, Award, BarChart3 } from "lucide-react";

interface HabitReportCardProps {
  habits: Habit[];
  currentMonth: Date;
  frozenDates?: string[];
}

export const HabitReportCard = ({ habits, currentMonth, frozenDates = [] }: HabitReportCardProps) => {
  const daysInMonth = getDaysInMonth(currentMonth);
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === currentMonth.getFullYear() &&
    today.getMonth() === currentMonth.getMonth();
  const daysElapsed = isCurrentMonth ? today.getDate() : daysInMonth;

  // Per-habit stats
  const habitStats = habits.map((habit) => {
    let completed = 0;
    for (let d = 1; d <= daysElapsed; d++) {
      if (isDayCompleted(habit, currentMonth, d)) completed++;
    }
    const rate = daysElapsed > 0 ? Math.round((completed / daysElapsed) * 100) : 0;

    // Use cross-month streak (total active streak)
    const streak = calculateTotalStreak(habit, frozenDates);

    return { habit, completed, rate, streak };
  });

  const totalPossible = habits.length * daysElapsed;
  const totalCompleted = habitStats.reduce((s, h) => s + h.completed, 0);
  const overallRate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

  const bestHabit = habitStats.length > 0
    ? habitStats.reduce((best, h) => (h.rate > best.rate ? h : best))
    : null;
  const longestStreak = habitStats.length > 0
    ? habitStats.reduce((best, h) => (h.streak > best.streak ? h : best))
    : null;

  return (
    <div className="space-y-4">
      {/* Overall Habit Summary */}
      <Card className="p-6 border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Habit Summary</h3>
          <span className="text-2xl font-bold">{overallRate}%</span>
        </div>
        <Progress value={overallRate} className="h-3 mb-2" />
        <p className="text-sm text-muted-foreground">
          {totalCompleted} of {totalPossible} habit-days completed ({daysElapsed} days elapsed)
        </p>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-medium text-sm">Total Habits</h4>
          </div>
          <span className="text-2xl font-bold">{habits.length}</span>
        </Card>

        {bestHabit && (
          <Card className="p-4 border-border">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">Best Habit</h4>
            </div>
            <span className="text-sm font-bold truncate block">{bestHabit.habit.name}</span>
            <span className="text-xs text-muted-foreground">{bestHabit.rate}% completion</span>
          </Card>
        )}

      </div>

      {/* Per-Habit Breakdown */}
      <div className="space-y-3">
        {habitStats.map(({ habit, completed, rate, streak }) => (
          <Card key={habit.id} className="p-4 border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm truncate">{habit.name}</span>
                {streak > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5 flex-shrink-0">
                    <Flame className="w-3 h-3" /> {streak}d
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground">{completed}/{daysElapsed}</span>
                <span className="text-sm font-bold">{rate}%</span>
              </div>
            </div>
            <Progress value={rate} className="h-2" />
          </Card>
        ))}
      </div>
    </div>
  );
};
