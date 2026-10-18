/**
 * widgetSync.ts — Mirrors latest user data into native SharedPreferences
 * so Android home-screen widgets can read it without opening the app.
 *
 * Uses @capacitor/preferences with group "HabitrackerWidget".
 * Safe no-op on web (Capacitor not running natively).
 */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";
import type { CalendarNote } from "@/types/calendarNote";
import { readWidgetPrefs } from "@/lib/widgetPrefs";
import {
  calculateTotalStreak,
  calculateBestStreak,
  isExcusedDay,
  getAllTimeStats,
  getCompletedDaysForMonth,
  getDaysInMonth,
  calculateCompletionRate,
  normalizeHabitDays,
} from "@/lib/habitUtils";

// NOTE: we intentionally use the DEFAULT Capacitor Preferences group
// (SharedPreferences file "CapacitorStorage"). `Preferences.configure()` is
// global, so setting a custom group here also redirected the auth/localStorage
// mirroring in nativeStorage.ts — which made widgets read an empty file and
// render blank. The native widgets read "CapacitorStorage" directly.

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const monthKey = () => todayStr().substring(0, 7);

const setItem = async (key: string, value: string) => {
  try {
    await Preferences.set({ key, value });
  } catch {
    /* web fallback — ignore */
  }
};

export type WidgetSyncInput = {
  habits: Habit[];
  tasks: Task[];
  notes: CalendarNote[];
  frozenDates: string[];
};

