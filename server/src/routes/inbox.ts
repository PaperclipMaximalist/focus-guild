/**
 * POST /inbox: the universal capture endpoint.
 *
 * Anything that can send an HTTP request (Power Automate on a Teams mention,
 * a phone shortcut, Zapier) can drop a line into the Parking Lot. It lands in
 * the parking lot, never the active list, because capture shouldn't commit you.
 *
 * Auth is a personal token, not a Clerk session:
 *   Authorization: Bearer fgpat_…    (preferred)
 *   ?token=fgpat_…                   (for tools that can't set headers)
 *
 * Body: JSON { text } or { title, body } (Power Automate / email shapes),
 * or plain text.
 */

import { Hono } from 'hono';
import { db } from '../db/client.js';
import { logActivity } from '../lib/activity.js';
import { PAT_PREFIX, hashPersonalToken } from '../lib/tokens.js';

export const inbox = new Hono();

const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, number[]>();

/** In-memory, per-user: enough to stop a looping automation, not an attacker. */
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > MAX_PER_WINDOW;
}

function extractText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (!raw || typeof raw !== 'object') return '';
  const o = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const text = pick('text') || pick('content') || pick('message');
  if (text) return text;
  return [pick('title') || pick('subject'), pick('body')].filter(Boolean).join(': ');
}

inbox.post('/', async (c) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : (c.req.query('token') ?? '');
  const unauthorized = c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid inbox token' } }, 401);
  if (!token.startsWith(PAT_PREFIX)) return unauthorized;

  const user = await db.user.findUnique({ where: { personalTokenHash: hashPersonalToken(token) }, select: { id: true } });
  if (!user) return unauthorized;
  if (rateLimited(user.id)) {
    return c.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many inbox items this hour' } }, 429);
  }

  const contentType = c.req.header('Content-Type') ?? '';
  const raw = contentType.includes('application/json')
    ? await c.req.json().catch(() => null)
    : await c.req.text().catch(() => '');
  // Collapse whitespace: automations often send HTML-ish multi-line bodies.
  const text = extractText(raw).replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!text) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Nothing to capture: send { "text": "…" }' } }, 400);

  const source = (c.req.query('source') ?? '').replace(/[^\w .-]/g, '').slice(0, 40);
  const entry = await db.parkingLotEntry.create({ data: { userId: user.id, text } });
  void logActivity(user.id, 'inbox', `Inbox${source ? ` (${source})` : ''}: ${text}`, { subjectId: entry.id });
  return c.json({ success: true, data: { id: entry.id } }, 201);
});
