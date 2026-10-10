/**
 * Hour logs: quests with no estimate, where the only number is time put in.
 *
 * Some things have no finish line to estimate towards — practising an
 * instrument, reading for a course, hours on a long project. An estimate on
 * those is a made-up number that the planner then treats as a debt. An hour
 * log has none: you write down what you did ("1 h 30, scales and the étude")
 * and the app adds it up. Nothing is planned, nothing is ever "behind".
 *
 * How it is stored, with no new tables:
 *   - The quest itself is an ordinary row with `estimatedMinutes = 0`. Zero
 *     minutes is what "no estimate" already means, and every reader of the
 *     column was checked against it (the planner and the priority list skip
 *     these; calibration and the estimate achievements ignore a zero).
 *   - Each entry is a row in the activity log with kind `quest.hours`, the
 *     quest as its subject and `{ minutes, note }` as data. The log is where
 *     the app already keeps "what I did, in my own words" (journal lines live
 *     there too), so an entry shows up in the Journal with no extra work.
 *   - The running total is the quest's `actualMinutes`, the same column the
 *     focus timer adds to, so time from the stopwatch and time written by
 *     hand land in one number.
 *
 * Everything here is pure; the routes do the reading and writing.
 */

import { z } from 'zod';

export const HOURS_KIND = 'quest.hours';
/** Timer sessions carry their minutes too, so they appear in the same list. */
export const FOCUS_KIND = 'focus';

/** No estimate: the quest is a log of hours, not a job to finish. */
export const isOpenEnded = (quest: { estimatedMinutes: number }): boolean => quest.estimatedMinutes === 0;

export const LogHoursSchema = z.object({
  minutes: z.number().int().min(1).max(24 * 60),
  note: z.string().trim().max(500).optional(),
  /** The local day the time was spent, `YYYY-MM-DD`. Omitted means now. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** `Date.prototype.getTimezoneOffset()`, the convention the planner uses. */
  tz: z.number().int().min(-840).max(840).optional(),
});

/** Local calendar day of an instant, for a `getTimezoneOffset()` value. */
export function localDay(at: Date, tzOffsetMin: number): string {
  return new Date(at.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/**
 * When an entry happened. Today's entries are stamped with the moment they
 * were written; an entry for another day sits at that day's local noon, so it
 * sorts inside its own day whatever the timezone. Null for a day that has not
 * happened yet (you can't log tomorrow) or that is not a real date.
 */
export function entryInstant(date: string | undefined, tzOffsetMin: number, now: Date): Date | null {
  const today = localDay(now, tzOffsetMin);
  if (!date || date === today) return now;
  if (date > today) return null;
  const noonUtc = Date.parse(`${date}T12:00:00.000Z`);
  // Date.parse rolls "02-30" over to March; a round trip catches that.
  if (Number.isNaN(noonUtc) || new Date(noonUtc).toISOString().slice(0, 10) !== date) return null;
  return new Date(noonUtc + tzOffsetMin * 60_000);
}

/** "45 min", "2 h", "1 h 30": how a person would write it in a notebook. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** The finished sentence kept in the activity log (and so in AI bundles). */
export function hoursLine(title: string, minutes: number, note?: string): string {
  const base = `Logged ${formatDuration(minutes)} on "${title}"`;
  return note ? `${base}: ${note}` : base;
}

/** Minutes carried by a log row, or 0 for a row from before they were kept. */
export function minutesOf(data: unknown): number {
  const m = (data as { minutes?: unknown } | null)?.minutes;
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? Math.round(m) : 0;
}

/** Monday 00:00 of the local week `now` falls in, as an instant. */
export function weekStart(now: Date, tzOffsetMin: number): Date {
  const local = new Date(now.getTime() - tzOffsetMin * 60_000);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceMonday);
  return new Date(mondayLocal + tzOffsetMin * 60_000);
}

export interface HourTotals {
  todayMinutes: number;
  weekMinutes: number;
  /** Most recent entry, for "last logged 3 days ago". */
  lastAt: Date | null;
}

/** Today and this week (from Monday), from the entries of one quest. */
export function hourTotals(
  entries: Array<{ at: Date; minutes: number }>,
  now: Date,
  tzOffsetMin: number,
): HourTotals {
  const today = localDay(now, tzOffsetMin);
  const monday = weekStart(now, tzOffsetMin).getTime();
  let todayMinutes = 0;
  let weekMinutes = 0;
  let lastAt: Date | null = null;
  for (const e of entries) {
    if (e.minutes <= 0) continue;
    if (localDay(e.at, tzOffsetMin) === today) todayMinutes += e.minutes;
    if (e.at.getTime() >= monday) weekMinutes += e.minutes;
    if (!lastAt || e.at > lastAt) lastAt = e.at;
  }
  return { todayMinutes, weekMinutes, lastAt };
}
