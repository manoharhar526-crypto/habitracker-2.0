import { describe, it, expect } from "vitest";
import {
  getDaysInMonth,
  getTasksByType,
  getWeeklyTasksByWeek,
  getDailyTasksByDay,
  calculateTaskCompletionRate,
  getWeeksInMonth,
} from "./taskUtils";
import type { Task } from "@/types/task";

const t = (overrides: Partial<Task>): Task => ({
  id: "t",
  title: "x",
  completed: false,
  type: "general",
  ...overrides,
});

describe("taskUtils", () => {
  it("getDaysInMonth: 31 for July 2026", () => {
    expect(getDaysInMonth(new Date(2026, 6, 1))).toBe(31);
  });

  it("getTasksByType: filters by type", () => {
    const tasks = [t({ id: "1", type: "daily" }), t({ id: "2", type: "weekly" }), t({ id: "3", type: "daily" })];
    expect(getTasksByType(tasks, "daily").map(x => x.id)).toEqual(["1", "3"]);
  });

  it("getWeeklyTasksByWeek: filters weekly + week number", () => {
    const tasks = [
      t({ id: "1", type: "weekly", weekNumber: 1 }),
      t({ id: "2", type: "weekly", weekNumber: 2 }),
      t({ id: "3", type: "daily", weekNumber: 1 }),
    ];
    expect(getWeeklyTasksByWeek(tasks, 1).map(x => x.id)).toEqual(["1"]);
  });

  it("getDailyTasksByDay: filters daily + day", () => {
    const tasks = [
      t({ id: "1", type: "daily", day: 1 }),
      t({ id: "2", type: "daily", day: 2 }),
    ];
    expect(getDailyTasksByDay(tasks, 2).map(x => x.id)).toEqual(["2"]);
  });

  it("calculateTaskCompletionRate: handles empty + mixed", () => {
    expect(calculateTaskCompletionRate([])).toBe(0);
    expect(calculateTaskCompletionRate([t({ completed: true }), t({ completed: false })])).toBe(50);
  });

  it("getWeeksInMonth: returns a sensible week count", () => {
    const w = getWeeksInMonth(new Date(2026, 5, 1));
    expect(w).toBeGreaterThanOrEqual(5);
    expect(w).toBeLessThanOrEqual(6);
  });
});
