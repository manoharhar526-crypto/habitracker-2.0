import { Habit } from "@/types/habit";
import { getDaysInMonth, calculateCompletionRate, getCompletedDaysForMonth } from "@/lib/habitUtils";
import { Card } from "@/components/ui/card";
import { Target, CheckCircle2, TrendingUp, Calendar } from "lucide-react";

interface StatsOverviewProps {
  habits: Habit[];
  currentMonth: Date;
}

export const StatsOverview = ({ habits, currentMonth }: StatsOverviewProps) => {
  const daysInMonth = getDaysInMonth(currentMonth);
  const today = new Date();
  const isCurrentMonthViewing = currentMonth.getMonth() === today.getMonth() && 
                                currentMonth.getFullYear() === today.getFullYear();
  const currentDayOfMonth = isCurrentMonthViewing ? today.getDate() : daysInMonth;
  
  const totalPossible = habits.length * currentDayOfMonth;
  const totalCompleted = habits.reduce((sum, h) => {
    const completedDays = getCompletedDaysForMonth(h, currentMonth);
    return sum + completedDays.filter(d => d <= currentDayOfMonth).length;
  }, 0);
  const overallRate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;
  
  const bestHabit = habits.length > 0 
    ? habits.reduce((best, current) => 
        calculateCompletionRate(current, currentMonth, daysInMonth) > calculateCompletionRate(best, currentMonth, daysInMonth) 
          ? current : best
      )
    : null;

  const stats = [
    {
      label: "Total Habits",
      value: habits.length,
      icon: Target,
      delay: "0ms",
    },
    {
      label: "Days Tracked",
      value: currentDayOfMonth,
      icon: Calendar,
      delay: "50ms",
    },
    {
      label: "Completions",
      value: totalCompleted,
      icon: CheckCircle2,
      delay: "100ms",
    },
    {
      label: "Overall Rate",
      value: `${overallRate}%`,
      icon: TrendingUp,
      delay: "150ms",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      {stats.map((stat) => (
        <Card 
          key={stat.label} 
          className="p-3 sm:p-4 animate-slide-up bg-card border-border"
          style={{ animationDelay: stat.delay }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-xl sm:text-2xl font-bold mt-1">{stat.value}</p>
            </div>
            <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
          </div>
        </Card>
      ))}
      {bestHabit && (
        <Card 
          className="p-3 sm:p-4 animate-slide-up bg-card border-border col-span-2 lg:col-span-4"
          style={{ animationDelay: "200ms" }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm text-muted-foreground">Best Performing Habit</p>
              <p className="text-sm sm:text-lg font-semibold mt-1 truncate">{bestHabit.name}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xl sm:text-2xl font-bold">
                {calculateCompletionRate(bestHabit, currentMonth, daysInMonth)}%
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">completion rate</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
