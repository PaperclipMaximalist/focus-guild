/**
 * GET /calendar/<feed token>.ics — your plan, as a calendar feed.
 *
 * The token sits in the address because calendar apps subscribe to a plain URL
 * and cannot send headers. It is the feed's own token (fgcal_…, made in
 * Connections or Quickstart) and this feed is all it opens. The link gets
 * pasted into Google Calendar and the like, so the worst a leaked one can do
 * is show the plan: the same trade Google and Outlook make with their own
 * secret addresses.
 *
 * Until November 2026 the link carried the personal access token (fgpat_…),
 * which also opens the whole API. Those links stopped working the day this
 * shipped, with no grace period: each fetch of one sends a full key to the
 * account through a calendar company and our host, and serving them longer
 * would only have kept that going. A calendar that still asks with one is
 * remembered (users.oldFeedLinkSeenAt) so the app can tell that member to make
 * a new link and a new personal token.
 *
 * Every refusal is the same plain 404, so the answer never says whether a
 * token was a real one.
 */

import { Hono } from 'hono';
import { db } from '../db/client.js';
import { FEED_PREFIX, PAT_PREFIX, hashFeedToken, hashPersonalToken } from '../lib/tokens.js';
import { buildIcsFeed, type FeedBlock } from '../lib/calendar/publish.js';

export const calendarFeed = new Hono();

/** How much of the plan to publish. Past blocks stay as a record. */
const BACK_MS = 7 * 86_400_000;
const AHEAD_MS = 60 * 86_400_000;

/** A calendar app polls every few minutes or hours; one note a day is enough to keep the date honest. */
const OLD_LINK_NOTE_EVERY_MS = 24 * 3_600_000;

/**
 * An old link (one that holds a personal access token) was asked for. If the
 * token is a member's current one, remember when, so Connections can say so.
 * Nothing is served either way.
 */
async function noteOldLink(token: string, now: Date): Promise<void> {
  const user = await db.user.findUnique({
    where: { personalTokenHash: hashPersonalToken(token) },
    select: { id: true, oldFeedLinkSeenAt: true },
  });
  if (!user) return;
  const last = user.oldFeedLinkSeenAt;
  if (last && now.getTime() - last.getTime() < OLD_LINK_NOTE_EVERY_MS) return;
  await db.user.update({ where: { id: user.id }, data: { oldFeedLinkSeenAt: now } });
}

calendarFeed.get('/:file', async (c) => {
  const token = c.req.param('file').replace(/\.ics$/i, '');
  const now = new Date();

  if (token.startsWith(PAT_PREFIX)) {
    // A failed note must not turn into a 500: that would tell a real token from a made-up one.
    await noteOldLink(token, now).catch((err) => console.error('[calendar] old link note', err));
    return c.text('Not found', 404);
  }
  if (!token.startsWith(FEED_PREFIX)) return c.text('Not found', 404);

  const user = await db.user.findUnique({
    where: { calendarFeedTokenHash: hashFeedToken(token) },
    select: { id: true },
  });
  if (!user) return c.text('Not found', 404);

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
