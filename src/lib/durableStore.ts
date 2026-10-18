/**
 * durableStore.ts — second, independent copy of everything on the device.
 *
 * localStorage can be wiped by the browser/OS under storage pressure and is
 * capped at ~5 MB. Every save is therefore mirrored into IndexedDB, plus a
 * rolling history of the last few snapshots. On startup the app reads both and
 * keeps whichever is newer, so a wipe of one store never loses data.
 *
 * Everything here is fire-and-forget and never throws.
 */
import { get, set } from "idb-keyval";
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";
import type { CalendarNote } from "@/types/calendarNote";

export type DurableSnapshot = {
  habits: Habit[];
  tasks: Task[];
  calendarNotes?: CalendarNote[];
  currentMonth?: string;
  savedAt: string;
};

const MAX_HISTORY = 10;

const mainKey = (userId?: string) => `durable_app_data_${userId ?? "guest"}`;
const histKey = (userId?: string) => `durable_app_history_${userId ?? "guest"}`;

const hasData = (s: DurableSnapshot | null | undefined) =>
  !!s && ((s.habits?.length ?? 0) > 0 || (s.tasks?.length ?? 0) > 0 || (s.calendarNotes?.length ?? 0) > 0);

/** Writes the snapshot and pushes it onto the rolling history. Never throws. */
export const saveDurable = (snapshot: DurableSnapshot, userId?: string): void => {
  void (async () => {
    try {
      await set(mainKey(userId), snapshot);
      const history = ((await get<DurableSnapshot[]>(histKey(userId))) ?? []).filter(Boolean);
      const last = history[history.length - 1];
      // Only keep a new history entry when something actually changed.
      if (!last || JSON.stringify(last.habits) !== JSON.stringify(snapshot.habits) ||
          JSON.stringify(last.tasks) !== JSON.stringify(snapshot.tasks)) {
        await set(histKey(userId), [...history, snapshot].slice(-MAX_HISTORY));
      }
    } catch {
      /* storage unavailable — localStorage copy still exists */
    }
  })();
};

/** Reads the durable copy, or the newest usable history entry. Never throws. */
export const loadDurable = async (userId?: string): Promise<DurableSnapshot | null> => {
  try {
    const main = await get<DurableSnapshot>(mainKey(userId));
    if (hasData(main)) return main!;
    const history = (await get<DurableSnapshot[]>(histKey(userId))) ?? [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (hasData(history[i])) return history[i];
    }
    return null;
  } catch {
    return null;
  }
};

/** All kept snapshots, newest first — powers "restore an earlier version". */
export const loadDurableHistory = async (userId?: string): Promise<DurableSnapshot[]> => {
  try {
    const history = (await get<DurableSnapshot[]>(histKey(userId))) ?? [];
    return history.filter(hasData).reverse();
  } catch {
    return [];
  }
};

/** Asks the browser to make storage persistent so it is never evicted. */
export const requestPersistentStorage = (): void => {
  void (async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.storage?.persist) {
        const already = await navigator.storage.persisted?.();
        if (!already) await navigator.storage.persist();
      }
    } catch {
      /* ignore */
    }
  })();
};
