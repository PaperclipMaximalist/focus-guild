/**
 * Timezone helpers used across the scheduler. Day boundaries and "hour H"
 * computations live in user-local time, not server-local — Railway runs in
 * UTC and Date.setHours() there is meaningless to a PDT user.
 *
 * `tzOffsetMin` is the value `Date.prototype.getTimezoneOffset()` returns
 * on the client (minutes to ADD to local time to reach UTC). PDT → +420,
 * UTC → 0, JST → −540.
 */

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Midnight (00:00) in the user's timezone, returned as UTC ms. */
export function userMidnightUtc(utcMs: number, tzOffsetMin: number): number {
  const userLocalView = new Date(utcMs - tzOffsetMin * MS_PER_MIN);
  userLocalView.setUTCHours(0, 0, 0, 0);
  return userLocalView.getTime() + tzOffsetMin * MS_PER_MIN;
}

/** Hour `h` (0..24) on the user-local day starting at `midnightUtc`, as UTC ms. */
export function userHourUtc(midnightUtc: number, h: number): number {
  return midnightUtc + h * MS_PER_HOUR;
}

// ─── Working windows that may run past midnight ──────────────────────────────
//
// Settings takes a start and an end hour independently. A night-shift worker
// who set 22:00–06:00 used to get `end <= start` on every day, so the planner
// planned nothing at all and said nothing about it. An end before the start
// now means "until that hour tomorrow", and these helpers are the one place
// that reading lives.

export interface HoursWindow {
  startHour: number;
  endHour: number;
}

/** True when the window runs past midnight (22–06, 14–02): the end is the next day's. */
export function crossesMidnight(hours: HoursWindow): boolean {
  return hours.endHour < hours.startHour;
}

/** Length of the working window in hours. 0 when start and end are the same time. */
export function windowHours(hours: HoursWindow): number {
  const span = hours.endHour - hours.startHour;
  return span < 0 ? span + 24 : span;
}

/**
 * The working window that STARTS on the user-local day beginning at
 * `midnightUtc`. A day belongs to the date its window starts on: Monday's
 * 22–06 runs from Monday 22:00 to Tuesday 06:00.
 */
export function workWindowUtc(midnightUtc: number, hours: HoursWindow): { start: number; end: number } {
  return {
    start: userHourUtc(midnightUtc, hours.startHour),
    end: userHourUtc(crossesMidnight(hours) ? midnightUtc + MS_PER_DAY : midnightUtc, hours.endHour),
  };
}

/**
 * The hour at which the user's day turns over. Midnight for ordinary hours;
 * for a window that runs past midnight, the hour it closes. At 01:00 with
 * hours 22–06 the person is mid-session and it is still "today" for them
 * until 06:00, whatever the calendar says.
 */
function dayTurnMs(hours: HoursWindow): number {
  return crossesMidnight(hours) ? hours.endHour * MS_PER_HOUR : 0;
}

/** Midnight (UTC ms) of the date the user's current working day belongs to. */
export function workDayMidnightUtc(utcMs: number, tzOffsetMin: number, hours: HoursWindow): number {
  return userMidnightUtc(utcMs - dayTurnMs(hours), tzOffsetMin);
}

/** When the user's current working day began: the last time their day turned over. */
export function workDayStartUtc(utcMs: number, tzOffsetMin: number, hours: HoursWindow): number {
  return workDayMidnightUtc(utcMs, tzOffsetMin, hours) + dayTurnMs(hours);
}

/**
 * When the user's current working day is over. "Not Today" holds a quest
 * until then: the next local midnight for ordinary hours, the end of the
 * session for hours that run past midnight (so a quest waved off at 23:00
 * doesn't come back at 00:00, an hour into the same night).
 */
export function workDayEndUtc(utcMs: number, tzOffsetMin: number, hours: HoursWindow): number {
  return workDayStartUtc(utcMs, tzOffsetMin, hours) + MS_PER_DAY;
}

/** `dayKey` of the working day an instant belongs to (02:00 in a 22–06 window is still yesterday). */
export function workDayKey(utcMs: number, tzOffsetMin: number, hours: HoursWindow): string {
  return dayKey(utcMs - dayTurnMs(hours), tzOffsetMin);
}

/**
 * Why these hours can never produce a plan, in words for the user; null when
 * they can. Start and end at the same time is a zero-length day (it is not
 * read as 24 hours: 00:00–24:00 says that).
 */
export function workingHoursProblem(hours: HoursWindow): string | null {
  const { startHour, endHour } = hours;
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || startHour < 0 || startHour >= 24 || endHour < 0 || endHour > 24)
    return 'Working hours must be times of day: a start from 00:00 to 23:30 and an end from 00:00 to 24:00.';
  if (windowHours(hours) === 0)
    return 'Working hours start and end at the same time, which leaves no time to plan. Set an end after the start, or an end earlier than the start for hours that run past midnight (22:00 to 06:00).';
  return null;
}

/** User-local hour (0..23) for the given UTC ms. */
export function userHourOf(utcMs: number, tzOffsetMin: number): number {
  const userLocalView = new Date(utcMs - tzOffsetMin * MS_PER_MIN);
  return userLocalView.getUTCHours();
}

/** Stable per-day string key in user-local time. Format: `YYYY-M-D` (unpadded). */
export function dayKey(utcMs: number, tzOffsetMin = 0): string {
  const d = new Date(utcMs - tzOffsetMin * MS_PER_MIN);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
