/**
 * Shared date helpers used across the calendar, feed, stats, etc.
 * Keeping these in one place avoids drift (e.g. zero-padded vs unpadded
 * day keys, weekday letter conventions) — small consolidation done as
 * part of the post-refactor simplify pass.
 */

/** Midnight at the start of `d`'s day, as a fresh Date. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Same calendar day in local time. */
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * Stable per-day string key used for lookup maps. Format: `YYYY-M-D`
 * (unpadded — month is 1-indexed). Don't change without auditing every
 * caller; the key is matched literally against itself only.
 */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** One-letter weekday header for compact month grids. */
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
