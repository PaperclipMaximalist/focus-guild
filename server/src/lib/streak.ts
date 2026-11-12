/**
 * Streak and multiplier engine.
 *
 * Rules (from FocusGuildInstructions.md):
 *   - Completing ≥ 1 quest per day increments streak
 *   - Missing a day sets multiplier to 0.75× (no shame spirals — not zero)
 *   - Streak multiplier scales 1.0× → 2.5× linearly over 7 days
 *   - "A day" is the member's own calendar day (their timezone, and their
 *     working day when their hours run past midnight), not the UTC date
 */

import { memberDay, MS_PER_DAY } from './memberDay.js';
import type { HoursWindow } from './scheduler/tz.js';

export interface StreakState {
  currentStreak: number;
  multiplier: number;
}

/**
 * Multiplier curve: 1.0× at day 0, 2.5× at day 7+.
 * Linear growth of 1.5 over 7 days.
 */
export function computeMultiplier(streakDays: number): number {
  if (streakDays <= 0) return 1.0;
  return Math.min(1.0 + (streakDays / 7) * 1.5, 2.5);
}

export interface StreakUpdateInput {
  currentStreak: number;
  lastActivityDate: Date | null; // instant of the most recent quest completion
  today: Date;                   // the instant being processed (now)
  completedQuestToday: boolean;
  /**
   * The member's `getTimezoneOffset()`: both instants are read as days on
   * their clock. 0 (UTC) when not given.
   */
  tzOffsetMin?: number;
  /** Their working hours: a window past midnight keeps 01:00 on the day it started. */
  workingHours?: HoursWindow;
}

export interface StreakUpdateResult {
  newStreak: number;
  newMultiplier: number;
  event: 'extended' | 'started' | 'paused' | 'unchanged';
}

/** Whole member days from `a` to `b`. */
function daysBetween(a: Date, b: Date, tzOffsetMin: number, hours?: HoursWindow): number {
  const aKey = memberDay(a.getTime(), tzOffsetMin, hours).key.getTime();
  const bKey = memberDay(b.getTime(), tzOffsetMin, hours).key.getTime();
  return Math.round((bKey - aKey) / MS_PER_DAY);
}

export function updateStreak(input: StreakUpdateInput): StreakUpdateResult {
  const { currentStreak, lastActivityDate, today, completedQuestToday } = input;

  // First-ever completion
  if (lastActivityDate === null) {
    if (!completedQuestToday) {
      return { newStreak: 0, newMultiplier: 1.0, event: 'unchanged' };
    }
    return { newStreak: 1, newMultiplier: computeMultiplier(1), event: 'started' };
  }

  const gap = daysBetween(lastActivityDate, today, input.tzOffsetMin ?? 0, input.workingHours);

  // Same calendar day — already counted; just ensure multiplier is correct
  if (gap === 0) {
    return {
      newStreak: currentStreak,
      newMultiplier: computeMultiplier(currentStreak),
      event: 'unchanged',
    };
  }

  // Consecutive day — extend streak
  if (gap === 1 && completedQuestToday) {
    const newStreak = currentStreak + 1;
    return { newStreak, newMultiplier: computeMultiplier(newStreak), event: 'extended' };
  }

  // Missed one or more days — streak pauses, multiplier drops to 0.75×
  // (We keep currentStreak count so the member can see their history, but
  //  the effective multiplier signals the pause without a shame-inducing zero.)
  return { newStreak: 0, newMultiplier: 0.75, event: 'paused' };
}

/**
 * Called at midnight UTC rollover by the scheduled job.
 * Processes members who did NOT complete any quest yesterday.
 */
export function applyMidnightRollover(state: StreakState): StreakState {
  // If multiplier was already paused (0.75) keep it; otherwise apply pause
  if (state.multiplier <= 0.75) {
    return state;
  }
  return { currentStreak: 0, multiplier: 0.75 };
}
