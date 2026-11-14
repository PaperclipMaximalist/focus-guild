/**
 * Delete account, the parts that are not screen: the word that confirms it,
 * what a failure says, and what the website does once the server has erased
 * the account. The sheet is components/DeleteAccountDialog.tsx; the app's
 * half is deleteAccountFromApp in native/auth.ts.
 */

import { ApiRequestError, ConnectionError, api } from './api';

export const CONFIRM_WORD = 'DELETE';

/** What the sign-in page says once, after the account is gone (the app says the same, native/auth.ts). */
export const DELETED_NOTICE = 'Your account and everything in it was deleted.';
const DELETED_NOTICE_KEY = 'focusGuild.accountNotice';

/** The sentence left for the website's sign-in page, if there is one. Reading does not remove it (a render can run twice). */
export function readDeletedNotice(): string | null {
  try {
    return sessionStorage.getItem(DELETED_NOTICE_KEY);
  } catch {
    return null;
  }
}

/** Once the sign-in page has shown it: a reload does not say it again. */
export function clearDeletedNotice(): void {
  try {
    sessionStorage.removeItem(DELETED_NOTICE_KEY);
  } catch {
    // Nothing kept.
  }
}

/** The member typed the word: spaces around it and the keyboard's capital first letter do not matter. */
export const confirmMatches = (typed: string) => typed.trim().toUpperCase() === CONFIRM_WORD;

/** A failed delete, in plain words. Every failure here means the server did not delete the account. */
export function deleteFailure(err: unknown): string {
  if (err instanceof ConnectionError) return `Nothing was deleted. ${err.message}`;
  if (err instanceof ApiRequestError) {
    if (err.code === 'UNAUTHORIZED') return 'Nothing was deleted: you are signed out. Sign in again, then try again.';
    return `Nothing was deleted. ${err.detail}`;
  }
  return 'Nothing was deleted. Something went wrong; try again in a moment.';
}

/**
 * The website: erase the account, then leave. `signOut` is Clerk's when Clerk
 * is on (it is the caller's, so this file needs no Clerk hook), and the page
 * goes to `/` either way. If signing out fails the account is still gone, so
 * the page goes to `/` regardless.
 */
export async function deleteAccountFromWebsite(
  signOut: (() => Promise<unknown>) | null,
  go: (path: string) => void = (path) => window.location.replace(path),
): Promise<void> {
  await api.users.deleteMe();
  try {
    sessionStorage.setItem(DELETED_NOTICE_KEY, DELETED_NOTICE);
  } catch {
    // The sign-in page then opens without the sentence.
  }
  if (signOut) {
    try {
      await signOut();
    } catch {
      // The account is gone from our server already: leave for `/` anyway.
    }
  }
  go('/');
}
