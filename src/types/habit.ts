export interface StreakRecovery {
  /** Last day of the run that ended, "YYYY-MM-DD". */
  endedOn: string;
  /** How many completed days the broken run had. */
  length: number;
  /** True once the user has seen and accepted the fresh start. */
  acknowledged?: boolean;
}

export interface Habit {
  id: string;
  name: string;
  month: string; // "YYYY-MM" - the month this habit belongs to
  completedDays: string[]; // Array of date strings "YYYY-MM-DD" that are completed
  skippedDays?: string[]; // Array of date strings "YYYY-MM-DD" marked as N/A (e.g. holiday, off-day)
  /** Planned weekly days off (0 = Sunday … 6 = Saturday). Never count as missed. */
  restDays?: number[];
  /** Streaks that ended — kept so history survives a fresh start. */
  recoveries?: StreakRecovery[];
  order?: number; // For drag-to-reorder
}

export interface HabitData {
  habits: Habit[];
  currentMonth: Date;
}
