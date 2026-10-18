import { Habit } from "@/types/habit";

export const getDaysInMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

export const getMonthName = (date: Date): string => {
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
};

export const getDayOfWeek = (date: Date, day: number): string => {
  const d = new Date(date.getFullYear(), date.getMonth(), day);
  return d.toLocaleString('default', { weekday: 'short' });
};

export const getWeekNumber = (date: Date, day: number): number => {
  const d = new Date(date.getFullYear(), date.getMonth(), day);
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfWeek = firstDay.getDay();
  return Math.ceil((day + dayOfWeek) / 7);
};

export const createDateString = (currentMonth: Date, day: number): string => {
  const year = currentMonth.getFullYear();
  const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
};

export const isDayCompleted = (habit: Habit, currentMonth: Date, day: number): boolean => {
  const dateString = createDateString(currentMonth, day);
  return habit.completedDays.some(d => typeof d === 'string' && d === dateString);
};

export const getCompletedDaysForMonth = (habit: Habit, currentMonth: Date): number[] => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return habit.completedDays
    .filter((dateStr): dateStr is string => typeof dateStr === 'string' && dateStr.startsWith(prefix))
    .map(dateStr => parseInt(dateStr.split('-')[2], 10));
};

/**
 * A day is either "done" or "N/A (skipped)" — never both.
 *
 * Every place that marks a day (the grid, the calendar, the widgets page and
 * the queue drained from the Android home-screen widgets) goes through this so
 * the two states can't get out of sync and double-count.
 */
export type DayMark = "complete" | "skip";

export const toggleHabitDayMark = (habit: Habit, dateStr: string, mark: DayMark): Habit => {
  const completed = (habit.completedDays ?? []).filter((d): d is string => typeof d === "string");
  const skipped = (habit.skippedDays ?? []).filter((d): d is string => typeof d === "string");

  if (mark === "complete") {
    const isOn = completed.includes(dateStr);
    // A day marked N/A is locked: the skip must be removed first.
    if (!isOn && skipped.includes(dateStr)) return habit;
    return {
      ...habit,
      completedDays: (isOn ? completed.filter(d => d !== dateStr) : [...completed, dateStr]).sort(),
      skippedDays: skipped,
    };
  }

  const isOn = skipped.includes(dateStr);
  return {
    ...habit,
    // Marking a day N/A clears any completion on the same day.
    completedDays: isOn ? completed : completed.filter(d => d !== dateStr),
    skippedDays: (isOn ? skipped.filter(d => d !== dateStr) : [...skipped, dateStr]).sort(),
  };
};

/** Repairs older saved data where a day ended up both done and skipped. */
export const normalizeHabitDays = (habit: Habit): Habit => {
  const completed = (habit.completedDays ?? []).filter((d): d is string => typeof d === "string");
  const skipped = (habit.skippedDays ?? []).filter((d): d is string => typeof d === "string");
  const completedSet = new Set(completed);
  const cleanedSkipped = skipped.filter(d => !completedSet.has(d));
  if (cleanedSkipped.length === skipped.length && completed.length === (habit.completedDays ?? []).length) {
    return habit;
  }
  // Completion wins: an explicitly checked-off day is real progress.
  return { ...habit, completedDays: completed, skippedDays: cleanedSkipped };
};

// ─── Rest days (planned days off) ─────────────────────────────────────────────

/** Parses "YYYY-MM-DD" into a local Date at midday (avoids timezone drift). */
export const parseDateStr = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
};

export const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** True when the habit has this weekday marked as a planned day off. */
export const isRestDay = (habit: Habit, dateStr: string): boolean => {
  const rest = habit.restDays ?? [];
  if (rest.length === 0) return false;
  return rest.includes(parseDateStr(dateStr).getDay());
};

/** A day is "off the hook" when it's a rest day, an N/A day, or frozen. */
export const isExcusedDay = (habit: Habit, dateStr: string, frozenDates: string[] = []): boolean =>
  isRestDay(habit, dateStr) ||
  (habit.skippedDays ?? []).includes(dateStr) ||
  frozenDates.includes(dateStr);

export const calculateCompletionRate = (
  habit: Habit,
  currentMonth: Date,
  totalDays: number,
  frozenDates: string[] = [],
): number => {
  const clean = normalizeHabitDays(habit);
  const completedDaysInMonth = getCompletedDaysForMonth(clean, currentMonth);
  // Honest denominator: only days this habit was actually expected.
  const prefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-`;
  let expected = 0;
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${prefix}${String(day).padStart(2, "0")}`;
    if (clean.completedDays.includes(dateStr)) { expected++; continue; }
    if (isExcusedDay(clean, dateStr, frozenDates)) continue;
    expected++;
  }
  const effectiveDays = Math.max(1, expected);
  const rate = Math.round((completedDaysInMonth.length / effectiveDays) * 100);
  return Math.min(100, Math.max(0, rate));
};

export const calculateDailyCompletion = (habits: Habit[], currentMonth: Date, day: number): number => {
  if (habits.length === 0) return 0;
  const completed = habits.filter(h => isDayCompleted(h, currentMonth, day)).length;
  return Math.round((completed / habits.length) * 100);
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

export const getMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const getHabitsForMonth = (habits: Habit[], date: Date): Habit[] => {
  const monthKey = getMonthKey(date);
  return habits
    .filter(h => h.month === monthKey)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
};

export const getPreviousMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
};

