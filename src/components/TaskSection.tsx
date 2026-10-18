import { useState } from "react";
import { Task, TaskType } from "@/types/task";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, X, Pencil, Check } from "lucide-react";
import { generateId } from "@/lib/habitUtils";

interface TaskSectionProps {
  title: string;
  tasks: Task[];
  type: TaskType;
  weekNumber?: number;
  day?: number;
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (taskId: string, newTitle: string) => void;
  colorClass?: string;
}

export const TaskSection = ({
  title,
  tasks,
  type,
  weekNumber,
  day,
  onToggleTask,
  onAddTask,
  onDeleteTask,
  onEditTask,
  colorClass = "bg-card",
}: TaskSectionProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      onAddTask({
        id: generateId(),
        title: newTaskTitle.trim(),
        completed: false,
        type,
        weekNumber,
        day,
      });
      setNewTaskTitle("");
      setIsAdding(false);
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditingTitle(task.title);
  };

  const commitEdit = () => {
    if (editingId && editingTitle.trim()) {
      onEditTask(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <Card className={`p-4 ${colorClass} border-border`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {completedCount}/{tasks.length} completed ({completionRate}%)
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsAdding(!isAdding)}
          aria-label={isAdding ? "Cancel adding task" : "Add task"}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {isAdding && (
        <div className="flex gap-2 mb-3">
          <Input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="New task..."
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTask();
              if (e.key === "Escape") { setIsAdding(false); setNewTaskTitle(""); }
            }}
            autoFocus
          />
          <Button size="sm" className="h-8" onClick={handleAddTask}>Add</Button>
        </div>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 group text-sm">
            <Checkbox
              checked={task.completed}
              onCheckedChange={() => onToggleTask(task.id)}
              className="border-border flex-shrink-0"
            />
            {editingId === task.id ? (
              <Input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="h-7 text-sm flex-1 py-0"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") { setEditingId(null); setEditingTitle(""); }
                }}
              />
            ) : (
              <span className={`flex-1 ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                {task.title}
              </span>
            )}
            {editingId === task.id ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 flex-shrink-0"
                onClick={commitEdit}
                aria-label="Save task"
              >
                <Check className="w-3 h-3 text-green-500" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 focus:opacity-100 sm:transition-opacity touch-manipulation flex-shrink-0"
                onClick={() => startEdit(task)}
                aria-label="Edit task"
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 focus:opacity-100 sm:transition-opacity touch-manipulation flex-shrink-0"
              onClick={() => onDeleteTask(task.id)}
              aria-label="Delete task"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No tasks yet</p>
        )}
      </div>
    </Card>
  );
};
