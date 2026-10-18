import { Task } from "@/types/task";
import { TaskSection } from "./TaskSection";
import { getDailyTasksByDay, getDaysInMonth } from "@/lib/taskUtils";
import { getDayOfWeek } from "@/lib/habitUtils";

interface DailyTasksViewProps {
  tasks: Task[];
  currentMonth: Date;
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
}

export const DailyTasksView = ({
  tasks,
  currentMonth,
  onToggleTask,
  onAddTask,
  onDeleteTask,
  onEditTask,
}: DailyTasksViewProps) => {
  const daysInMonth = getDaysInMonth(currentMonth);
  const today = new Date();
  const isCurrentMonth =
    today.getMonth() === currentMonth.getMonth() &&
    today.getFullYear() === currentMonth.getFullYear();
  const currentDay = isCurrentMonth ? today.getDate() : 1;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Daily Tasks</h3>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const isToday = isCurrentMonth && day === currentDay;
          const dayOfWeek = getDayOfWeek(currentMonth, day);
          return (
            <TaskSection
              key={day}
              title={dayOfWeek}
              tasks={getDailyTasksByDay(tasks, day)}
              type="daily"
              day={day}
              onToggleTask={onToggleTask}
              onAddTask={onAddTask}
              onDeleteTask={onDeleteTask}
              onEditTask={onEditTask}
              colorClass={isToday ? "bg-accent border-2 border-foreground/30" : "bg-card"}
            />
          );
        })}
      </div>
    </div>
  );
};
