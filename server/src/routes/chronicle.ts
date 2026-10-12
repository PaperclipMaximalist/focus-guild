/**
 * Chronicle (activity log), permafile, and the AI context bundle.
 *
 *   GET  /chronicle/log?days=7              entries, newest first
 *   GET  /chronicle/log/markdown?days=&tz=  grouped-by-day markdown
 *   GET  /chronicle/journal?before=&limit=  what was written by hand, newest first
 *   POST /chronicle/journal                 free-text entry
 *   PATCH /chronicle/journal/:id            reword an entry
 *   DELETE /chronicle/journal/:id           take an entry out
 *   GET  /chronicle/permafile               current body + version list
 *   PUT  /chronicle/permafile               save (new version if changed)
 *   POST /chronicle/permafile/restore/:id   make an old version current
 *   GET  /chronicle/bundle?days=&tz=        permafile + tracker + log, one doc
 *   POST /chronicle/ask                     ask Claude about all three (needs a key)
 *
 * `tz` is `Date.prototype.getTimezoneOffset()` in minutes, the same
 * convention the scheduler uses.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { logActivity } from '../lib/activity.js';
import {
  BY_HAND_KINDS,
  GUILD_SYSTEM_PROMPT,
  JOURNAL_KIND,
  PERMAFILE_TEMPLATE,
  buildAiBundle,
  journalLine,
  parseGuildReply,
  renderLogMarkdown,
  toJournalItem,
} from '../lib/chronicle.js';
import { aiFailure, completeFor } from '../lib/ai.js';
import { getTrackerConfig } from '../lib/tracker/config.js';
import { serialize } from '../lib/tracker/markdown.js';
import { loadDoc } from './tracker.js';

export const chronicle = new Hono();

const bad = (message: string) => ({ success: false as const, error: { code: 'BAD_REQUEST', message } });

/** Days of history to include, clamped to something an AI context can hold. */
function readDays(raw: string | undefined, fallback = 7): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? Math.min(90, Math.max(1, Math.round(n))) : fallback;
}

function readTz(raw: string | undefined): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? Math.min(840, Math.max(-720, Math.round(n))) : 0;
}

function entriesSince(userId: string, days: number) {
  return db.activityEntry.findMany({
    where: { userId, at: { gte: new Date(Date.now() - days * 86_400_000) } },
    orderBy: { at: 'desc' },
    take: 2000,
  });
}

async function currentPermafile(userId: string) {
  const versions = await db.permafileVersion.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, body: true, source: true, createdAt: true },
  });
  return { body: versions[0]?.body ?? null, versions };
}

// ─── Log ──────────────────────────────────────────────────────────────────────

chronicle.get('/log', async (c) => {
  const user = c.get('user');
  const entries = await entriesSince(user.id, readDays(c.req.query('days')));
  return c.json({ success: true, data: entries });
});

chronicle.get('/log/markdown', async (c) => {
  const user = c.get('user');
  const entries = await entriesSince(user.id, readDays(c.req.query('days')));
  const markdown = renderLogMarkdown(entries, readTz(c.req.query('tz')));
  return c.json({ success: true, data: { markdown, chars: markdown.length } });
});

/** A page of a notebook, not a tweet: long enough to think in. */
const JOURNAL_MAX = 5000;

const JournalSchema = z.object({
  text: z.string().trim().min(1).max(JOURNAL_MAX),
  /** 1–5 mood rating, from the end-of-day reflection. */
  rating: z.number().int().min(1).max(5).optional(),
});

// What the Journal page reads: only what a person wrote. `before` is the `at`
// of the oldest entry already shown, so "earlier" pages back without a count.
chronicle.get('/journal', async (c) => {
  const user = c.get('user');
  const limitRaw = Number(c.req.query('limit') ?? 40);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.round(limitRaw))) : 40;
  const beforeRaw = c.req.query('before');
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : null;
  const rows = await db.activityEntry.findMany({
    where: { userId: user.id, kind: { in: [...BY_HAND_KINDS] }, ...(before ? { at: { lt: before } } : {}) },
    orderBy: { at: 'desc' },
    take: limit + 1,
  });
  const entries = rows.slice(0, limit).map(toJournalItem).filter((e) => e !== null);
  return c.json({ success: true, data: { entries, hasMore: rows.length > limit } });
});

chronicle.post('/journal', async (c) => {
  const user = c.get('user');
  const parsed = JournalSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);
  const { text, rating } = parsed.data;
  const entry = await db.activityEntry.create({
    data: {
      userId: user.id,
      kind: JOURNAL_KIND,
      line: journalLine(text, rating),
      // The words on their own, so an entry can be shown and reworded
      // without unpicking the sentence above.
      data: rating ? { text, rating } : { text },
    },
  });
  return c.json({ success: true, data: entry }, 201);
});

/** The caller's own journal entry, or null: the app's lines are not theirs to rewrite. */
async function ownJournalEntry(userId: string, id: string) {
  const entry = await db.activityEntry.findUnique({ where: { id } });
  return entry && entry.userId === userId && entry.kind === JOURNAL_KIND ? entry : null;
}

const noEntry = { success: false as const, error: { code: 'NOT_FOUND', message: 'Entry not found' } };

