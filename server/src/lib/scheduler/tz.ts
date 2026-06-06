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
