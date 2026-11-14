/**
 * Signed-in devices: the iOS app's sign-in, and the list a member can sign
 * devices out from.
 *
 *   POST   /devices/link     { challenge, name? } → { code, expiresInSec }  web sign-in only
 *   POST   /devices/token    { code, verifier }   → { token, deviceId, clerkId }  no auth: the code is the credential
 *   GET    /devices                               → the member's devices, newest first
 *   DELETE /devices/current                       → the calling device signs itself out
 *   DELETE /devices/:id                           → sign one of the member's devices out
 *
 * How the code and token work, and why, is in lib/deviceSessions.ts.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { isWebSignIn } from '../lib/auth.js';
import { CHALLENGE_RE, INVALID_LINK, VERIFIER_RE, createLink, exchangeCode, idleCutoff } from '../lib/deviceSessions.js';

export const devices = new Hono();

const LinkSchema = z.object({
  challenge: z.string().regex(CHALLENGE_RE),
  name: z.string().trim().min(1).max(60).optional(),
});

devices.post('/link', async (c) => {
  // A device token or a script's token must not be able to mint more devices:
  // adding one is something a person does, signed in on the website.
  if (!isWebSignIn(c.get('authKind'))) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Add a device from the Focus Guild website, signed in there.' } },
      403,
    );
  }
  const parsed = LinkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'The app sent a sign-in request the Guild cannot read. Start again from the app.' } },
      400,
    );
  }
  const data = await createLink(c.get('user').id, parsed.data.challenge, parsed.data.name ?? 'iPhone');
  return c.json({ success: true, data }, 201);
});

const TokenSchema = z.object({
  code: z.string().min(1).max(200),
  verifier: z.string().regex(VERIFIER_RE),
});

devices.post('/token', async (c) => {
  const invalid = () => c.json({ success: false, error: INVALID_LINK }, 400);
  const parsed = TokenSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid();
  const result = await exchangeCode(parsed.data.code, parsed.data.verifier);
  if (!result) return invalid();
  return c.json({ success: true, data: result });
});

devices.get('/', async (c) => {
  const current = c.get('deviceSessionId');
  // A sign-in unused for 180 days is over (lib/deviceSessions.ts) even before
  // the next sweep removes its row, so it is not listed as signed in.
  const rows = await db.deviceSession.findMany({
    where: { userId: c.get('user').id, lastUsedAt: { gt: idleCutoff(new Date()) } },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ success: true, data: rows.map((r) => ({ ...r, current: r.id === current })) });
});

// Before /:id, so "current" is never read as an id.
devices.delete('/current', async (c) => {
  const id = c.get('deviceSessionId');
  if (c.get('authKind') !== 'device' || !id) {
    return c.json(
      { success: false, error: { code: 'NOT_A_DEVICE', message: 'Only the app can sign itself out this way.' } },
      400,
    );
  }
  await db.deviceSession.deleteMany({ where: { id, userId: c.get('user').id } });
  return c.json({ success: true, data: { revoked: true } });
});

devices.delete('/:id', async (c) => {
  // Scoped by member, so another member's id answers the same as a made-up one.
  const { count } = await db.deviceSession.deleteMany({ where: { id: c.req.param('id'), userId: c.get('user').id } });
  if (count === 0) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'That device is not signed in.' } }, 404);
  }
  return c.json({ success: true, data: { revoked: true } });
});
