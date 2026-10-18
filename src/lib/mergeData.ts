/**
 * mergeData.ts — merge between the copy on this device and the copy in the cloud.
 *
 * Rules:
 *  - For a habit/task/note that exists on both sides, the NEWER snapshot wins
 *    completely — including its ticks. So un-ticking a day on one device
 *    sticks instead of being resurrected by the other copy.
 *  - Entries that exist on only one side are kept (new on that device),
 *    unless a tombstone says they were deleted.
 *  - Tombstones from both sides are combined, so a delete on any device wins.
 */
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";
import type { CalendarNote } from "@/types/calendarNote";
import { normalizeHabitDays } from "@/lib/habitUtils";
import { mergeTombstones, type Tombstones } from "@/lib/tombstones";

const uniqSorted = (xs: (string | undefined)[]): string[] =>
  Array.from(new Set(xs.filter((x): x is string => typeof x === "string"))).sort();

export type MergeSide = {
  habits: Habit[];
  tasks: Task[];
  calendarNotes: CalendarNote[];
  frozenDates?: string[];
  savedAt?: string;
  deleted?: Partial<Tombstones>;
};

const mergeById = <T extends { id: string }>(
  local: T[],
  remote: T[],
  remoteIsNewer: boolean,
  dead: Record<string, string> = {},
  combine: (older: T, newer: T) => T = (o, n) => ({ ...o, ...n }),
): T[] => {
  const byId = new Map<string, T>();
  for (const l of local) byId.set(l.id, l);
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l) { byId.set(r.id, r); continue; }
    byId.set(r.id, remoteIsNewer ? combine(l, r) : combine(r, l));
  }
  return Array.from(byId.values()).filter(x => !dead[x.id]);
};

export const mergeHabits = (
  local: Habit[], remote: Habit[], remoteIsNewer: boolean, dead?: Record<string, string>,
): Habit[] =>
  mergeById(local, remote, remoteIsNewer, dead, (older, newer) =>
    normalizeHabitDays({
      ...older,
      ...newer,
      month: newer.month ?? older.month,
      order: newer.order ?? older.order,
      restDays: newer.restDays ?? older.restDays,
      completedDays: uniqSorted(newer.completedDays ?? []),
      skippedDays: uniqSorted(newer.skippedDays ?? []),
      recoveries: newer.recoveries ?? older.recoveries,
    }),
  );

export const mergeTasks = (
  local: Task[], remote: Task[], remoteIsNewer: boolean, dead?: Record<string, string>,
): Task[] => mergeById(local, remote, remoteIsNewer, dead);

export const mergeNotes = (
  local: CalendarNote[], remote: CalendarNote[], remoteIsNewer: boolean, dead?: Record<string, string>,
): CalendarNote[] => mergeById(local, remote, remoteIsNewer, dead);

/** Merges a local and a remote snapshot; newest edit wins, deletes stick. */
export const mergeSnapshots = (local: MergeSide, remote: MergeSide) => {
  const localAt = Date.parse(local.savedAt ?? "") || 0;
  const remoteAt = Date.parse(remote.savedAt ?? "") || 0;
  const remoteIsNewer = remoteAt >= localAt;
  const deleted = mergeTombstones(local.deleted, remote.deleted);

  return {
    habits: mergeHabits(local.habits ?? [], remote.habits ?? [], remoteIsNewer, deleted.habits),
    tasks: mergeTasks(local.tasks ?? [], remote.tasks ?? [], remoteIsNewer, deleted.tasks),
    calendarNotes: mergeNotes(local.calendarNotes ?? [], remote.calendarNotes ?? [], remoteIsNewer, deleted.notes),
    frozenDates: uniqSorted(remoteIsNewer ? remote.frozenDates ?? [] : local.frozenDates ?? []),
    deleted,
  };
};
