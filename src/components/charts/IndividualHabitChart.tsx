import { Habit } from "@/types/habit";
import { getDaysInMonth, isDayCompleted, getCompletedDaysForMonth } from "@/lib/habitUtils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

interface IndividualHabitChartProps {
  habits: Habit[];
  currentMonth: Date;
}

export const IndividualHabitChart = ({ habits, currentMonth }: IndividualHabitChartProps) => {
  const [selectedHabitId, setSelectedHabitId] = useState<string>(habits[0]?.id || "");
  const daysInMonth = getDaysInMonth(currentMonth);
  
  const selectedHabit = habits.find(h => h.id === selectedHabitId);
  
  const data = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const completedDaysInMonth = selectedHabit ? getCompletedDaysForMonth(selectedHabit, currentMonth) : [];
    const completedUpToDay = completedDaysInMonth.filter(d => d <= day).length;
    const cumulativeRate = Math.round((completedUpToDay / day) * 100);
    const isCompletedToday = selectedHabit ? isDayCompleted(selectedHabit, currentMonth, day) : false;
    return {
      day,
      completed: isCompletedToday ? 100 : 0,
      cumulative: cumulativeRate,
    };
  });

  if (habits.length === 0) {
    return (
      <Card className="p-6 animate-slide-up bg-card border-border" style={{ animationDelay: "300ms" }}>
        <h3 className="text-lg font-semibold mb-4 text-foreground">Individual Habit Trend</h3>
        <p className="text-muted-foreground text-center py-8">No habits to display</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 animate-slide-up bg-card border-border" style={{ animationDelay: "300ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Individual Habit Trend</h3>
        <Select value={selectedHabitId} onValueChange={setSelectedHabitId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select habit" />
          </SelectTrigger>
          <SelectContent>
            {habits.map(habit => (
              <SelectItem key={habit.id} value={habit.id}>
                {habit.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="day" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => `${value}%`}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: number, name: string) => [
                `${value}%`,
                name === "completed" ? "Daily" : "Cumulative",
              ]}
              labelFormatter={(label) => `Day ${label}`}
            />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="hsl(260, 20%, 30%)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="step"
              dataKey="completed"
              stroke="hsl(210, 20%, 40%)"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-4">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-4 h-0.5" style={{ backgroundColor: "hsl(260, 20%, 30%)" }} />
          <span className="text-muted-foreground">Cumulative Rate</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-4 h-0.5" style={{ backgroundColor: "hsl(210, 20%, 40%)", borderTopWidth: 2, borderTopStyle: 'dashed' }} />
          <span className="text-muted-foreground">Daily Status</span>
        </div>
      </div>
    </Card>
  );
};
