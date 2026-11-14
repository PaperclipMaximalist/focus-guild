/**
 * Auth middleware abstraction.
 *
 * Production: verifies a Clerk Bearer token via @clerk/backend.
 * Dev: falls back to an `X-Dev-Clerk-Id` header or `?clerkId=` query param.
 *
 * Either way, the user is upserted into the DB on first sight, and the
 * resolved User row is attached to `c.var.user`. Route handlers read it
 * via `c.get('user')` — they never see a raw clerkId again.
 *
 * Flip-to-real-Clerk checklist:
 *   1. Set `CLERK_SECRET_KEY` in server .env.
 *   2. Set `VITE_CLERK_PUBLISHABLE_KEY` in client .env.
 *   3. Install `@clerk/clerk-react` on the client (`npm i @clerk/clerk-react`).
 *   4. Wrap App.tsx in <ClerkProvider> and use `useAuth()` to get the
 *      session token; pass it as `Authorization: Bearer <token>` via the
 *      `getToken` arg in api.ts.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { PAT_PREFIX, hashPersonalToken } from './tokens.js';
import { DEVICE_PREFIX, findLiveDeviceSession, lastUsedIsStale, touchDeviceSession } from './deviceSessions.js';
import { verifyToken } from '@clerk/backend';
import { db } from '../db/client.js';
import type { User } from '../../generated/prisma/client.js';

/**
 * How the caller proved who they are. Some routes care: only a person signed
 * in on the website may add a device, and a script's personal token may not
 * erase the account.
 *   clerk  a verified Clerk session (the website)
 *   dev    the dev fallback, when Clerk is not configured; stands in for clerk
 *   pat    a personal access token (fgpat_…)
 *   device a device token from the app (fgd_…)
 */
export type AuthKind = 'clerk' | 'dev' | 'pat' | 'device';

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    authKind: AuthKind;
    /** The device session making the call; null unless authKind is 'device'. */
    deviceSessionId: string | null;
  }
}

/** A web sign-in: Clerk, or the dev fallback that stands in for it locally. */
export const isWebSignIn = (kind: AuthKind | undefined) => kind === 'clerk' || kind === 'dev';

const CLERK_SECRET_KEY = process.env['CLERK_SECRET_KEY'];
const DEV_FALLBACK_CLERK_ID = 'dev-member-001';

const clerkConfigured = Boolean(CLERK_SECRET_KEY);

if (!clerkConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[auth] CLERK_SECRET_KEY not set — falling back to dev auth. ' +
      `Routes will accept X-Dev-Clerk-Id header or ?clerkId= query param ` +
      `(default: ${DEV_FALLBACK_CLERK_ID}).`,
  );
}

/**
 * Resolve a clerkId from the request. Returns null if no source produced one.
 *
 * - Clerk configured (production): ONLY a verified Clerk Bearer token works.
 *   Dev header / query param / fallback are all refused so a client can't
 *   impersonate other users by sending X-Dev-Clerk-Id with someone else's id.
 * - Clerk not configured (local dev): X-Dev-Clerk-Id header > ?clerkId= query
 *   > DEV_FALLBACK_CLERK_ID so the dev experience stays zero-config.
 */
async function resolveClerkId(c: Context): Promise<string | null> {
  if (clerkConfigured) {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    const token = auth.slice('Bearer '.length);
    try {
      const session = await verifyToken(token, { secretKey: CLERK_SECRET_KEY! });
      const sub = (session as { sub?: string }).sub;
      return sub ?? null;
    } catch {
      return null;
    }
  }

  // Dev mode only — never reached when CLERK_SECRET_KEY is set.
  const headerId = c.req.header('X-Dev-Clerk-Id');
  if (headerId) return headerId;
  const queryId = c.req.query('clerkId');
  if (queryId) return queryId;
  return DEV_FALLBACK_CLERK_ID;
}

/**
 * Middleware: resolve the user (creating them on first sight) and attach to
 * the context. Route handlers use `c.get('user')`.
 *
 * Skips routes that carry their own token (`/health`, `/inbox`, `/calendar/<token>.ics`),
 * and `POST /devices/token`, where the app has no token yet: the one-time code
 * and its PKCE verifier are its credentials.
 * `POST /users` used to be skipped too, which let anyone create a row for any
 * clerkId and read that member's whole record back; it now needs auth like
 * everything else (the upsert below is what creates a new member).
 */
export const requireUser: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  // /inbox and /calendar/<token>.ics carry their own personal token.
  if (path === '/health' || path === '/inbox' || path.startsWith('/calendar/')) {
    return next();
  }
  if (path === '/devices/token' && c.req.method === 'POST') {
    return next();
  }

  const auth = c.req.header('Authorization');

  // A device token from the iOS app. Checked before Clerk in both modes: it is
  // not a JWT, and in dev mode an unknown one must 401, not fall back to the
  // dev member. A sign-in unused for 180 days is over, and answers exactly
  // like an unknown token (lib/deviceSessions.ts, SESSION_IDLE_DAYS).
  const deviceToken = auth?.startsWith(`Bearer ${DEVICE_PREFIX}`) ? auth.slice('Bearer '.length) : null;
  if (deviceToken) {
    const now = new Date();
    const session = await findLiveDeviceSession(deviceToken, now);
    if (!session) {
      return c.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'This device is signed out. Sign in again from the app.' } },
        401,
      );
    }
    if (lastUsedIsStale(session.lastUsedAt, now)) {
      // "Last seen" is a nicety: a failed write must not fail the request.
      await touchDeviceSession(session.id, now).catch((err) => console.error('[auth] lastUsedAt', err));
    }
    c.set('user', session.user);
    c.set('authKind', 'device');
    c.set('deviceSessionId', session.id);
    return next();
  }

  // A personal access token identifies the user directly — no Clerk involved.
  // Used by the MCP connector and any script the user points at the API.
  const pat = auth?.startsWith(`Bearer ${PAT_PREFIX}`) ? auth.slice('Bearer '.length) : null;
  if (pat) {
    const byToken = await db.user.findUnique({ where: { personalTokenHash: hashPersonalToken(pat) } });
    if (!byToken) {
      return c.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid personal access token' } },
        401,
      );
    }
    c.set('user', byToken);
    c.set('authKind', 'pat');
    c.set('deviceSessionId', null);
    return next();
  }

  const clerkId = await resolveClerkId(c);
  if (!clerkId) {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid auth' } },
      401,
    );
  }

  // Upsert: in real auth, a new clerkId means a new sign-up.
  const user = await db.user.upsert({
    where: { clerkId },
    create: { clerkId, level: 1, totalXP: 0, currentStreak: 0, multiplier: 1.0 },
    update: {},
  });

  c.set('user', user);
  c.set('authKind', clerkConfigured ? 'clerk' : 'dev');
  c.set('deviceSessionId', null);
  await next();
};

/** True iff Clerk is configured (i.e. CLERK_SECRET_KEY is set). */
export const CLERK_ENABLED = clerkConfigured;
