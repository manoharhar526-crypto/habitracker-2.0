/**
 * forgiveness.ts — the "missing a day shouldn't make you quit" rules.
 *
 *  • Streak freeze — you hold up to 2 freezes and earn 1 back each month.
 *    Spending one on a missed day keeps the streak alive.
 *  • Rest days — planned weekly days off, set per habit. Never a miss.
 *  • Recovery — when a real streak ends, the run is written into history so a
 *    fresh start never erases what you already did.
 */
import type { Habit, StreakRecovery } from "@/types/habit";
import { findBrokenStreak, toDateStr } from "@/lib/habitUtils";

export const MAX_FREEZES = 2;
export const FREEZES_EARNED_PER_MONTH = 1;

export type FreezeState = {
  /** Freezes currently available to spend. */
  credits: number;
  /** Month ("YYYY-MM") the last refill was granted for. */
  refilledMonth: string;
  /** Automatically spend a freeze when a day would otherwise break a streak. */
  auto: boolean;
  /** Dates that consumed a credit (manual freezes on other days are free-form). */
  spentOn: string[];
};

export const defaultFreezeState = (): FreezeState => ({
  credits: MAX_FREEZES,
  refilledMonth: "",
  auto: true,
  spentOn: [],
});

const monthOf = (dateStr: string) => dateStr.substring(0, 7);

/** Grants the monthly freeze refill if a new month has started. */
export const refillFreezes = (state: FreezeState, today = new Date()): FreezeState => {
  const month = toDateStr(today).substring(0, 7);
  if (state.refilledMonth === month) return state;
  // First run: just record the month, the user already starts with a full set.
  const credits = state.refilledMonth
    ? Math.min(MAX_FREEZES, state.credits + FREEZES_EARNED_PER_MONTH)
    : state.credits;
  return { ...state, credits, refilledMonth: month };
};

export type FreezeResult = {
  state: FreezeState;
  frozenDates: string[];
  /** "used" | "returned" | "none" — what happened, for the message shown. */
  outcome: "used" | "returned" | "none";
};

/** Spends or refunds a freeze for one date. Never goes below zero. */
export const toggleFreeze = (
  state: FreezeState,
  frozenDates: string[],
  dateStr: string,
): FreezeResult => {
  if (frozenDates.includes(dateStr)) {
    const refund = state.spentOn.includes(dateStr);
    return {
      state: {
        ...state,
        credits: refund ? Math.min(MAX_FREEZES, state.credits + 1) : state.credits,
        spentOn: state.spentOn.filter(d => d !== dateStr),
      },
      frozenDates: frozenDates.filter(d => d !== dateStr),
      outcome: "returned",
    };
  }

  if (state.credits <= 0) {
    return { state, frozenDates, outcome: "none" };
  }

  return {
    state: {
      ...state,
      credits: state.credits - 1,
      spentOn: [...state.spentOn, dateStr],
    },
    frozenDates: [...frozenDates, dateStr].sort(),
    outcome: "used",
  };
};

/** How many freezes were spent in a given month — shown in stats. */
export const freezesUsedInMonth = (state: FreezeState, monthKey: string): number =>
  state.spentOn.filter(d => monthOf(d) === monthKey).length;

// ─── Recovery mode ────────────────────────────────────────────────────────────

export type RecoveryNotice = {
  habitId: string;
  habitName: string;
  length: number;
  endedOn: string;
};

/**
 * Streaks that just ended and the user hasn't acknowledged yet.
 * Only runs worth mourning (3+ days) are surfaced.
 */
export const findRecoveries = (
  habits: Habit[],
  frozenDates: string[] = [],
  minLength = 3,
): RecoveryNotice[] => {
  const notices: RecoveryNotice[] = [];
  for (const habit of habits) {
    const broken = findBrokenStreak(habit, frozenDates);
    if (!broken || broken.length < minLength) continue;
    const already = (habit.recoveries ?? []).some(
      r => r.endedOn === broken.endedOn && r.acknowledged,
    );
    if (already) continue;
    notices.push({
      habitId: habit.id,
      habitName: habit.name,
      length: broken.length,
      endedOn: broken.endedOn,
    });
  }
  return notices.sort((a, b) => b.length - a.length);
};

/** Writes the ended run into the habit's history and marks it acknowledged. */
export const acknowledgeRecovery = (habit: Habit, notice: RecoveryNotice): Habit => {
  const existing = habit.recoveries ?? [];
  const rest = existing.filter(r => r.endedOn !== notice.endedOn);
  const entry: StreakRecovery = {
    endedOn: notice.endedOn,
    length: notice.length,
    acknowledged: true,
  };
  return { ...habit, recoveries: [...rest, entry].sort((a, b) => a.endedOn.localeCompare(b.endedOn)) };
};

/** Total days banked in past runs — history survives every fresh start. */
export const totalRecoveredDays = (habit: Habit): number =>
  (habit.recoveries ?? []).reduce((sum, r) => sum + r.length, 0);
