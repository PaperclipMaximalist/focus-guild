/**
 * Device sign-in for the iOS app: OAuth for native apps (RFC 8252) with PKCE
 * (RFC 7636), in miniature.
 *
 * Clerk cannot run inside the app's WebView, so the member signs in on the
 * website in the system browser and presses Connect. The website asks for a
 * one-time code bound to the challenge the app made (`createLink`), hands it
 * to the app through `focusguild://link?code=…`, and the app trades code +
 * verifier for a long-lived device token (`exchangeCode`).
 *
 * The code travels through a custom URL scheme another app could register,
 * so the code alone must be useless: only the app that made the verifier can
 * spend it. Codes and tokens are stored only as SHA-256 hashes, like the
 * personal access token in tokens.ts.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../db/client.js';

export const DEVICE_PREFIX = 'fgd_';

/** How long a code from Connect stays good. Long enough to switch apps, short enough to be useless later. */
export const LINK_TTL_SEC = 120;

/** lastUsedAt is for "last seen" in the device list, not an audit log: writing it on every request would double the queries. */
export const LAST_USED_EVERY_MS = 60 * 60 * 1000;

/**
 * A device sign-in that has not been used for this many days is over: the
 * token answers 401 like an unknown one, and the row is deleted. A phone that
 * was lost, sold or had the app deleted does not stay signed in for ever.
 */
export const SESSION_IDLE_DAYS = 180;

/**
 * How old lastUsedAt must be for the session to be over. lastUsedAt is
 * written at most hourly, so the real last use can be up to an hour later
 * than it says; the extra hour makes "180 days without use" true, never 179
 * days and 23 hours.
 */
export const SESSION_IDLE_MS = SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000 + LAST_USED_EVERY_MS;

/** Sessions last used at or before this moment are over. */
export const idleCutoff = (now: Date) => new Date(now.getTime() - SESSION_IDLE_MS);

/** True when a session last used at `lastUsedAt` has gone unused too long by `now`. */
export const sessionIsIdle = (lastUsedAt: Date, now: Date) => lastUsedAt.getTime() <= idleCutoff(now).getTime();

/** The one answer to every failed exchange, so a caller cannot learn which check failed. */
export const INVALID_LINK = {
  code: 'INVALID_LINK',
  message: 'That sign-in link has expired or was already used. Start again from the app.',
} as const;

/** base64url(SHA-256(verifier)) without padding is always 43 characters. */
export const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636 §4.1: 43 to 128 unreserved characters. */
export const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

/** The S256 challenge for a verifier (RFC 7636 §4.2). */
export const challengeFor = (verifier: string) => createHash('sha256').update(verifier, 'ascii').digest('base64url');

/** Equal-length compare that takes the same time wherever the strings differ. */
function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True iff this verifier is the one the challenge was made from. */
export function verifierMatches(verifier: string, challenge: string): boolean {
  if (!VERIFIER_RE.test(verifier) || !CHALLENGE_RE.test(challenge)) return false;
  return sameText(challengeFor(verifier), challenge);
}

/** 32 random bytes: the code a member's browser hands to the app. */
export const newLinkCode = () => randomBytes(32).toString('base64url');

/** 32 random bytes behind the prefix, so requireUser can tell it from a Clerk JWT or a personal token. */
export const newDeviceToken = () => `${DEVICE_PREFIX}${randomBytes(32).toString('base64url')}`;

type LinkState = { usedAt: Date | null; expiresAt: Date };

/** A code can still be spent: never used, and not yet expired. */
export const linkIsLive = (link: LinkState, now: Date) => link.usedAt === null && link.expiresAt.getTime() > now.getTime();

/** Whether this request should write lastUsedAt. */
export const lastUsedIsStale = (lastUsedAt: Date, now: Date) => now.getTime() - lastUsedAt.getTime() >= LAST_USED_EVERY_MS;

/**
 * A new one-time code for the signed-in member. Also clears out codes that
 * can no longer be spent and device sign-ins that have gone unused too long
 * (anyone's), so both tables stay small without a cron.
 */
export async function createLink(userId: string, challenge: string, name: string, now = new Date()) {
  await db.deviceLink.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }] } });
  await db.deviceSession.deleteMany({ where: { lastUsedAt: { lte: idleCutoff(now) } } });
  const code = newLinkCode();
  await db.deviceLink.create({
    data: {
      userId,
      codeHash: sha256Hex(code),
      challenge,
      name,
      expiresAt: new Date(now.getTime() + LINK_TTL_SEC * 1000),
    },
  });
  return { code, expiresInSec: LINK_TTL_SEC };
}

/**
 * Trade a code and its verifier for a device token. Null for every failure
 * (unknown, used, expired, wrong verifier), and the route answers them all
 * with INVALID_LINK.
 *
 * A wrong verifier does not spend the code: whoever can see the code (the
 * point of PKCE is to assume someone can) must not be able to cancel the
 * real sign-in by sending garbage. Guessing the verifier is out of reach
 * (it is a SHA-256 preimage), so leaving the code open costs nothing.
 *
 * Spending is one conditional update, so two exchanges racing with the right
 * verifier cannot both win.
 */
export async function exchangeCode(code: string, verifier: string, now = new Date()) {
  const link = await db.deviceLink.findUnique({
    where: { codeHash: sha256Hex(code) },
    include: { user: { select: { clerkId: true } } },
  });
  if (!link || !linkIsLive(link, now) || !verifierMatches(verifier, link.challenge)) return null;

  const spent = await db.deviceLink.updateMany({
    where: { id: link.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (spent.count !== 1) return null;

  // Not in one transaction with the spend: the only failure between the two
  // is the database going away, and then the member presses Connect again.
  const token = newDeviceToken();
  const session = await db.deviceSession.create({
    data: { userId: link.userId, tokenHash: sha256Hex(token), name: link.name, createdAt: now, lastUsedAt: now },
  });
  return { token, deviceId: session.id, clerkId: link.user.clerkId };
}

/** The session behind a device token, with its member; null if there is none. */
export async function findDeviceSession(token: string) {
  return db.deviceSession.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
}

/**
 * The session behind a device token if it is still signed in. A session that
 * has gone unused for SESSION_IDLE_DAYS is deleted here and answered as if it
 * had never existed, so requireUser sends the same 401 as for an unknown token.
 */
export async function findLiveDeviceSession(token: string, now = new Date()) {
  const session = await findDeviceSession(token);
  if (!session) return null;
  if (!sessionIsIdle(session.lastUsedAt, now)) return session;
  // Conditional on still being idle; a failed delete still refuses the token,
  // and the next sweep in createLink takes the row.
  await db.deviceSession
    .deleteMany({ where: { id: session.id, lastUsedAt: { lte: idleCutoff(now) } } })
    .catch((err: unknown) => console.error('[auth] idle device session', err));
  return null;
}

/**
 * Note that the device was seen. Conditional on the stored value being stale,
 * so a burst of requests from one phone writes it once.
 */
export async function touchDeviceSession(id: string, now = new Date()) {
  await db.deviceSession.updateMany({
    where: { id, lastUsedAt: { lte: new Date(now.getTime() - LAST_USED_EVERY_MS) } },
    data: { lastUsedAt: now },
  });
}
