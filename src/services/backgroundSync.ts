/**
 * backgroundSync.ts
 *
 * Silently syncs user data to Supabase in the background.
 *
 * Queue store: IndexedDB (via idb-keyval) — survives larger payloads than the
 * 5 MB localStorage cap and avoids blocking the main thread. Reads localStorage
 * once on startup to migrate any pre-existing queue.
 *
 * Flow:
 *   enqueue(userId, payload)
 *     → coalesces into per-user queue slot (IndexedDB)
 *     → debounces 1500 ms
 *     → UPSERT to user_sync_data
 *     → retries up to 3× with backoff on failure
 *     → if offline, defers until 'online' event fires
 *     → flushes on app resume (visibilitychange)
 */

import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";
import type { CalendarNote } from "@/types/calendarNote";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncPayload {
  habits:        Habit[];
  tasks:         Task[];
  calendarNotes: CalendarNote[];
  currentMonth?: string;
  frozenDates?:  string[];
  username?:     string | null;
  savedAt?:      string;
  deleted?:      { habits: Record<string, string>; tasks: Record<string, string>; notes: Record<string, string> };
}

interface QueueItem {
  id:          string;
  userId:      string;
  payload:     SyncPayload;
  enqueuedAt:  string;
  attempts:    number;
  synced:      boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_KEY    = "bg_sync_queue";
const DEBOUNCE_MS  = 1500;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // ms between successive retries

// ── Queue helpers (IndexedDB-backed) ──────────────────────────────────────────

let migrated = false;
async function migrateLegacyOnce(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(QUEUE_KEY) : null;
    if (!raw) return;
    const existing = (await get<QueueItem[]>(QUEUE_KEY)) ?? [];
    if (existing.length === 0) {
      const parsed = JSON.parse(raw) as QueueItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        await set(QUEUE_KEY, parsed);
      }
    }
    localStorage.removeItem(QUEUE_KEY);
  } catch { /* ignore migration errors */ }
}

async function loadQueue(): Promise<QueueItem[]> {
  await migrateLegacyOnce();
  try {
    return (await get<QueueItem[]>(QUEUE_KEY)) ?? [];
  } catch { return []; }
}

async function saveQueue(q: QueueItem[]): Promise<void> {
  try { await set(QUEUE_KEY, q); } catch { /* quota / db error */ }
}

async function clearSynced(): Promise<void> {
  const q = await loadQueue();
  await saveQueue(q.filter(i => !i.synced));
}

// ── Per-user flush lock ──────────────────────────────────────────────────────
const flushingUsers = new Set<string>();

// ── Debounce timers (per user) ────────────────────────────────────────────────
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Core flush ────────────────────────────────────────────────────────────────

async function flush(userId: string): Promise<void> {
  if (flushingUsers.has(userId)) return;
  if (!navigator.onLine) return;

  const queue = (await loadQueue()).filter(i => !i.synced && i.userId === userId);
  if (queue.length === 0) return;

  // Coalesce: use the latest queued snapshot for this user
  const latest = queue[queue.length - 1];

  flushingUsers.add(userId);
  let success = false;

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
        await new Promise(r => setTimeout(r, delay));
      }

      try {
        const { error } = await supabase
          .from("user_sync_data")
          .upsert(
            {
              user_id:     userId,
              payload:     latest.payload as unknown as Json,
              sync_status: "synced",
              updated_at:  new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (error) throw error;

        const q = await loadQueue();
        await saveQueue(q.map(i => i.userId === userId ? { ...i, synced: true } : i));
        await clearSynced();
        success = true;
        break;

      } catch (err: any) {
        console.warn(`[bgSync] attempt ${attempt + 1}/${MAX_ATTEMPTS} failed for ${userId}:`, err?.message ?? err);

        const q = await loadQueue();
        await saveQueue(q.map(i => i.id === latest.id ? { ...i, attempts: i.attempts + 1 } : i));

        const isAuthError = err?.status === 401 || err?.code === "PGRST301";
        if (isAuthError) {
          console.warn("[bgSync] Auth error — skipping retries");
          break;
        }
      }
    }

    if (!success) {
      console.error("[bgSync] All retries exhausted for userId:", userId);
    }
  } finally {
    flushingUsers.delete(userId);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a sync for userId. Debounces 1500ms then flushes.
 * Safe to call on every state change — rapid calls are coalesced.
 * Queue persistence is async (IndexedDB) but fire-and-forget; the debounced
 * flush awaits the actual queue read before sending to Supabase.
 */
export function enqueue(userId: string, payload: SyncPayload): void {
  if (!userId) return;

  const item: QueueItem = {
    id:         `${userId}_${Date.now()}`,
    userId,
    payload,
    enqueuedAt: new Date().toISOString(),
    attempts:   0,
    synced:     false,
  };

  // Coalesce: keep synced items + one pending item per user (the latest)
  void (async () => {
    const q = (await loadQueue()).filter(i => i.synced || i.userId !== userId);
    await saveQueue([...q, item]);
  })();

  const existing = debounceTimers.get(userId);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    userId,
    setTimeout(() => {
      debounceTimers.delete(userId);
      void flush(userId);
    }, DEBOUNCE_MS)
  );
}

/**
 * Cancel any pending debounce timer for a user and remove their unsynced
 * queue items. Call this on logout.
 */
export function cancelPending(userId: string): void {
  const timer = debounceTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(userId);
  }
  void (async () => {
    const q = await loadQueue();
    await saveQueue(q.filter(i => i.synced || i.userId !== userId));
  })();
}

export function clearDebounce(userId: string): void {
  const timer = debounceTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(userId);
  }
}

/**
 * Immediately flush all (or one user's) pending queue items.
 * Called on 'online' event and app resume.
 */
export async function flushPending(userId?: string): Promise<void> {
  const q = (await loadQueue()).filter(i => !i.synced);
  const ids = userId ? [userId] : [...new Set(q.map(i => i.userId))];
  await Promise.all(ids.map(id => flush(id)));
}

// ── Auto-retry on reconnect / app resume ─────────────────────────────────────

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("[bgSync] Back online — flushing pending queue");
    debounceTimers.forEach((timer, uid) => {
      clearTimeout(timer);
      debounceTimers.delete(uid);
    });
    void flushPending();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void flushPending();
    }
  });
}
