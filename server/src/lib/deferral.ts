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
import { userMidnightUtc } from './scheduler/tz.js';

const FALLBACK_AGE_MS = 20 * 60 * 60_000;

export async function reviveDeferred(userId: string, tzOffsetMin?: number, now = Date.now()): Promise<number> {
  const cutoff = tzOffsetMin === undefined ? now - FALLBACK_AGE_MS : userMidnightUtc(now, tzOffsetMin);
  const res = await db.quest.updateMany({
    where: { userId, status: 'NOT_TODAY', updatedAt: { lt: new Date(cutoff) } },
    data: { status: 'ACTIVE' },
  });
  return res.count;
}
