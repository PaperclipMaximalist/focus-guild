/**
 * Fetch ICS feeds and store their busy events.
 *
 * Each sync replaces a source's events wholesale for the window, so a moved
 * or deleted meeting simply stops existing. Sync runs on a 15-minute timer
 * (Railway keeps the process alive) and again before a schedule is built if
 * the data is stale, capped so a slow feed can't hold up planning.
 */

import { db } from '../../db/client.js';
import { normaliseFeedUrl, parseBusyEvents } from './ics.js';

const WINDOW_BACK_MS = 86_400_000; // keep yesterday so "today" stays whole
const WINDOW_AHEAD_MS = 35 * 86_400_000; // beyond any scheduler horizon
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
export const STALE_MS = 15 * 60_000;

async function fetchFeed(url: string): Promise<string> {
  // Follow redirects by hand so every hop passes the same private-address check.
  let target = url;
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(target, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
      headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1', 'User-Agent': 'FocusGuild/1.0 (calendar sync)' },
    });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) break;
    const next = normaliseFeedUrl(new URL(location, target).toString());
    if ('error' in next) throw new Error(`The calendar link redirected somewhere unsafe. ${next.error}`);
    target = next.url;
    res = null;
  }
  if (!res) throw new Error('The calendar link redirected too many times.');
  if (!res.ok) throw new Error(`The calendar server answered ${res.status}.`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) throw new Error('That calendar is too large (over 5 MB).');
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error('That calendar is too large (over 5 MB).');
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('That link did not return a calendar (.ics) file.');
  return body;
}

export async function syncSource(source: { id: string; userId: string; url: string }): Promise<{ count: number } | { error: string }> {
  const now = Date.now();
  try {
    const body = await fetchFeed(source.url);
    const events = parseBusyEvents(body, new Date(now - WINDOW_BACK_MS), new Date(now + WINDOW_AHEAD_MS));
    // Feeds occasionally repeat a UID/instance; the unique index would reject it.
    const unique = [...new Map(events.map((e) => [e.uid, e])).values()];
    await db.$transaction([
      db.externalEvent.deleteMany({ where: { sourceId: source.id } }),
      db.externalEvent.createMany({
        data: unique.map((e) => ({
          userId: source.userId,
          sourceId: source.id,
          uid: e.uid.slice(0, 500),
          title: e.title.slice(0, 280),
          start: e.start,
          end: e.end,
        })),
      }),
      db.calendarSource.update({
        where: { id: source.id },
        data: { lastSyncAt: new Date(now), lastError: null, eventCount: unique.length },
      }),
    ]);
    return { count: unique.length };
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'The calendar took too long to respond.'
        : err instanceof Error
          ? err.message
          : String(err);
    // Keep the old events: a flaky feed shouldn't wipe a known schedule.
    await db.calendarSource
      .update({ where: { id: source.id }, data: { lastSyncAt: new Date(now), lastError: message.slice(0, 300) } })
      .catch(() => {});
    return { error: message };
  }
}

/** Sync a user's stale sources, giving up waiting after `maxWaitMs`. */
export async function syncStaleForUser(userId: string, maxWaitMs = 4000): Promise<void> {
  const sources = await db.calendarSource.findMany({
    where: { userId, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - STALE_MS) } }] },
  });
  if (sources.length === 0) return;
  const all = Promise.all(sources.map(syncSource));
  await Promise.race([all, new Promise((r) => setTimeout(r, maxWaitMs))]);
}

/** Busy events for the scheduler, from now to the end of the horizon. */
export function upcomingEvents(userId: string, horizonDays: number) {
  const now = Date.now();
  return db.externalEvent.findMany({
    where: {
      userId,
      end: { gt: new Date(now) },
      start: { lt: new Date(now + (horizonDays + 1) * 86_400_000) },
    },
    select: { id: true, title: true, start: true, end: true },
    orderBy: { start: 'asc' },
  });
}

let timer: NodeJS.Timeout | null = null;

/** Background sync of every stale feed, one at a time to stay gentle. */
export function startCalendarSyncLoop(): void {
  if (timer || process.env['NODE_ENV'] === 'test') return;
  const tick = async () => {
    try {
      const stale = await db.calendarSource.findMany({
        where: { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - STALE_MS) } }] },
        take: 50,
      });
      for (const s of stale) await syncSource(s);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[calendar] sync loop failed:', err instanceof Error ? err.message : err);
    }
  };
  timer = setInterval(tick, STALE_MS);
  timer.unref();
}
