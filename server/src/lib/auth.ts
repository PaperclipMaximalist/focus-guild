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
import { verifyToken } from '@clerk/backend';
import { db } from '../db/client.js';
import type { User } from '../../generated/prisma/client.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
  }
}

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
 * Order: Clerk-verified session > X-Dev-Clerk-Id header > ?clerkId= query
 *      > DEV_FALLBACK_CLERK_ID (only when Clerk is disabled).
 */
async function resolveClerkId(c: Context): Promise<string | null> {
  // 1. Clerk session — only if configured.
  if (clerkConfigured) {
    const auth = c.req.header('Authorization');
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length);
      try {
        const session = await verifyToken(token, { secretKey: CLERK_SECRET_KEY! });
        const sub = (session as { sub?: string }).sub;
        if (sub) return sub;
      } catch {
        // fall through; route will 401 if nothing else matches
      }
    }
  }

  // 2. Dev header.
  const headerId = c.req.header('X-Dev-Clerk-Id');
  if (headerId) return headerId;

  // 3. Query param (legacy/back-compat; some GETs still use ?clerkId=).
  const queryId = c.req.query('clerkId');
  if (queryId) return queryId;

  // 4. Dev fallback — only when Clerk is disabled, so the app stays
  // usable with zero config.
  if (!clerkConfigured) return DEV_FALLBACK_CLERK_ID;

  return null;
}

/**
 * Middleware: resolve the user (creating them on first sight) and attach to
 * the context. Route handlers use `c.get('user')`.
 *
 * Skips routes that explicitly don't need a user (`/health`, `/users` POST).
 */
export const requireUser: MiddlewareHandler = async (c, next) => {
  // Skip the health check and the user-upsert endpoint itself.
  const path = c.req.path;
  if (path === '/health' || (path === '/users' && c.req.method === 'POST')) {
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
  await next();
};

/** True iff Clerk is configured (i.e. CLERK_SECRET_KEY is set). */
export const CLERK_ENABLED = clerkConfigured;
