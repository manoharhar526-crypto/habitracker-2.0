import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Task } from '@/types/task';

const isNative = () => Capacitor.isNativePlatform();

// Custom reminder sound (android/app/src/main/res/raw/hey_its_me_goku.mp3).
// Android keeps the sound tied to the channel, so the channel id is bumped
// whenever the sound changes — otherwise the old sound sticks forever.
export const NOTIF_SOUND = 'hey_its_me_goku.mp3';
export const NOTIF_CHANNEL = 'habit-reminders-v2-goku';

let _channelReady = false;

const ensureChannel = async (): Promise<void> => {
  if (!isNative() || _channelReady) return;
  if (Capacitor.getPlatform() !== 'android') { _channelReady = true; return; }
  try {
    // Drop the older channels so the new sound actually takes effect.
    for (const id of ['habit-reminders', 'habit-reminders-goku', 'default']) {
      try { await LocalNotifications.deleteChannel({ id }); } catch { /* ignore */ }
    }
    await LocalNotifications.createChannel({
      id: NOTIF_CHANNEL,
      name: 'Habit Reminders',
      description: 'Daily habit and goal reminders',
      importance: 5,
      visibility: 1,
      sound: NOTIF_SOUND,
      vibration: true,
    });
    _channelReady = true;
  } catch (e) {
    console.warn('Notification channel error:', e);
  }
};

// ─── Register web service worker ──────────────────────────────────────────────

let _swReg: ServiceWorkerRegistration | null = null;

const getSwReg = async (): Promise<ServiceWorkerRegistration | null> => {
  if (isNative()) return null;
  if (!('serviceWorker' in navigator)) return null;
  if (_swReg) return _swReg;
  try {
    _swReg = await navigator.serviceWorker.register('/sw-notifications.js', { scope: '/' });

    // Reload page when a new SW takes control → users always see latest build
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    // Check for SW updates on load and on focus
    try { await _swReg.update(); } catch { /* ignore */ }
    window.addEventListener('focus', () => { _swReg?.update().catch(() => {}); });

    // One-time cleanup: wipe any caches left behind by older builds
    if ('caches' in window) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch { /* ignore */ }
    }

    return _swReg;
  } catch {
    return null;
  }
};

// ─── Permission ───────────────────────────────────────────────────────────────

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (isNative()) {
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted';
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') {
    await getSwReg(); // ensure SW is registered
    return true;
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await getSwReg();
      return true;
    }
  }
  return false;
};

export const getNotificationStatus = (): 'granted' | 'denied' | 'default' | 'unsupported' => {
  if (isNative()) return 'granted';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

export const getNotificationStatusAsync = async (): Promise<'granted' | 'denied' | 'default' | 'unsupported'> => {
  if (isNative()) {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'granted') return 'granted';
    if (display === 'denied') return 'denied';
    return 'default';
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

// ─── Send immediate notification ─────────────────────────────────────────────

export const sendNotification = async (title: string, body: string): Promise<void> => {
  if (isNative()) {
    try {
      await ensureChannel();
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 900000) + 1,
          title,
          body,
          schedule: { at: new Date(Date.now() + 500) },
          smallIcon: 'ic_stat_notify',
          largeIcon: 'luffy',
          sound: NOTIF_SOUND, channelId: NOTIF_CHANNEL,
          actionTypeId: '',
          extra: null,
        }],
      });
    } catch (e) {
      console.error('Notification error:', e);
    }
    return;
  }
  // Web: use SW if available, else direct
  const sw = await getSwReg();
  if (sw && Notification.permission === 'granted') {
    sw.showNotification(title, { body, icon: '/notification-icon.png' });
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/notification-icon.png' });
  }
};

// ─── Schedule all smart notifications ────────────────────────────────────────
//
// Reminder rules — deliberately quiet:
//   • Nothing pending? No reminder today at all. Being nagged about a habit you
//     already did is the fastest way to make someone mute the app.
//   • Never between midnight and 07:00 — anything landing in that window is
//     pushed to 07:00.
//   • At most two habit reminders a day (a check-in and a last chance) instead
//     of one at every configured time.
//
// Native IDs: 2001=check-in, 2003=last chance, 2004=weekly, 3000+=tasks

/** Reminders are never delivered before this hour. */
export const QUIET_UNTIL_HOUR = 7;