export const syncWidgetData = async ({ habits, tasks, notes, frozenDates }: WidgetSyncInput) => {
  if (!Capacitor.isNativePlatform()) return;

  const today = todayStr();
  const month = monthKey();
  const dayNum = new Date().getDate();

  // Habits scoped to current month, minus anything hidden from widgets.
  // Normalized so a day can never be exported as both done and N/A.
  const prefs = readWidgetPrefs();
  const monthHabits = habits
    .filter(h => h.month === month)
    .filter(h => !prefs.habits.includes(h.id))
    .map(normalizeHabitDays);
  tasks = tasks.filter(t => !prefs.tasks.includes(t.id));

  // 1. Today's habits (id, name, completed)
  const todaysHabits = monthHabits.map(h => ({
    id: h.id,
    name: h.name,
    completed: h.completedDays.includes(today),
  }));

  // 2. Streak counter (max streak among habits today)
  const maxStreak = monthHabits.reduce(
    (max, h) => Math.max(max, calculateTotalStreak(h, frozenDates)),
    0
  );

  // 3. Today's progress
  const doneCount = todaysHabits.filter(h => h.completed).length;
  const totalCount = todaysHabits.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // 4. Today's tasks (daily)
  const dailyTasks = tasks
    .filter(t => t.type === "daily" && t.day === dayNum && (!t.month || t.month === month))
    .map(t => ({ id: t.id, title: t.title, completed: t.completed }));

  // 5. Weekly tasks (this week)
  const weekNum = Math.ceil((dayNum + new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay()) / 7);
  const weeklyTasks = tasks
    .filter(t => t.type === "weekly" && t.weekNumber === weekNum && (!t.month || t.month === month))
    .map(t => ({ id: t.id, title: t.title, completed: t.completed }));

  // 6. Monthly tasks
  const monthlyTasks = tasks
    .filter(t => t.type === "monthly" && (!t.month || t.month === month))
    .map(t => ({ id: t.id, title: t.title, completed: t.completed }));

  // 7. Today's calendar note
  const noteHit = notes.find(n => n.date === today);
  const todaysNote = noteHit ? `${noteHit.title}${noteHit.body ? " — " + noteHit.body : ""}` : "";

  // ─── Extended widgets ─────────────────────────────────────────────────────
  const now = new Date();
  const totalDaysInMonth = getDaysInMonth(now);
  const monthPrefix = `${month}-`;

  // 8. Monthly tracking grid — full 30/31 day cells per habit, with N/A days
  //    and frozen days kept apart so the widget can colour them differently.
  // Yesterday may fall in the previous month (on the 1st). Export that day's
  // state from the matching previous-month habit so the widget can still tick it.
  const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yDate = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, "0")}-${String(yd.getDate()).padStart(2, "0")}`;
  const yMonth = yDate.substring(0, 7);

  const monthGrid = monthHabits.map(h => {
    const doneNums = getCompletedDaysForMonth(h, now);
    const naNums: number[] = [];
    const frozenNums: number[] = [];
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (doneNums.includes(day)) continue;
      const manualSkip = (h.skippedDays ?? []).includes(date);
      const restDay = (h.restDays ?? []).includes(new Date(`${date}T12:00:00`).getDay());
      if (manualSkip || restDay) naNums.push(day);
      else if (frozenDates.includes(date)) frozenNums.push(day);
    }
    let prev: { id: string; date: string; done: boolean; skip: boolean } | undefined;
    if (yMonth !== month) {
      const ph = habits.find(p => p.month === yMonth && p.name === h.name);
      if (ph) {
        const done = (ph.completedDays ?? []).includes(yDate);
        prev = {
          id: ph.id,
          date: yDate,
          done,
          skip: !done && ((ph.skippedDays ?? []).includes(yDate) ||
            (ph.restDays ?? []).includes(yd.getDay())),
        };
      }
    }
    // Full-date history for earlier months (same habit name) so the widget can
    // show past weeks correctly when browsing back with ‹.
    const hist: Record<string, "d" | "s"> = {};
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
    for (const ph of habits) {
      if (ph.name !== h.name || ph.month === month || ph.month < cutoffKey || ph.month > month) continue;
      const [py, pm] = ph.month.split("-").map(Number);
      const dim = new Date(py, pm, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const ds = `${ph.month}-${String(d).padStart(2, "0")}`;
        if ((ph.completedDays ?? []).includes(ds)) hist[ds] = "d";
        else if ((ph.skippedDays ?? []).includes(ds) || (ph.restDays ?? []).includes(new Date(`${ds}T12:00:00`).getDay())) hist[ds] = "s";
      }
    }
    // Streak baselines that ignore today's tick, so the widget can add +1
    // live when today is ticked from the home screen.
    const withoutToday = { ...h, completedDays: h.completedDays.filter(d => d !== today) };
    return {
      id: h.id,
      name: h.name,
      base: calculateTotalStreak(withoutToday, frozenDates),
      best: calculateBestStreak(withoutToday, frozenDates),
      days: doneNums,
      skipped: naNums,
      frozen: frozenNums,
      total: totalDaysInMonth,
      hist,
      ...(prev ? { prev } : {}),
    };
  });

  // 9. Skip days — habits with skipped count in this month
  const skipDays = monthHabits
    .map(h => ({
      name: h.name,
      count: (h.skippedDays ?? []).filter(d => d.startsWith(monthPrefix)).length,
    }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Set of day numbers skipped by any habit this month (for full-month grid)
  const skipDaySet = Array.from(
    new Set(
      monthHabits.flatMap(h =>
        (h.skippedDays ?? [])
          .filter(d => d.startsWith(monthPrefix))
          .map(d => parseInt(d.slice(-2), 10))
          .filter(n => Number.isFinite(n))
      )
    )
  );

  // Dates in current month that have a note (for calendar dot markers)
  const calendarNotesThisMonth = notes
    .map(n => n.date)
    .filter(d => d.startsWith(monthPrefix));

  // Full note text per date so the widget's note editor can open with content
  const calendarNotesMap: Record<string, { title: string; body: string }> = {};
  for (const n of notes) {
    calendarNotesMap[n.date] = { title: n.title ?? "", body: n.body ?? "" };
  }

  // 10. Habit analytics — top habits by completion % this month
  const analytics = monthHabits
    .map(h => ({ name: h.name, pct: calculateCompletionRate(h, now, totalDaysInMonth) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  // 11. Calendar — current week (Sun→Sat), today + note markers
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const noteSet = new Set(notes.map(n => n.date));
  const calendarWeek = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      day: d.getDate(),
      today: dStr === today,
      hasNote: noteSet.has(dStr),
    };
  });
  const calendarMonth = now.toLocaleString("default", { month: "long", year: "numeric" });

  // 12. All-time stats
  const at = getAllTimeStats(habits, frozenDates);
  // Longest-ever streak with today's ticks removed (widget re-adds them live).
  const alltimeBestBase = habits.reduce((m, h) => Math.max(m, calculateBestStreak(
    { ...h, completedDays: (h.completedDays ?? []).filter(d => d !== today) }, frozenDates)), 0);
  // Same denominator getAllTimeStats uses, so the widget can update the rate live.
  let alltimePossible = 0;
  for (const h of habits.map(normalizeHabitDays)) {
    const [y, m] = h.month.split("-").map(Number);
    if (!y || !m) continue;
    const dim = new Date(y, m, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const ds = `${h.month}-${String(d).padStart(2, "0")}`;
      if (h.completedDays.includes(ds) || !isExcusedDay(h, ds, frozenDates)) alltimePossible++;
    }
  }

  // 12b. Year Card — one char per day of this year (today excluded; widget adds it live).
  // '.' nothing tracked, 'x' excused only, '0'..'4' share of expected habits done.
  const yr = now.getFullYear();
  const yearByMonth = new Map<string, Habit[]>();
  for (const h of habits.map(normalizeHabitDays)) {
    if (prefs.habits.includes(h.id)) continue;
    const list = yearByMonth.get(h.month) ?? [];
    list.push(h);
    yearByMonth.set(h.month, list);
  }
  let yearLevels = "";
  let yearDoneBase = 0;
  let yearExpectedBase = 0;
  for (const d = new Date(yr, 0, 1, 12); d.getFullYear() === yr; d.setDate(d.getDate() + 1)) {
    const ds = `${yr}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (ds >= today) { yearLevels += "."; continue; }
    const list = yearByMonth.get(ds.substring(0, 7)) ?? [];
    if (list.length === 0) { yearLevels += "."; continue; }
    let done = 0, expected = 0;
    for (const h of list) {
      const isDone = h.completedDays.includes(ds);
      if (isDone) done++;
      if (isDone || !isExcusedDay(h, ds, frozenDates)) expected++;
    }
    yearDoneBase += done;
    yearExpectedBase += expected;
    if (expected === 0) { yearLevels += "x"; continue; }
    const q = done / expected;
    yearLevels += q <= 0 ? "0" : q < 0.34 ? "1" : q < 0.67 ? "2" : q < 1 ? "3" : "4";
  }

  // 13. Habit reports — per-habit monthly summary
  const habitReports = monthHabits.map(h => {
    const completed = getCompletedDaysForMonth(h, now).length;
    return {
      name: h.name,
      completed,
      total: totalDaysInMonth,
      rate: calculateCompletionRate(h, now, totalDaysInMonth),
    };
  }).slice(0, 6);

  // 14. Task reports + analytics
  const monthTasksAll = tasks.filter(t => !t.month || t.month === month);
  const td = monthTasksAll.filter(t => t.type === "daily");
  const tw = monthTasksAll.filter(t => t.type === "weekly");
  const tm = monthTasksAll.filter(t => t.type === "monthly");
  const doneOf = (xs: Task[]) => xs.filter(t => t.completed).length;
  const pctOf = (xs: Task[]) => (xs.length ? Math.round((doneOf(xs) / xs.length) * 100) : 0);

  await Promise.all([
    setItem("today_date", today),
    setItem("grid_month", month),
    setItem("year_card_year", String(yr)),
    setItem("year_levels", yearLevels),
    setItem("year_done_base", String(yearDoneBase)),
    setItem("year_expected_base", String(yearExpectedBase)),
    setItem("widget_new_month", "0"),

    // Compact "Today" summary widget
    setItem("today_done", String(doneCount)),
    setItem("today_total", String(totalCount)),
    setItem("today_pct", String(progressPct)),
    setItem("today_streak", String(maxStreak)),

    // The 7 supported widgets:
    setItem("month_grid", JSON.stringify(monthGrid)),
    setItem("skip_days", JSON.stringify(skipDays)),
    setItem("skip_days_set", JSON.stringify(skipDaySet)),
    setItem("calendar_notes", JSON.stringify(calendarNotesThisMonth)),
    setItem("calendar_notes_map", JSON.stringify(calendarNotesMap)),
    setItem("analytics", JSON.stringify(analytics)),
    setItem("calendar_week", JSON.stringify(calendarWeek)),
    setItem("calendar_month", calendarMonth),
    setItem("alltime_completions", String(at.totalCompletions)),
    setItem("alltime_months", String(at.totalMonths)),
    setItem("alltime_rate", String(at.allTimeRate)),
    setItem("alltime_streak", String(at.longestStreak)),
    setItem("alltime_best_base", String(alltimeBestBase)),
    setItem("alltime_possible", String(alltimePossible)),
    setItem("alltime_best", at.bestHabit?.name ?? ""),
    setItem("habit_reports", JSON.stringify(habitReports)),
    setItem("task_rep_daily_done", String(doneOf(td))),
    setItem("task_rep_daily_total", String(td.length)),
    setItem("task_rep_weekly_done", String(doneOf(tw))),
    setItem("task_rep_weekly_total", String(tw.length)),
    setItem("task_rep_monthly_done", String(doneOf(tm))),
    setItem("task_rep_monthly_total", String(tm.length)),
  ]);

  // Commit marker: Android listens for this key and repaints only after every
  // payload above has finished writing, avoiding a refresh with stale cells.
  await setItem("last_sync", new Date().toISOString());

  // Broadcast intent so widgets refresh
  try {
    // @ts-ignore — runtime check
    if (window.Capacitor?.Plugins?.App) {
      window.dispatchEvent(new CustomEvent("habitracker:widget-updated"));
    }
  } catch {
    /* ignore */
  }
};

