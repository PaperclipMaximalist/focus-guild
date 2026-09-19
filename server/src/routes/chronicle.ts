/**
 * Chronicle (activity log), permafile, and the AI context bundle.
 *
 *   GET  /chronicle/log?days=7              entries, newest first
 *   GET  /chronicle/log/markdown?days=&tz=  grouped-by-day markdown
 *   POST /chronicle/journal                 free-text entry
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
  GUILD_SYSTEM_PROMPT,
  PERMAFILE_TEMPLATE,
  buildAiBundle,
  parseGuildReply,
  renderLogMarkdown,
} from '../lib/chronicle.js';
import { AI_ENABLED, AI_MODEL, getClient } from '../lib/ai.js';
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

const JournalSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  /** 1–5 mood rating, from the end-of-day reflection. */
  rating: z.number().int().min(1).max(5).optional(),
});

chronicle.post('/journal', async (c) => {
  const user = c.get('user');
  const parsed = JournalSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);
  const { text, rating } = parsed.data;
  const entry = await db.activityEntry.create({
    data: {
      userId: user.id,
      kind: 'journal',
      line: (rating ? `Journal (mood ${rating}/5): ${text}` : `Journal: ${text}`).slice(0, 2100),
      data: rating ? { rating } : undefined,
    },
  });
  return c.json({ success: true, data: entry }, 201);
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
  if (!AI_ENABLED) {
    return c.json(
      {
        success: false,
        error: {
          code: 'AI_NOT_CONFIGURED',
          message: 'Add ANTHROPIC_API_KEY to the server to enable Ask the Guild.',
        },
      },
      503,
    );
  }
  const parsed = AskSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const days = readDays(String(parsed.data.days ?? 14));
  const bundle = await buildBundle(user, days, readTz(String(parsed.data.tz ?? 0)));

  try {
    const response = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      system: GUILD_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: bundle.markdown + '\n\n---\n\nMy question: ' + parsed.data.question },
      ],
    });
    if (response.stop_reason === 'refusal') {
      return c.json({ success: false, error: { code: 'AI_REFUSED', message: 'The AI declined to answer that.' } }, 502);
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    const reply = parseGuildReply(textBlock && textBlock.type === 'text' ? textBlock.text : '');
    if ('error' in reply) {
      return c.json({ success: false, error: { code: 'AI_PARSE_ERROR', message: reply.error } }, 502);
    }

    void logActivity(user.id, 'ask', 'Asked the Guild: ' + parsed.data.question, {
      data: { days, chars: bundle.chars },
    });
    return c.json({ success: true, data: { ...reply, contextChars: bundle.chars, days } });
  } catch (e: unknown) {
    return c.json(
      { success: false, error: { code: 'AI_ERROR', message: e instanceof Error ? e.message : String(e) } },
      502,
    );
  }
});
