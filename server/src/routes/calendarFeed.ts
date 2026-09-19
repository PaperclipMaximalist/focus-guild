/**
 * GET /calendar/<personal token>.ics — your plan, as a calendar feed.
 *
 * Token-authenticated like /inbox, because calendar apps subscribe to a plain
 * URL and cannot send headers. Read-only: it never changes anything, so the
 * worst a leaked link can do is reveal your quest titles — the same trade
 * Google and Outlook make with their own secret addresses.
 */

import { Hono } from 'hono';
import { db } from '../db/client.js';
import { PAT_PREFIX, hashPersonalToken } from '../lib/tokens.js';
import { buildIcsFeed, type FeedBlock } from '../lib/calendar/publish.js';

export const calendarFeed = new Hono();

/** How much of the plan to publish. Past blocks stay as a record. */
const BACK_MS = 7 * 86_400_000;
const AHEAD_MS = 60 * 86_400_000;

calendarFeed.get('/:file', async (c) => {
  const token = c.req.param('file').replace(/\.ics$/i, '');
  if (!token.startsWith(PAT_PREFIX)) return c.text('Not found', 404);

  const user = await db.user.findUnique({
    where: { personalTokenHash: hashPersonalToken(token) },
    select: { id: true },
  });
  if (!user) return c.text('Not found', 404);

  const now = new Date();
  const rows = await db.scheduleBlock.findMany({
    where: {
      userId: user.id,
      startTime: { gte: new Date(now.getTime() - BACK_MS), lte: new Date(now.getTime() + AHEAD_MS) },
    },
    orderBy: { startTime: 'asc' },
    include: { quest: { select: { title: true } } },
    take: 1000,
  });

  const blocks: FeedBlock[] = rows.map((r) => ({
    id: r.id,
    start: r.startTime,
    end: r.endTime,
    type: r.blockType.toLowerCase(),
    // Fixed blocks carry their label in `note` ("Calendar: …", "Daily: …").
    title: r.quest?.title ?? r.note ?? 'Focus block',
    reason: r.reason,
  }));

  const ics = buildIcsFeed(blocks, { calendarName: 'Focus Guild', now });
  return c.body(ics, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'private, max-age=300',
    'Content-Disposition': 'inline; filename="focus-guild.ics"',
  });
});
