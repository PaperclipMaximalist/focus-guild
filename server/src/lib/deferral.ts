/**
 * "Not Today" — the Bible's first-class escape hatch: drop it for today,
 * reschedule tomorrow.
 *
 * It used to set status NOT_TODAY and nothing ever set it back, while the
 * quest list and the planner only load ACTIVE quests, so the button quietly
 * deleted the quest from the user's life. Now:
 *
 *   - the planner keeps NOT_TODAY quests and holds them to tomorrow
 *     (adapter → Task.notBefore), so the Feed shows them the next day;
 *   - this revives them to ACTIVE once the day they were deferred on is over.
 *
 * With the user's timezone the cut-off is their local midnight. Without it
 * (some schedule routes don't carry one) a deferral older than 20 hours is
 * revived: never the same evening, reliably by the next afternoon.
 */

import { db } from '../db/client.js';
import { userMidnightUtc, workDayStartUtc, type HoursWindow } from './scheduler/tz.js';

const FALLBACK_AGE_MS = 20 * 60 * 60_000;

/**
 * When the user's current day began: a deferral from before it is over.
 * Their local midnight, or, with working hours that run past midnight
 * (22–06), the hour the last session closed: a quest waved off at 23:00
 * must not be back at 00:05, mid-session, just because the date changed.
 */
export function deferralCutoff(now: number, tzOffsetMin?: number, workingHours?: HoursWindow): number {
  if (tzOffsetMin === undefined) return now - FALLBACK_AGE_MS;
  return workingHours ? workDayStartUtc(now, tzOffsetMin, workingHours) : userMidnightUtc(now, tzOffsetMin);
}

export async function reviveDeferred(
  userId: string,
  tzOffsetMin?: number,
  now = Date.now(),
  workingHours?: HoursWindow,
): Promise<number> {
  const cutoff = deferralCutoff(now, tzOffsetMin, workingHours);
  const res = await db.quest.updateMany({
    where: { userId, status: 'NOT_TODAY', updatedAt: { lt: new Date(cutoff) } },
    data: { status: 'ACTIVE' },
  });
  return res.count;
}
