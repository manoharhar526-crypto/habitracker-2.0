import { Habit } from "@/types/habit";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card } from "@/components/ui/card";
import { getCompletedDaysForMonth } from "@/lib/habitUtils";

interface HabitPieChartProps {
  habits: Habit[];
  currentMonth: Date;
}

export const HabitPieChart = ({ habits, currentMonth }: HabitPieChartProps) => {
  if (habits.length === 0) {
    return (
      <Card className="p-6 animate-slide-up bg-card border-border" style={{ animationDelay: "100ms" }}>
        <h3 className="text-lg font-semibold mb-4 text-foreground">Habit Distribution</h3>
        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          No habits to display yet
        </div>
      </Card>
    );
  }
  const COLORS = [
    "hsl(220, 25%, 25%)",    // Deep slate blue
    "hsl(260, 20%, 30%)",    // Muted purple
    "hsl(200, 30%, 20%)",    // Dark ocean
    "hsl(280, 15%, 35%)",    // Dusty violet
    "hsl(210, 20%, 40%)",    // Storm grey-blue
    "hsl(240, 25%, 28%)",    // Midnight indigo
    "hsl(270, 18%, 38%)",    // Faded lavender
    "hsl(195, 25%, 32%)",    // Melancholy teal
    "hsl(230, 22%, 45%)",    // Overcast blue
    "hsl(290, 12%, 42%)",    // Lonely mauve
  ];

  const data = habits.map((habit, index) => ({
    name: habit.name,
    value: getCompletedDaysForMonth(habit, currentMonth).length,
    fill: COLORS[index % COLORS.length],
  }));

  const totalCompleted = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="p-6 animate-slide-up bg-card border-border" style={{ animationDelay: "100ms" }}>
      <h3 className="text-lg font-semibold mb-4 text-foreground">Habit Distribution</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="hsl(var(--background))"
              strokeWidth={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: number, name: string) => [
                `${value} days (${totalCompleted > 0 ? Math.round((value / totalCompleted) * 100) : 0}%)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {data.slice(0, 5).map((item, index) => (
          <div key={index} className="flex items-center gap-1 text-xs">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.fill }}
            />
            <span className="text-muted-foreground truncate max-w-20">{item.name}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};
