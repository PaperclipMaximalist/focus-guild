/**
 * Append one line to a user's Chronicle.
 *
 * Logging is a side effect of the real mutation, so it must never break it:
 * failures are swallowed and reported to the console, and callers don't await
 * the write unless they need to.
 */

import { Prisma } from '../../generated/prisma/client.js';
import { db } from '../db/client.js';

export function logActivity(
  userId: string,
  kind: string,
  line: string,
  opts: { subjectId?: string | null; data?: Record<string, unknown> } = {},
): Promise<void> {
  return db.activityEntry
    .create({
      data: {
        userId,
        kind,
        line: line.slice(0, 500),
        subjectId: opts.subjectId ?? null,
        data: opts.data ? (opts.data as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    })
    .then(() => undefined)
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn(`[activity] failed to log ${kind}:`, err instanceof Error ? err.message : err);
    });
}
