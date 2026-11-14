/**
 * The words under a signed-in iPhone in Settings: when it was connected and
 * when it was last used. The server writes "last used" at most once an hour,
 * so the list speaks in days, never in minutes.
 */

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from `then` to `now` in local time; 0 for today or a time ahead of the clock. */
export function calendarDaysAgo(then: Date, now: Date): number {
  // Round, not floor: a day across a clock change is 23 or 25 hours long.
  return Math.max(0, Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / 86_400_000));
}

/** "Last used today", "Last used yesterday", "Last used 3 days ago". */
export function lastUsedLabel(lastUsedAt: string | null, now: Date = new Date()): string {
  if (!lastUsedAt) return 'Not used yet';
  const at = new Date(lastUsedAt);
  if (Number.isNaN(at.getTime())) return 'Not used yet';
  const days = calendarDaysAgo(at, now);
  if (days === 0) return 'Last used today';
  if (days === 1) return 'Last used yesterday';
  return `Last used ${days} days ago`;
}

/** "Connected 12 Nov 2026", in the member's own date format. */
export function connectedLabel(createdAt: string): string {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return 'Connected';
  return `Connected ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
