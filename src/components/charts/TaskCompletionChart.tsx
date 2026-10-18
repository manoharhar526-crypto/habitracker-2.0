import { Task } from "@/types/task";
import { Card } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { getTasksByType, calculateTaskCompletionRate } from "@/lib/taskUtils";

interface TaskCompletionChartProps {
  tasks: Task[];
}

export const TaskCompletionChart = ({ tasks }: TaskCompletionChartProps) => {
  const generalTasks = getTasksByType(tasks, "general");
  const monthlyTasks = getTasksByType(tasks, "monthly");

  const data = [
    {
      name: "General",
      value: generalTasks.length,
      completed: generalTasks.filter(t => t.completed).length,
      rate: calculateTaskCompletionRate(generalTasks),
    },
    {
      name: "Monthly",
      value: monthlyTasks.length,
      completed: monthlyTasks.filter(t => t.completed).length,
      rate: calculateTaskCompletionRate(monthlyTasks),
    },
  ].filter(d => d.value > 0);

  const COLORS = ["hsl(220, 25%, 25%)", "hsl(200, 30%, 20%)"];

  return (
    <Card className="p-6 border-border">
      <h3 className="font-semibold mb-4">Task Completion by Category</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                stroke="hsl(var(--border))"
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
            formatter={(value: number, name: string, props) => [
              `${props.payload.completed}/${value} (${props.payload.rate}%)`,
              name
            ]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
};