/** Next occurrence of "HH:MM", pushed out of the quiet overnight window. */
const nextAt = (timeStr: string, now: Date): Date => {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(now);
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  if (d.getHours() < QUIET_UNTIL_HOUR) d.setHours(QUIET_UNTIL_HOUR, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
};

/** "Workout", "Workout and Reading", "Workout, Reading and 2 more". */
const nameLine = (names: string[]): string => {
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}`;
  return shown[0] ?? '';
};

/**
 * A snapshot of what is actually finished / unfinished right now.
 * The reminder text is always built from this, so a notification can never
 * claim something is pending when it has already been done, skipped (N/A),
 * or when the day is frozen.
 */
export type DayStatus = {
  /** Habits that exist for today (already excluding N/A + frozen days). */
  totalHabits: number;
  /** Names of habits still unfinished today. */
  pendingHabits: string[];
  /** Habits already ticked off today. */
  doneHabits: number;
  /** Titles of tasks still unfinished (daily / weekly / monthly / general). */
  pendingTasks: string[];
  /** Tasks already completed. */
  doneTasks: number;
};

type PlannedReminder = {
  id: number;
  at: Date;
  title: string;
  body: string;
  /** Daily repeat — only used for the recurring habit reminders. */
  daily: boolean;
};

/**
 * Works out the (very short) list of reminders worth sending.
 * Exported so the behaviour can be tested without a device.
 *
 * Reminders never repeat blindly: the app reschedules every time habits or
 * tasks change, so each reminder carries an up-to-date picture of the day.
 */
export const planHabitReminders = (
  status: DayStatus,
  morningTime: string,
  nightTime: string,
  now = new Date(),
): PlannedReminder[] => {
  const { totalHabits, pendingHabits, doneHabits, pendingTasks, doneTasks } = status;

  // Nothing set up at all — a single gentle nudge, nothing more.
  if (totalHabits === 0 && pendingTasks.length === 0 && doneTasks === 0) {
    return [{
      id: 2001,
      at: nextAt(morningTime, now),
      title: 'Ready to start? 🌱',
      body: 'Add your first habit and begin today.',
      daily: false,
    }];
  }

  // Everything already done: stay silent today, just line up tomorrow morning.
  if (pendingHabits.length === 0 && pendingTasks.length === 0) {
    return [{
      id: 2001,
      at: nextAt(morningTime, now),
      title: 'Good morning! ☀️',
      body: 'You finished everything yesterday. Ready to do it again today?',
      daily: false,
    }];
  }

  // Build a warm, plain-English sentence about what is still waiting.
  const parts: string[] = [];
  if (pendingHabits.length > 0) parts.push(nameLine(pendingHabits));
  if (pendingTasks.length > 0) parts.push(nameLine(pendingTasks));
  const list = parts.join(', plus ');
  const onlyOne = pendingHabits.length + pendingTasks.length === 1;

  const morningBody = onlyOne
    ? `${list} is waiting for you today.`
    : `${list} are waiting for you today.`;

  const nightBody = onlyOne
    ? `Just ${list} left before bed.`
    : `You still have ${list} left today.`;

  const checkIn = nextAt(morningTime, now);
  const lastChance = nextAt(nightTime, now);

  const plan: PlannedReminder[] = [{
    id: 2001,
    at: checkIn,
    title: 'Good morning! ☀️',
    body: morningBody,
    daily: false,
  }];

  // Only add the late nudge when it is genuinely a different, later moment.
  if (lastChance.getTime() - checkIn.getTime() > 60 * 60 * 1000) {
    plan.push({
      id: 2003,
      at: lastChance,
      title: doneHabits > 0 ? 'Almost there! 💪' : 'Quick check before bed 🌙',
      body: nightBody,
      daily: false,
    });
  }

  return plan;
};


export const scheduleSmartNotifications = async (
  status: DayStatus,
  tasks: Task[],
  currentMonth: Date,
  morningTime = '06:00',
  eveningTime = '18:00',
  nightTime = '22:00',
): Promise<void> => {
  if (isNative()) {
    await _scheduleNative(status, tasks, currentMonth, morningTime, nightTime);
  } else {
    await _scheduleWeb(status, tasks, currentMonth, morningTime, nightTime);
  }
};

/** Weekly Sunday recap — once a week is not nagging. */
const weeklySummaryAt = (now: Date): Date | null => {
  const daysUntilSunday = (7 - now.getDay()) % 7;
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday));
  nextSunday.setHours(20, 0, 0, 0);
  return nextSunday > now ? nextSunday : null;
};

// ─── Web scheduling via Service Worker ───────────────────────────────────────

const _scheduleWeb = async (
  status: DayStatus,
  tasks: Task[],
  currentMonth: Date,
  morningTime: string,
  nightTime: string,
) => {
  if (Notification.permission !== 'granted') return;
  const sw = await getSwReg();
  if (!sw || !sw.active) return;

  const now = new Date();
  const notifications: { id: number; at: number; title: string; body: string }[] =
    planHabitReminders(status, morningTime, nightTime, now)
      .map(p => ({ id: p.id, at: p.at.getTime(), title: p.title, body: p.body }));

  const sunday = weeklySummaryAt(now);
  if (sunday) {
    notifications.push({
      id: 2004,
      at: sunday.getTime(),
      title: 'Your week is done! 📈',
      body: 'Take a look at everything you finished this week.',
    });
  }

  // Monthly goals only — daily task pings were pure noise.
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  let taskNotifId = 3000;
  for (const task of tasks.filter(t => !t.completed && t.type === 'monthly')) {
    if (taskNotifId >= 3100) break;
    const taskDate = new Date(year, month, 1, 9, 0, 0, 0);
    if (taskDate > now) {
      notifications.push({ id: taskNotifId++, at: taskDate.getTime(), title: 'Monthly goal 📌', body: `Don't forget about "${task.title}" this month.` });
    }
  }

  sw.active.postMessage({ type: 'SCHEDULE_NOTIFICATIONS', notifications });
};

