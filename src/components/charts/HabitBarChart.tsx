import { Habit } from "@/types/habit";
import { getDaysInMonth, calculateCompletionRate, getCompletedDaysForMonth } from "@/lib/habitUtils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/card";

interface HabitBarChartProps {
  habits: Habit[];
  currentMonth: Date;
}

export const HabitBarChart = ({ habits, currentMonth }: HabitBarChartProps) => {
  const daysInMonth = getDaysInMonth(currentMonth);

  if (habits.length === 0) {
    return (
      <Card className="p-6 animate-slide-up bg-card border-border" style={{ animationDelay: "200ms" }}>
        <h3 className="text-lg font-semibold mb-4 text-foreground">Habit Completion Rates</h3>
        <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
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
    name: habit.name.length > 12 ? habit.name.substring(0, 12) + "..." : habit.name,
    fullName: habit.name,
    completion: calculateCompletionRate(habit, currentMonth, daysInMonth),
    days: getCompletedDaysForMonth(habit, currentMonth).length,
    fill: COLORS[index % COLORS.length],
  }));

  return (
    <Card className="p-6 animate-slide-up bg-card border-border" style={{ animationDelay: "200ms" }}>
      <h3 className="text-lg font-semibold mb-4 text-foreground">Habit Completion Rates</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis
              type="number"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => `${value}%`}
              domain={[0, 100]}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              width={75}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value, _name, props) => {
                const p = (props as { payload?: { days?: number; fullName?: string } }).payload;
                return [`${value}% (${p?.days ?? 0}/${daysInMonth} days)`, p?.fullName ?? ""];
              }}
              labelFormatter={() => ""}
            />
            <Bar dataKey="completion" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
