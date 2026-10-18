/**
 * Widget visibility preferences — which habits/tasks are hidden from the
 * home-screen widgets. Stored locally; empty lists mean "show everything".
 *
 * `habits`/`tasks` hide an item from EVERY widget (global filter).
 * `perWidget[widgetId]` hides an item from that one widget only.
 */
export const WIDGET_PREFS_KEY = "habit_tracker_widget_prefs";

export const WIDGET_IDS = [
  "todaySummary",
  "monthGrid",
  "skipDays",
  "analytics",
  "habitReports",
  "taskReports",
  "calendar",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  todaySummary: "Today summary",
  monthGrid: "Weekly tracking",
  skipDays: "Skip days",
  analytics: "Habit analytics",
  habitReports: "Habit reports",
  taskReports: "Task reports",
  calendar: "Calendar",
};

/** Which widgets show habits, and which show tasks. */
export const WIDGET_SHOWS: Record<WidgetId, { habits: boolean; tasks: boolean }> = {
  todaySummary: { habits: true, tasks: false },
  monthGrid: { habits: true, tasks: false },
  skipDays: { habits: true, tasks: false },
  analytics: { habits: true, tasks: false },
  habitReports: { habits: true, tasks: false },
  taskReports: { habits: false, tasks: true },
  calendar: { habits: false, tasks: false },
};

export type WidgetScopePrefs = { habits: string[]; tasks: string[] };
export type WidgetPrefs = WidgetScopePrefs & {
  perWidget: Partial<Record<WidgetId, WidgetScopePrefs>>;
};

const EMPTY: WidgetPrefs = { habits: [], tasks: [], perWidget: {} };

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === "string") : []);

export const readWidgetPrefs = (): WidgetPrefs => {
  try {
    const raw = localStorage.getItem(WIDGET_PREFS_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<WidgetPrefs>;
    const perWidget: WidgetPrefs["perWidget"] = {};
    const src = (parsed.perWidget ?? {}) as Record<string, WidgetScopePrefs>;
    for (const id of WIDGET_IDS) {
      const entry = src[id];
      if (entry) perWidget[id] = { habits: arr(entry.habits), tasks: arr(entry.tasks) };
    }
    return { habits: arr(parsed.habits), tasks: arr(parsed.tasks), perWidget };
  } catch {
    return EMPTY;
  }
};

export const writeWidgetPrefs = (prefs: WidgetPrefs) => {
  try {
    localStorage.setItem(WIDGET_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
};

/** Effective hidden ids for one widget = global hidden + that widget's hidden. */
export const hiddenFor = (prefs: WidgetPrefs, widget: WidgetId): WidgetScopePrefs => {
  const own = prefs.perWidget[widget] ?? { habits: [], tasks: [] };
  return {
    habits: Array.from(new Set([...prefs.habits, ...own.habits])),
    tasks: Array.from(new Set([...prefs.tasks, ...own.tasks])),
  };
};
