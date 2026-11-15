/**
 * Connections: ICS calendar feeds, the personal access token and the plan
 * feed's own token.
 *
 *   GET    /integrations                      sources + which tokens exist
 *   POST   /integrations/calendars            { name, url } → add + first sync
 *   POST   /integrations/calendars/:id/sync   sync now
 *   DELETE /integrations/calendars/:id
 *   POST   /integrations/token                personal token: create or replace; shown once
 *   DELETE /integrations/token                personal token: turn off
 *   POST   /integrations/feed-token           plan feed link: create or replace; shown once
 *   DELETE /integrations/feed-token           plan feed link: turn off
 *
 * The public, token-authenticated `POST /inbox` lives in routes/inbox.ts and
 * the published feed in routes/calendarFeed.ts.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { logActivity } from '../lib/activity.js';
import { normaliseFeedUrl } from '../lib/calendar/ics.js';
import { syncSource } from '../lib/calendar/sync.js';
import { hashFeedToken, hashPersonalToken, newFeedToken, newPersonalToken } from '../lib/tokens.js';

export const integrations = new Hono();

const bad = (message: string) => ({ success: false as const, error: { code: 'BAD_REQUEST', message } });
const notFound = { success: false as const, error: { code: 'NOT_FOUND', message: 'Calendar not found' } };

/** Show enough of a secret URL to recognise it, never enough to reuse it. */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}/…${u.pathname.slice(-6)}`;
  } catch {
    return '…';
  }
}

function publicSource(s: { id: string; name: string; url: string; lastSyncAt: Date | null; lastError: string | null; eventCount: number }) {
  return { id: s.id, name: s.name, host: maskUrl(s.url), lastSyncAt: s.lastSyncAt, lastError: s.lastError, eventCount: s.eventCount };
}

integrations.get('/', async (c) => {
  const user = c.get('user');
  const sources = await db.calendarSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  return c.json({
    success: true,
    data: {
      calendars: sources.map(publicSource),
      tokenEnabled: Boolean(user.personalTokenHash),
      feedEnabled: Boolean(user.calendarFeedTokenHash),
      // Set while a calendar somewhere still asks with a link from before the
      // feed had its own token; the pages use it to say what to do about it.
      oldFeedLinkSeenAt: user.oldFeedLinkSeenAt,
    },
  });
});

const AddSchema = z.object({ name: z.string().trim().min(1).max(60), url: z.string().min(8).max(2000) });

integrations.post('/calendars', async (c) => {
  const user = c.get('user');
  const parsed = AddSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad('Give the calendar a name and paste its link.'), 400);
  const norm = normaliseFeedUrl(parsed.data.url);
  if ('error' in norm) return c.json(bad(norm.error), 400);
  if ((await db.calendarSource.count({ where: { userId: user.id } })) >= 10) {
    return c.json(bad('You can connect up to 10 calendars.'), 400);
  }

  const source = await db.calendarSource.create({
    data: { userId: user.id, name: parsed.data.name, url: norm.url },
  });
  // First sync inline so the user learns straight away whether the link works.
  const result = await syncSource(source);
  const fresh = await db.calendarSource.findUniqueOrThrow({ where: { id: source.id } });
  void logActivity(user.id, 'calendar.added', `Connected calendar "${source.name}"`, { subjectId: source.id });
  return c.json({ success: true, data: { calendar: publicSource(fresh), ...result } }, 201);
});

integrations.post('/calendars/:id/sync', async (c) => {
  const user = c.get('user');
  const source = await db.calendarSource.findUnique({ where: { id: c.req.param('id') } });
  if (!source || source.userId !== user.id) return c.json(notFound, 404);
  const result = await syncSource(source);
  const fresh = await db.calendarSource.findUniqueOrThrow({ where: { id: source.id } });
  return c.json({ success: true, data: { calendar: publicSource(fresh), ...result } });
});

integrations.delete('/calendars/:id', async (c) => {
  const user = c.get('user');
  const source = await db.calendarSource.findUnique({ where: { id: c.req.param('id') } });
  if (!source || source.userId !== user.id) return c.json(notFound, 404);
  await db.calendarSource.delete({ where: { id: source.id } }); // events cascade
  void logActivity(user.id, 'calendar.removed', `Disconnected calendar "${source.name}"`);
  return c.json({ success: true, data: { id: source.id } });
});

/**
 * One personal access token per user. It authenticates the inbox endpoint,
 * the REST API (Authorization: Bearer) and the MCP connector, so creating a
 * new one replaces the old everywhere.
 *
 * Replacing it or turning it off also clears oldFeedLinkSeenAt: an old feed
 * link held this token, and once the token is gone that link is worthless,
 * which is all the notice asked for.
 */
integrations.post('/token', async (c) => {
  const user = c.get('user');
  const token = newPersonalToken();
  await db.user.update({
    where: { id: user.id },
    data: { personalTokenHash: hashPersonalToken(token), oldFeedLinkSeenAt: null },
  });
  return c.json({ success: true, data: { token } });
});

integrations.delete('/token', async (c) => {
  const user = c.get('user');
  await db.user.update({ where: { id: user.id }, data: { personalTokenHash: null, oldFeedLinkSeenAt: null } });
  return c.json({ success: true, data: { revoked: true } });
});

/**
 * One plan feed link per user, and its token is separate from the personal
 * one on purpose: the link is handed to a calendar app, so it can read the
 * plan (routes/calendarFeed.ts) and nothing else. requireUser refuses it as a
 * bearer token. A new one replaces the old link; the personal token is not
 * touched, and the other way round.
 */
integrations.post('/feed-token', async (c) => {
  const user = c.get('user');
  const token = newFeedToken();
  await db.user.update({ where: { id: user.id }, data: { calendarFeedTokenHash: hashFeedToken(token) } });
  return c.json({ success: true, data: { token } });
});

integrations.delete('/feed-token', async (c) => {
  const user = c.get('user');
  await db.user.update({ where: { id: user.id }, data: { calendarFeedTokenHash: null } });
  return c.json({ success: true, data: { revoked: true } });
});
