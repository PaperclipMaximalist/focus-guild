/**
 * Connections: ICS calendar feeds and the personal inbox token.
 *
 *   GET    /integrations                      sources + inbox status
 *   POST   /integrations/calendars            { name, url } → add + first sync
 *   POST   /integrations/calendars/:id/sync   sync now
 *   DELETE /integrations/calendars/:id
 *   POST   /integrations/inbox-token          create or rotate; token shown once
 *   DELETE /integrations/inbox-token          revoke
 *
 * The public, token-authenticated `POST /inbox` lives in routes/inbox.ts.
 */

import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { logActivity } from '../lib/activity.js';
import { normaliseFeedUrl } from '../lib/calendar/ics.js';
import { syncSource } from '../lib/calendar/sync.js';

export const integrations = new Hono();

const bad = (message: string) => ({ success: false as const, error: { code: 'BAD_REQUEST', message } });
const notFound = { success: false as const, error: { code: 'NOT_FOUND', message: 'Calendar not found' } };

export const hashInboxToken = (token: string) => createHash('sha256').update(token).digest('hex');

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
    data: { calendars: sources.map(publicSource), inboxEnabled: Boolean(user.inboxTokenHash) },
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

integrations.post('/inbox-token', async (c) => {
  const user = c.get('user');
  const token = `fgi_${randomBytes(24).toString('base64url')}`;
  await db.user.update({ where: { id: user.id }, data: { inboxTokenHash: hashInboxToken(token) } });
  return c.json({ success: true, data: { token } });
});

integrations.delete('/inbox-token', async (c) => {
  const user = c.get('user');
  await db.user.update({ where: { id: user.id }, data: { inboxTokenHash: null } });
  return c.json({ success: true, data: { revoked: true } });
});