// ─── Native scheduling ────────────────────────────────────────────────────────

const _scheduleNative = async (
  status: DayStatus,
  tasks: Task[],
  currentMonth: Date,
  morningTime: string,
  nightTime: string,
) => {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
    await ensureChannel();

    const now = new Date();
    const notifications: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];

    const cancelIds = [{ id: 2001 }, { id: 2002 }, { id: 2003 }, { id: 2004 }];
    for (let i = 3000; i < 3100; i++) cancelIds.push({ id: i });
    try { await LocalNotifications.cancel({ notifications: cancelIds }); } catch (e) { console.warn("Notification error:", e); }

    const base = {
      smallIcon: 'ic_stat_notify',
      largeIcon: 'luffy',
      sound: NOTIF_SOUND,
      channelId: NOTIF_CHANNEL,
      actionTypeId: '',
      extra: null,
    } as const;

    for (const p of planHabitReminders(status, morningTime, nightTime, now)) {
      notifications.push({
        id: p.id,
        title: p.title,
        body: p.body,
        schedule: p.daily ? { at: p.at, repeats: true, every: 'day' } : { at: p.at, repeats: false },
        ...base,
      });
    }

    const sunday = weeklySummaryAt(now);
    if (sunday) {
      notifications.push({
        id: 2004,
        title: 'Your week is done! 📈',
        body: 'Take a look at everything you finished this week.',
        schedule: { at: sunday, repeats: true, every: 'week' },
        ...base,
      });
    }

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    let taskNotifId = 3000;
    for (const task of tasks.filter(t => !t.completed && t.type === 'monthly')) {
      if (taskNotifId >= 3100) break;
      const taskDate = new Date(year, month, 1, 9, 0, 0, 0);
      if (taskDate > now) {
        notifications.push({
          id: taskNotifId++,
          title: 'Monthly goal 📌',
          body: `Don't forget about "${task.title}" this month.`,
          schedule: { at: taskDate, repeats: false },
          ...base,
        });
      }
    }

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }
  } catch (e) {
    console.error('scheduleSmartNotifications error:', e);
  }
};

// ─── Cancel all notifications ─────────────────────────────────────────────────

export const cancelAllNotifications = async (): Promise<void> => {
  if (isNative()) {
    try {
      const cancelIds = [{ id: 2001 }, { id: 2002 }, { id: 2003 }, { id: 2004 }];
      for (let i = 3000; i < 3100; i++) cancelIds.push({ id: i });
      await LocalNotifications.cancel({ notifications: cancelIds });
    } catch (e) { console.warn("Notification error:", e); }
    return;
  }
  const sw = await getSwReg();
  if (sw?.active) {
    sw.active.postMessage({ type: 'CANCEL_NOTIFICATIONS' });
  }
};

// ─── Auto-request permission on native app start ──────────────────────────────

export const initNotificationsOnNative = async (): Promise<void> => {
  if (!isNative()) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
    await ensureChannel();
  } catch (e) {
    console.error('Init notifications error:', e);
  }
};

// ── Calendar Note Notifications ───────────────────────────────────────────────
export const scheduleCalendarNoteNotifications = async (notes: import("@/types/calendarNote").CalendarNote[]): Promise<void> => {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") await LocalNotifications.requestPermissions();
    await ensureChannel();

    // Cancel existing calendar note notifications (ids 4000-4999)
    const cancelIds = Array.from({ length: 1000 }, (_, i) => ({ id: 4000 + i }));
    try { await LocalNotifications.cancel({ notifications: cancelIds }); } catch (e) { console.warn("Notification error:", e); }

    const now = new Date();
    const toSchedule: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];
    let idCounter = 4000;

    for (const note of notes) {
      if (!note.notifyAt) continue;
      const [h, m] = note.notifyAt.split(":").map(Number);
      const notifDate = new Date(`${note.date}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`);
      if (notifDate <= now) continue;
      if (idCounter >= 4999) break;

      toSchedule.push({
        id: idCounter++,
        title: "📅 Today's Reminder",
        body: note.title + (note.body ? ` — ${note.body}` : ""),
        schedule: { at: notifDate, repeats: false },
        smallIcon: "ic_stat_notify",
        largeIcon: "luffy",
        sound: NOTIF_SOUND, channelId: NOTIF_CHANNEL,
        actionTypeId: "",
        extra: null,
      });
    }

    if (toSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: toSchedule });
      console.log(`Scheduled ${toSchedule.length} calendar note notifications`);
    }
  } catch (e) {
    console.error("scheduleCalendarNoteNotifications error:", e);
  }
};
