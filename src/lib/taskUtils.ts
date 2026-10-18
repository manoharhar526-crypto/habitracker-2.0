import { Task, TaskType } from "@/types/task";
import { generateId } from "./habitUtils";

export const getDaysInMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

export const defaultTasks: Task[] = [];

export const getTasksByType = (tasks: Task[], type: TaskType): Task[] => {
  return tasks.filter(task => task.type === type);
};

export const getWeeklyTasksByWeek = (tasks: Task[], weekNumber: number): Task[] => {
  return tasks.filter(task => task.type === "weekly" && task.weekNumber === weekNumber);
};

export const getDailyTasksByDay = (tasks: Task[], day: number): Task[] => {
  return tasks.filter(task => task.type === "daily" && task.day === day);
};

export const calculateTaskCompletionRate = (tasks: Task[]): number => {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(task => task.completed).length;
  return Math.round((completed / tasks.length) * 100);
};

export const getWeeksInMonth = (date: Date): number => {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  return Math.ceil((daysInMonth + firstDay) / 7);
};
