import { Task } from "@/types/task";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { getTasksByType, calculateTaskCompletionRate } from "@/lib/taskUtils";

interface TaskProgressChartProps {
  tasks: Task[];
  currentMonth: Date;
}

export const TaskProgressChart = ({ tasks }: TaskProgressChartProps) => {
  const COLORS = ["hsl(220, 25%, 25%)", "hsl(200, 30%, 20%)"];
  const categoryData = [
    { name: "General", rate: calculateTaskCompletionRate(getTasksByType(tasks, "general")), color: COLORS[0] },
    { name: "Monthly", rate: calculateTaskCompletionRate(getTasksByType(tasks, "monthly")), color: COLORS[1] },
  ];

  return (
    <Card className="p-6 border-border">
      <h3 className="font-semibold mb-4">Task Completion by Category</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={categoryData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(value: number) => [`${value}%`, "Completion"]} />
          <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
            {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
