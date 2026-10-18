import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";
import type { CalendarNote } from "@/types/calendarNote";
import { STORAGE_KEYS } from "@/lib/constants";
import { normalizeHabitDays } from "@/lib/habitUtils";
import { defaultFreezeState, MAX_FREEZES, type FreezeState } from "@/lib/forgiveness";
import { saveDurable } from "@/lib/durableStore";

const userStorageKey     = (userId: string) => `${STORAGE_KEYS.APP_DATA}_${userId}`;
const userSettingsKey    = (userId: string) => `${STORAGE_KEYS.SETTINGS}_${userId}`;
const userCalNotesKey    = (userId: string) => `${STORAGE_KEYS.CALENDAR_NOTES}_${userId}`;

// Legacy keys (no userId) — read-once for migration, then never written again
const STORAGE_KEY        = STORAGE_KEYS.APP_DATA;
const SETTINGS_KEY       = STORAGE_KEYS.SETTINGS;
const CALENDAR_NOTES_KEY = STORAGE_KEYS.CALENDAR_NOTES;

type StoredStateV1 = {
  habits: Habit[];
  tasks: Task[];
  currentMonth: string;
  savedAt?: string;
};

export type AppSettings = {
  reminderEnabled: boolean;
  morningTime: string;
  eveningTime: string;
  nightTime: string;
  frozenDates: string[];
  timezone: string;
  /** Streak-freeze wallet: how many are left, when they were last topped up. */
  freeze?: FreezeState;
};

const defaultSettings: AppSettings = {
  reminderEnabled: false,
  morningTime: "06:00",
  eveningTime: "18:00",
  nightTime: "22:00",
  frozenDates: [],
  timezone: "",
  freeze: defaultFreezeState(),
};

// ── App Data ──────────────────────────────────────────────────────────────────
export const loadAppStorage = (userId?: string): { habits: Habit[]; tasks: Task[]; currentMonth: Date; savedAt?: string } | null => {
  try {
    // Per-user key takes priority; fall back to legacy key only once (migration)
    const key = userId ? userStorageKey(userId) : STORAGE_KEY;
    let raw = window.localStorage.getItem(key);

    // One-time migration: if per-user key is empty but legacy key has data, move it
    if (!raw && userId) {
      const legacy = window.localStorage.getItem(STORAGE_KEY);
      if (legacy) {
        window.localStorage.setItem(key, legacy);
        window.localStorage.removeItem(STORAGE_KEY);
        raw = legacy;
      }
    }

    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredStateV1>;
    if (!Array.isArray(parsed.habits) || !Array.isArray(parsed.tasks)) return null;
    const migratedHabits = (parsed.habits as Habit[]).map((h, i) => {
      const withMonth = !h.month ? (() => {
        const firstDate = h.completedDays?.[0];
        const month = firstDate
          ? firstDate.substring(0, 7)
          : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        return { ...h, month };
      })() : h;
      const ordered = withMonth.order === undefined ? { ...withMonth, order: i } : withMonth;
      // Repair legacy rows where a day was saved as both done and N/A.
      return normalizeHabitDays(ordered);
    });
    const restoredMonth = parsed.currentMonth ? new Date(parsed.currentMonth) : new Date();
    const currentMonth  = isNaN(restoredMonth.getTime()) ? new Date() : restoredMonth;
    return { habits: migratedHabits, tasks: parsed.tasks as Task[], currentMonth, savedAt: parsed.savedAt };
  } catch (e) { console.warn("Storage error:", e); return null; }
};