chronicle.patch('/journal/:id', async (c) => {
  const user = c.get('user');
  const parsed = z.object({ text: z.string().trim().min(1).max(JOURNAL_MAX) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);
  const entry = await ownJournalEntry(user.id, c.req.param('id'));
  if (!entry) return c.json(noEntry, 404);
  const rating = toJournalItem(entry)?.rating ?? null;
  const updated = await db.activityEntry.update({
    where: { id: entry.id },
    data: {
      line: journalLine(parsed.data.text, rating),
      data: rating ? { text: parsed.data.text, rating } : { text: parsed.data.text },
    },
  });
  return c.json({ success: true, data: toJournalItem(updated) });
});

chronicle.delete('/journal/:id', async (c) => {
  const user = c.get('user');
  const entry = await ownJournalEntry(user.id, c.req.param('id'));
  if (!entry) return c.json(noEntry, 404);
  await db.activityEntry.delete({ where: { id: entry.id } });
  return c.json({ success: true, data: null });
});

// ─── Permafile ────────────────────────────────────────────────────────────────

chronicle.get('/permafile', async (c) => {
  const user = c.get('user');
  const { body, versions } = await currentPermafile(user.id);
  return c.json({
    success: true,
    data: {
      body: body ?? PERMAFILE_TEMPLATE,
      isTemplate: body === null,
      versions: versions.map(({ id, source, createdAt, body: b }) => ({ id, source, createdAt, chars: b.length })),
    },
  });
});

const PermafileSchema = z.object({ body: z.string().max(20_000) });

chronicle.put('/permafile', async (c) => {
  const user = c.get('user');
  const parsed = PermafileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);
  const { body } = await currentPermafile(user.id);
  if (body === parsed.data.body) return c.json({ success: true, data: { changed: false } });
  const version = await db.permafileVersion.create({ data: { userId: user.id, body: parsed.data.body } });
  void logActivity(user.id, 'permafile.saved', 'Updated the permafile', { subjectId: version.id });
  return c.json({ success: true, data: { changed: true, id: version.id } });
});

chronicle.post('/permafile/restore/:id', async (c) => {
  const user = c.get('user');
  const old = await db.permafileVersion.findUnique({ where: { id: c.req.param('id') } });
  if (!old || old.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' } }, 404);
  }
  // Restoring appends a copy rather than deleting newer versions, so a
  // restore is itself undoable.
  const version = await db.permafileVersion.create({
    data: { userId: user.id, body: old.body, source: 'restore' },
  });
  void logActivity(user.id, 'permafile.restored', 'Restored an earlier permafile version', { subjectId: version.id });
  return c.json({ success: true, data: { id: version.id } });
});

// ─── AI bundle ────────────────────────────────────────────────────────────────

async function buildBundle(user: { id: string; trackerSettings?: unknown }, days: number, tz: number) {
  const now = new Date();
  const [{ body }, { doc }, entries] = await Promise.all([
    currentPermafile(user.id),
    loadDoc(user.id),
    entriesSince(user.id, days),
  ]);
  const trackerMarkdown = serialize(doc, {
    tier: 'working',
    generatedAt: now,
    since: null,
    showHours: getTrackerConfig(user).showHours,
  });
  const markdown = buildAiBundle({
    permafile: body ?? '',
    trackerMarkdown,
    logMarkdown: renderLogMarkdown(entries, tz),
    days,
    generatedAt: now,
  });
  return { markdown, chars: markdown.length, entries: entries.length };
}

chronicle.get('/bundle', async (c) => {
  const bundle = await buildBundle(c.get('user'), readDays(c.req.query('days')), readTz(c.req.query('tz')));
  return c.json({ success: true, data: bundle });
});

// ─── Ask the Guild ────────────────────────────────────────────────────────────

const AskSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  days: z.number().int().min(1).max(90).optional(),
  tz: z.number().int().min(-720).max(840).optional(),
});

/**
 * Answer a question about the user's own data. The bundle is the whole
 * context; the model gets no tools, and anything it wants changed comes back
 * as a suggestion the user taps.
 */
chronicle.post('/ask', async (c) => {
  const user = c.get('user');
  const parsed = AskSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const days = readDays(String(parsed.data.days ?? 14));
  const bundle = await buildBundle(user, days, readTz(String(parsed.data.tz ?? 0)));

  try {
    // Whichever AI this person connected, or the server's own (lib/ai.ts).
    const { text } = await completeFor(user.id, {
      system: GUILD_SYSTEM_PROMPT,
      prompt: bundle.markdown + '\n\n---\n\nMy question: ' + parsed.data.question,
    });
    const reply = parseGuildReply(text);
    if ('error' in reply) {
      return c.json({ success: false, error: { code: 'AI_PARSE_ERROR', message: reply.error } }, 502);
    }

    void logActivity(user.id, 'ask', 'Asked the Guild: ' + parsed.data.question, {
      data: { days, chars: bundle.chars },
    });
    return c.json({ success: true, data: { ...reply, contextChars: bundle.chars, days } });
  } catch (e: unknown) {
    const { body, status } = aiFailure(e);
    return c.json(body, status);
  }
});
