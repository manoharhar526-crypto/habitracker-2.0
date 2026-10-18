import { Task } from "@/types/task";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getTasksByType, calculateTaskCompletionRate } from "@/lib/taskUtils";
import { Target, Calendar } from "lucide-react";

interface TaskReportCardProps {
  tasks: Task[];
}

export const TaskReportCard = ({ tasks }: TaskReportCardProps) => {
  const generalTasks = getTasksByType(tasks, "general");
  const monthlyTasks = getTasksByType(tasks, "monthly");

  const reports = [
    {
      title: "General Goals",
      icon: Target,
      tasks: generalTasks,
      rate: calculateTaskCompletionRate(generalTasks),
    },
    {
      title: "Monthly Goals",
      icon: Calendar,
      tasks: monthlyTasks,
      rate: calculateTaskCompletionRate(monthlyTasks),
    },
  ];

  const goalTasks = [...generalTasks, ...monthlyTasks];
  const totalTasks = goalTasks.length;
  const completedTasks = goalTasks.filter(t => t.completed).length;
  const overallRate = calculateTaskCompletionRate(goalTasks);

  return (
    <div className="space-y-4">
      {/* Overall Summary */}
      <Card className="p-6 border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Goals Summary</h3>
          <span className="text-2xl font-bold">{overallRate}%</span>
        </div>
        <Progress value={overallRate} className="h-3 mb-2" />
        <p className="text-sm text-muted-foreground">
          {completedTasks} of {totalTasks} goals completed
        </p>
      </Card>

      {/* Category Breakdown */}
      <div className="grid sm:grid-cols-2 gap-4">
        {reports.map((report) => {
          const Icon = report.icon;
          const completed = report.tasks.filter(t => t.completed).length;
          return (
            <Card key={report.title} className="p-4 border-border">
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{report.title}</h4>
              </div>
              <div className="flex items-end justify-between mb-2">
                <span className="text-2xl font-bold">{report.rate}%</span>
                <span className="text-xs text-muted-foreground">
                  {completed}/{report.tasks.length}
                </span>
              </div>
              <Progress value={report.rate} className="h-2" />
            </Card>
          );
        })}
      </div>
    </div>
  );
};