export const saveAppStorage = (state: { habits: Habit[]; tasks: Task[]; currentMonth: Date }, userId?: string) => {
  try {
    const key = userId ? userStorageKey(userId) : STORAGE_KEY;
    const payload: StoredStateV1 = {
      habits:       state.habits,
      tasks:        state.tasks,
      currentMonth: state.currentMonth.toISOString(),
      savedAt:      new Date().toISOString(),
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
    // Second, independent copy: IndexedDB survives a localStorage wipe.
    saveDurable(
      { habits: state.habits, tasks: state.tasks, currentMonth: payload.currentMonth, savedAt: payload.savedAt! },
      userId,
    );
  } catch (e) {
    console.warn("Storage error:", e);
    // Even if localStorage failed (quota/private mode), keep the durable copy.
    saveDurable(
      {
        habits: state.habits,
        tasks: state.tasks,
        currentMonth: state.currentMonth.toISOString(),
        savedAt: new Date().toISOString(),
      },
      userId,
    );
  }
};

// ── Manual Code Backups ───────────────────────────────────────────────────────
const MANUAL_BACKUPS_KEY = "habit_tracker_manual_backups";

export type ManualBackup = {
  code: string;
  habits: Habit[];
  tasks: Task[];
  createdAt: string;
  label?: string;
};

export const loadManualBackups = (): ManualBackup[] => {
  try {
    const raw = window.localStorage.getItem(MANUAL_BACKUPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ManualBackup[];
  } catch (e) { console.warn("Storage error:", e); return []; }
};

export const saveManualBackup = (code: string, habits: Habit[], tasks: Task[], label?: string): { success: boolean; error?: string } => {
  try {
    const existing = loadManualBackups();
    if (existing.find(b => b.code.toLowerCase() === code.toLowerCase()))
      return { success: false, error: "A backup with this code already exists. Choose a different code." };
    const newBackup: ManualBackup = { code, habits, tasks, createdAt: new Date().toISOString(), label };
    window.localStorage.setItem(MANUAL_BACKUPS_KEY, JSON.stringify([...existing, newBackup]));
    return { success: true };
  } catch (e) { console.warn("Backup error:", e); return { success: false, error: "Failed to save backup." }; }
};

export const restoreManualBackup = (code: string): { success: boolean; habits?: Habit[]; tasks?: Task[]; error?: string } => {
  try {
    const found = loadManualBackups().find(b => b.code.toLowerCase() === code.toLowerCase());
    if (!found) return { success: false, error: "No backup found with that code." };
    return { success: true, habits: found.habits, tasks: found.tasks };
  } catch (e) { console.warn("Restore error:", e); return { success: false, error: "Failed to restore backup." }; }
};

export const deleteManualBackup = (code: string): boolean => {
  try {
    const updated = loadManualBackups().filter(b => b.code.toLowerCase() !== code.toLowerCase());
    window.localStorage.setItem(MANUAL_BACKUPS_KEY, JSON.stringify(updated));
    return true;
  } catch (e) { console.warn("Storage error:", e); return false; }
};


export const loadSettings = (userId?: string): AppSettings => {
  try {
    const key = userId ? userSettingsKey(userId) : SETTINGS_KEY;
    let raw = window.localStorage.getItem(key);
    if (!raw && userId) {
      const legacy = window.localStorage.getItem(SETTINGS_KEY);
      if (legacy) {
        window.localStorage.setItem(key, legacy);
        window.localStorage.removeItem(SETTINGS_KEY);
        raw = legacy;
      }
    }
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      reminderEnabled: parsed.reminderEnabled ?? defaultSettings.reminderEnabled,
      morningTime:     parsed.morningTime     ?? defaultSettings.morningTime,
      eveningTime:     parsed.eveningTime     ?? defaultSettings.eveningTime,
      nightTime:       parsed.nightTime       ?? defaultSettings.nightTime,
      frozenDates:     Array.isArray(parsed.frozenDates) ? parsed.frozenDates : [],
      timezone:        typeof parsed.timezone === "string" ? parsed.timezone : "",
      freeze: {
        ...defaultFreezeState(),
        ...(parsed.freeze ?? {}),
        credits: Math.max(0, Math.min(MAX_FREEZES, parsed.freeze?.credits ?? MAX_FREEZES)),
        spentOn: Array.isArray(parsed.freeze?.spentOn) ? parsed.freeze!.spentOn : [],
      },
    };
  } catch (e) { console.warn("Storage error:", e); return defaultSettings; }
};

export const saveSettings = (settings: AppSettings, userId?: string) => {
  try {
    const key = userId ? userSettingsKey(userId) : SETTINGS_KEY;
    window.localStorage.setItem(key, JSON.stringify(settings));
  } catch (e) { console.warn("Storage error:", e); }
};

// ── Clear all (for one user) ──────────────────────────────────────────────────
export const clearAllStorage = (userId?: string) => {
  try {
    if (userId) {
      window.localStorage.removeItem(userStorageKey(userId));
      window.localStorage.removeItem(userSettingsKey(userId));
      window.localStorage.removeItem(userCalNotesKey(userId));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(SETTINGS_KEY);
      window.localStorage.removeItem(CALENDAR_NOTES_KEY);
    }
  } catch (e) { console.warn("Storage error:", e); }
};

// ── Calendar Notes ────────────────────────────────────────────────────────────
export const loadCalendarNotes = (userId?: string): CalendarNote[] => {
  try {
    const key = userId ? userCalNotesKey(userId) : CALENDAR_NOTES_KEY;
    let raw = window.localStorage.getItem(key);
    if (!raw && userId) {
      const legacy = window.localStorage.getItem(CALENDAR_NOTES_KEY);
      if (legacy) {
        window.localStorage.setItem(key, legacy);
        window.localStorage.removeItem(CALENDAR_NOTES_KEY);
        raw = legacy;
      }
    }
    if (!raw) return [];
    return JSON.parse(raw) as CalendarNote[];
  } catch (e) { console.warn("Storage error:", e); return []; }
};

export const saveCalendarNotes = (notes: CalendarNote[], userId?: string) => {
  try {
    const key = userId ? userCalNotesKey(userId) : CALENDAR_NOTES_KEY;
    window.localStorage.setItem(key, JSON.stringify(notes));
  } catch (e) { console.warn("Storage error:", e); }
};
