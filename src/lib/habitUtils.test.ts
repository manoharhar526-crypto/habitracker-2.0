import { describe, it, expect } from "vitest";
import {
  getDaysInMonth,
  createDateString,
  isDayCompleted,
  getCompletedDaysForMonth,
  calculateCompletionRate,
  calculateDailyCompletion,
  getMonthKey,
  getHabitsForMonth,
  getPreviousMonth,
  calculateTotalStreak,
  getAllTimeStats,
  generateId,
} from "./habitUtils";
import type { Habit } from "@/types/habit";

const makeHabit = (overrides: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Read",
  completedDays: [],
  skippedDays: [],
  month: "2026-06",
  order: 0,
  ...overrides,
});

describe("habitUtils — date helpers", () => {
  it("getDaysInMonth: returns 30 for June 2026", () => {
    expect(getDaysInMonth(new Date(2026, 5, 1))).toBe(30);
  });
  it("getDaysInMonth: returns 29 for Feb 2024 (leap)", () => {
    expect(getDaysInMonth(new Date(2024, 1, 1))).toBe(29);
  });
  it("createDateString: zero-pads month and day", () => {
    expect(createDateString(new Date(2026, 0, 1), 5)).toBe("2026-01-05");
  });
  it("getMonthKey: YYYY-MM", () => {
    expect(getMonthKey(new Date(2026, 5, 10))).toBe("2026-06");
  });
  it("getPreviousMonth: rolls back across year", () => {
    const d = getPreviousMonth(new Date(2026, 0, 15));
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(11);
  });
});

describe("habitUtils — completion", () => {
  const month = new Date(2026, 5, 1);
  const habit = makeHabit({ completedDays: ["2026-06-01", "2026-06-05", "2026-05-30"] });

  it("isDayCompleted: true for matching day", () => {
    expect(isDayCompleted(habit, month, 1)).toBe(true);
    expect(isDayCompleted(habit, month, 2)).toBe(false);
  });
  it("getCompletedDaysForMonth: filters to current month only", () => {
    expect(getCompletedDaysForMonth(habit, month)).toEqual([1, 5]);
  });
  it("calculateCompletionRate: percentage of month", () => {
    expect(calculateCompletionRate(habit, month, 30)).toBe(Math.round((2 / 30) * 100));
  });
  it("calculateCompletionRate: excludes skipped days from denominator", () => {
    const h = makeHabit({ completedDays: ["2026-06-01"], skippedDays: ["2026-06-02"] });
    expect(calculateCompletionRate(h, month, 30)).toBe(Math.round((1 / 29) * 100));
  });
  it("calculateDailyCompletion: percentage of habits completed that day", () => {
    const habits = [
      makeHabit({ id: "a", completedDays: ["2026-06-01"] }),
      makeHabit({ id: "b", completedDays: [] }),
    ];
    expect(calculateDailyCompletion(habits, month, 1)).toBe(50);
    expect(calculateDailyCompletion([], month, 1)).toBe(0);
  });
});

describe("habitUtils — monthly scoping", () => {
  it("getHabitsForMonth: filters by month key and sorts by order", () => {
    const habits = [
      makeHabit({ id: "a", month: "2026-06", order: 2 }),
      makeHabit({ id: "b", month: "2026-05", order: 0 }),
      makeHabit({ id: "c", month: "2026-06", order: 0 }),
    ];
    const out = getHabitsForMonth(habits, new Date(2026, 5, 1));
    expect(out.map(h => h.id)).toEqual(["c", "a"]);
  });
});

describe("habitUtils — streak", () => {
  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("returns 0 when neither today nor yesterday qualifies", () => {
    expect(calculateTotalStreak(makeHabit({ completedDays: [] }))).toBe(0);
  });

  it("counts consecutive completed days including today", () => {
    const d1 = new Date(today);
    const d2 = new Date(today); d2.setDate(d2.getDate() - 1);
    const d3 = new Date(today); d3.setDate(d3.getDate() - 2);
    const habit = makeHabit({ completedDays: [fmt(d1), fmt(d2), fmt(d3)] });
    expect(calculateTotalStreak(habit)).toBe(3);
  });

  it("preserves streak across a frozen day", () => {
    const d1 = new Date(today);
    const skipped = new Date(today); skipped.setDate(skipped.getDate() - 1);
    const d3 = new Date(today); d3.setDate(d3.getDate() - 2);
    const habit = makeHabit({ completedDays: [fmt(d1), fmt(d3)] });
    expect(calculateTotalStreak(habit, [fmt(skipped)])).toBe(3);
  });
});

describe("habitUtils — all-time stats", () => {
  it("aggregates completions, months, rate, longest streak, best habit", () => {
    const habits = [
      makeHabit({ id: "a", name: "A", month: "2026-06", completedDays: ["2026-06-01", "2026-06-02"] }),
      makeHabit({ id: "b", name: "B", month: "2026-06", completedDays: ["2026-06-01"] }),
    ];
    const stats = getAllTimeStats(habits);
    expect(stats.totalCompletions).toBe(3);
    expect(stats.totalMonths).toBe(1);
    expect(stats.longestStreak).toBe(2);
    expect(stats.bestHabit?.id).toBe("a");
  });
});

describe("habitUtils — generateId", () => {
  it("returns a non-empty short string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});