// ─── All-time statistics across all months ────────────────────────────────────
//
// These numbers are deliberately conservative: rest days and N/A days leave the
// denominator instead of being counted as wins, and a frozen day is never
// counted as a completion. The app should never flatter the user.

export const getAllTimeStats = (habits: Habit[], frozenDates: string[] = []) => {
  const clean = habits.map(normalizeHabitDays);
  const totalCompletions = clean.reduce((sum, h) => sum + h.completedDays.length, 0);

  // Unique months tracked
  const monthsSet = new Set(clean.map(h => h.month));
  const totalMonths = monthsSet.size;

  // All-time rate: completions ÷ days the habit was actually expected.
  let totalPossible = 0;
  for (const habit of clean) {
    const [y, m] = habit.month.split("-").map(Number);
    if (!y || !m) continue;
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${habit.month}-${String(day).padStart(2, "0")}`;
      if (habit.completedDays.includes(dateStr)) { totalPossible++; continue; }
      if (isExcusedDay(habit, dateStr, frozenDates)) continue;
      totalPossible++;
    }
  }
  const allTimeRate = totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 100) : 0;

  const longestStreak = clean.reduce(
    (max, habit) => Math.max(max, calculateBestStreak(habit, frozenDates)),
    0,
  );

  // Best habit (by all-time completion count)
  const bestHabit = clean.length > 0
    ? clean.reduce((best, h) => h.completedDays.length > best.completedDays.length ? h : best)
    : null;

  return { totalCompletions, totalMonths, allTimeRate, longestStreak, bestHabit };
};

// ─── Streaks ──────────────────────────────────────────────────────────────────
// A day either:
//   • counts   — completed, or protected by a streak freeze
//   • bridges  — a planned rest day or an N/A day: doesn't count, doesn't break
//   • breaks   — a plain missed day
export type StreakDayKind = "counts" | "bridges" | "breaks";

export const streakDayKind = (
  habit: Habit,
  dateStr: string,
  frozenDates: string[] = [],
): StreakDayKind => {
  if (habit.completedDays.includes(dateStr)) return "counts";
  if (frozenDates.includes(dateStr)) return "counts";
  if (isRestDay(habit, dateStr)) return "bridges";
  if ((habit.skippedDays ?? []).includes(dateStr)) return "bridges";
  return "breaks";
};

/**
 * Current run of days, counted across months.
 * Today not being done yet never breaks the streak — the day isn't over.
 */
export const calculateTotalStreak = (habit: Habit, frozenDates: string[] = []): number => {
  const clean = normalizeHabitDays(habit);
  const today = new Date();
  const cursor = new Date(today);

  // Today still counts as "in progress" until it is over.
  if (streakDayKind(clean, toDateStr(cursor), frozenDates) !== "counts") {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  // Walk back at most ~10 years of days.
  for (let i = 0; i < 4000; i++) {
    const kind = streakDayKind(clean, toDateStr(cursor), frozenDates);
    if (kind === "breaks") break;
    if (kind === "counts") streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

/**
 * Longest run this habit ever had. Frozen days keep the run alive; rest and
 * N/A days bridge a gap without inflating the number.
 */
export const calculateBestStreak = (habit: Habit, frozenDates: string[] = []): number => {
  const clean = normalizeHabitDays(habit);
  const marks = [...(clean.completedDays ?? []), ...frozenDates].sort();
  if (marks.length === 0) return 0;

  const start = parseDateStr(marks[0]);
  const end = parseDateStr(marks[marks.length - 1]);
  let best = 0;
  let run = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const kind = streakDayKind(clean, toDateStr(cursor), frozenDates);
    if (kind === "breaks") run = 0;
    else if (kind === "counts") { run++; best = Math.max(best, run); }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
};

/**
 * The run that just ended, if any: how long it was and the day it ended.
 * Used by recovery mode — "you broke a 20-day streak, here's a fresh start".
 */
export const findBrokenStreak = (
  habit: Habit,
  frozenDates: string[] = [],
): { length: number; endedOn: string } | null => {
  const clean = normalizeHabitDays(habit);
  if (calculateTotalStreak(clean, frozenDates) > 0) return null;

  const cursor = new Date();
  let endedOn: string | null = null;
  let length = 0;

  // Find the most recent day that counted.
  for (let i = 0; i < 400; i++) {
    const dateStr = toDateStr(cursor);
    if (streakDayKind(clean, dateStr, frozenDates) === "counts") { endedOn = dateStr; break; }
    cursor.setDate(cursor.getDate() - 1);
  }
  if (!endedOn) return null;

  // Measure the run that ended there.
  for (let i = 0; i < 4000; i++) {
    const kind = streakDayKind(clean, toDateStr(cursor), frozenDates);
    if (kind === "breaks") break;
    if (kind === "counts") length++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return length > 0 ? { length, endedOn } : null;
};

export const defaultHabits: Habit[] = [];
