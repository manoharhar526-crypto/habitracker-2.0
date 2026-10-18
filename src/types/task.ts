export type TaskType = 'general' | 'daily' | 'weekly' | 'monthly';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  type: TaskType;
  weekNumber?: number; // For weekly tasks (1-5)
  day?: number; // For daily tasks (1-31)
  month?: string; // "YYYY-MM" - for month-scoped tasks (optional, global if absent)
}

export interface TaskData {
  tasks: Task[];
}
