/**
 * The WEBSITE's half of connecting the iPhone app: the request the app sent
 * (`/app-link?challenge=…&state=…`), kept for the tab while the member signs
 * in or signs up, so that if Clerk lands them on `/` instead of back on
 * /app-link the shell can still show the Connect page.
 *
 * Only the challenge and state are kept, never a URL: where the page sends
 * the member afterwards is always the app's own scheme, built here.
 */

import { isValidChallenge, isValidState } from './pkce';

export const APP_LINK_PATH = '/app-link';

/** How long a started sign-in stays good, on both sides. */
export const LINK_MAX_AGE_MS = 10 * 60 * 1000;

const KEY = 'focusGuild.appLinkRequest';

export interface LinkRequest {
  challenge: string;
  state: string;
}

/** The request in the current address, if this is /app-link with a well-formed one. */
export function linkRequestFromLocation(loc: Pick<Location, 'pathname' | 'search'> = window.location): LinkRequest | null {
  if (loc.pathname !== APP_LINK_PATH) return null;
  const q = new URLSearchParams(loc.search);
  const challenge = q.get('challenge');
  const state = q.get('state');
  return isValidChallenge(challenge) && isValidState(state) ? { challenge, state } : null;
}

export function saveLinkRequest(req: LinkRequest): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...req, at: Date.now() }));
  } catch {
    // Private mode without storage: the redirect props alone have to do.
  }
}

/** The kept request, if there is one under ten minutes old and well formed. */
export function loadLinkRequest(): LinkRequest | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LinkRequest & { at: number }>;
    const fresh = typeof v.at === 'number' && Date.now() - v.at < LINK_MAX_AGE_MS && Date.now() >= v.at;
    if (fresh && isValidChallenge(v.challenge) && isValidState(v.state)) {
      return { challenge: v.challenge, state: v.state };
    }
    sessionStorage.removeItem(KEY);
  } catch {
    // Unreadable or unparsable: as if there were none.
  }
  return null;
}

export function clearLinkRequest(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing kept, nothing to clear.
  }
}

/** True when the shell should show the Connect page instead of the app. */
export function wantsAppLinkPage(): boolean {
  return window.location.pathname === APP_LINK_PATH || loadLinkRequest() !== null;
}

/** The page's own address for a request: where Clerk is sent back to after sign-in or sign-up. */
export function appLinkUrl(req: LinkRequest): string {
  const q = new URLSearchParams({ challenge: req.challenge, state: req.state });
  return `${window.location.origin}${APP_LINK_PATH}?${q}`;
}
