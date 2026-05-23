/**
 * Streak and multiplier engine.
 *
 * Rules (from FocusGuildInstructions.md):
 *   - Completing ≥ 1 quest per day increments streak
 *   - Missing a day sets multiplier to 0.75× (no shame spirals — not zero)
 *   - Streak multiplier scales 1.0× → 2.5× linearly over 7 days
 *   - Recalculates at midnight UTC (called by a scheduled job)
 */

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
  lastActivityDate: Date | null; // UTC date of most recent quest completion
  today: Date;                   // UTC date being processed (midnight rollover)
  completedQuestToday: boolean;
}

export interface StreakUpdateResult {
  newStreak: number;
  newMultiplier: number;
  event: 'extended' | 'started' | 'paused' | 'unchanged';
}

function toUTCDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  const aMs = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bMs = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bMs - aMs) / msPerDay);
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

  const gap = daysBetween(lastActivityDate, today);

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
