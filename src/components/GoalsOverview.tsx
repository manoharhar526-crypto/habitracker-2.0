import { Task } from "@/types/task";
import { CalendarNote } from "@/types/calendarNote";
import { TaskSection } from "./TaskSection";
import { CalendarView } from "./CalendarView";
import { getTasksByType, getWeeklyTasksByWeek } from "@/lib/taskUtils";
import { Calendar } from "lucide-react";

interface GoalsOverviewProps {
  tasks: Task[];
  currentMonth: Date;
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
  calendarNotes: CalendarNote[];
  onAddCalendarNote: (note: CalendarNote) => void;
  onDeleteCalendarNote: (id: string) => void;
  onEditCalendarNote: (id: string, updated: Partial<CalendarNote>) => void;
}

export const GoalsOverview = ({
  tasks,
  currentMonth: _currentMonth,
  onToggleTask,
  onAddTask,
  onDeleteTask,
  onEditTask,
  calendarNotes,
  onAddCalendarNote,
  onDeleteCalendarNote,
  onEditCalendarNote,
}: GoalsOverviewProps) => {
  const generalTasks = getTasksByType(tasks, "general");
  const monthlyTasks = getTasksByType(tasks, "monthly");
  const weekNumber = Math.min(5, Math.ceil(new Date().getDate() / 7));
  const weeklyTasks = getWeeklyTasksByWeek(tasks, weekNumber);

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-3 gap-4">
        <TaskSection
          title="General Goals"
          tasks={generalTasks}
          type="general"
          onToggleTask={onToggleTask}
          onAddTask={onAddTask}
          onDeleteTask={onDeleteTask}
          onEditTask={onEditTask}
        />
        <TaskSection
          title={`Weekly Goals · Week ${weekNumber}`}
          tasks={weeklyTasks}
          type="weekly"
          weekNumber={weekNumber}
          onToggleTask={onToggleTask}
          onAddTask={onAddTask}
          onDeleteTask={onDeleteTask}
          onEditTask={onEditTask}
        />
        <TaskSection
          title="Monthly Goals"
          tasks={monthlyTasks}
          type="monthly"
          onToggleTask={onToggleTask}
          onAddTask={onAddTask}
          onDeleteTask={onDeleteTask}
          onEditTask={onEditTask}
        />
      </div>

      {/* Calendar section inside Goals */}
      <div>
        <h2 className="text-lg sm:text-xl font-semibold mb-1 flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Calendar
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Tap a day to add notes or reminders. You'll get a notification on that day.
        </p>
        <CalendarView
          notes={calendarNotes}
          onAddNote={onAddCalendarNote}
          onDeleteNote={onDeleteCalendarNote}
          onEditNote={onEditCalendarNote}
        />
      </div>
    </div>
  );
};