/**
 * Drains habit-cell taps queued by the native `HabitToggleReceiver`.
 * Called on app launch; returns the list of {habitId, date} the caller
 * should apply to state (each toggles that day's completion).
 */
export const drainPendingWidgetToggles = async (): Promise<Array<{ habitId: string; date: string }>> => {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { value } = await Preferences.get({ key: "pending_toggles" });
    if (!value) return [];
    const arr = JSON.parse(value) as Array<{ habitId: string; date: string }>;
    await Preferences.set({ key: "pending_toggles", value: "[]" });
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

/**
 * Drains skip-day taps queued by the native Skip Days widget.
 * Each entry toggles that habit's skipped state for the given date.
 */
export const drainPendingWidgetSkips = async (): Promise<Array<{ habitId: string; date: string }>> => {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { value } = await Preferences.get({ key: "pending_skips" });
    if (!value) return [];
    const arr = JSON.parse(value) as Array<{ habitId: string; date: string }>;
    await Preferences.set({ key: "pending_skips", value: "[]" });
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

/** Reads (and clears) a date the native calendar widget asked the app to open. */
export const consumeWidgetNavDate = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { value } = await Preferences.get({ key: "widget_nav_date" });
    if (!value) return null;
    await Preferences.set({ key: "widget_nav_date", value: "" });
    return value;
  } catch {
    return null;
  }
};

export type PendingWidgetNote = {
  date: string;
  title: string;
  body: string;
  deleted: boolean;
};

/**
 * Drains notes written/deleted in the native calendar widget's note editor.
 * Each entry is the final state for that date (or a deletion).
 */
export const drainPendingWidgetNotes = async (): Promise<PendingWidgetNote[]> => {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { value } = await Preferences.get({ key: "pending_notes" });
    if (!value) return [];
    const arr = JSON.parse(value) as PendingWidgetNote[];
    await Preferences.set({ key: "pending_notes", value: "[]" });
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
