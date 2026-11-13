/**
 * Delete my account: everything the member has, then their sign-in.
 *
 * App Review guideline 5.1.1(v) asks for real deletion, not a deactivation.
 * Every table hangs off `users` with ON DELETE CASCADE (deleteAccount.test.ts
 * checks the schema for it), so deleting the user row removes the rest in one
 * statement, inside the database's own transaction.
 *
 * Order: data first, then the Clerk identity.
 * - If the data delete fails nothing is gone, the error reaches the 500
 *   handler, and the member can try again while still signed in.
 * - If removing the identity fails after the data is gone, the member is left
 *   with a sign-in and no data. Signing in again makes a fresh, empty member,
 *   who can delete again and so retry the identity. The other order could
 *   strand data behind an identity that no longer exists, which no one could
 *   then reach to delete.
 * So a Clerk failure is logged and reported (`identityRemoved: false`), never
 * turned into an error after the data is already gone.
 */

import { createClerkClient } from '@clerk/backend';
import { db } from '../db/client.js';

/** Removes a sign-in identity; throws on failure. */
export type RemoveIdentity = (clerkId: string) => Promise<void>;

/** The Clerk remover when Clerk is configured; null otherwise (dev auth has no identity to remove). */
export function clerkIdentityRemover(secretKey = process.env['CLERK_SECRET_KEY']): RemoveIdentity | null {
  if (!secretKey) return null;
  const clerk = createClerkClient({ secretKey });
  return async (clerkId) => {
    try {
      await clerk.users.deleteUser(clerkId);
    } catch (err) {
      // Already gone (a retry, or deleted in the Clerk dashboard) is what we wanted.
      if ((err as { status?: number }).status === 404) return;
      throw err;
    }
  };
}

export async function deleteAccount(
  user: { id: string; clerkId: string },
  removeIdentity: RemoveIdentity | null = clerkIdentityRemover(),
): Promise<{ deleted: true; identityRemoved: boolean }> {
  // deleteMany, not delete: a second, racing request finding the row already
  // gone has still got what it asked for.
  await db.user.deleteMany({ where: { id: user.id } });

  if (!removeIdentity) return { deleted: true, identityRemoved: false };
  try {
    await removeIdentity(user.clerkId);
    return { deleted: true, identityRemoved: true };
  } catch (err) {
    console.error(`[deleteAccount] data for ${user.id} deleted, but the sign-in ${user.clerkId} was not removed`, err);
    return { deleted: true, identityRemoved: false };
  }
}
