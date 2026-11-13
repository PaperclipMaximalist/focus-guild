/**
 * Sign-in for the iOS app (OAuth for native apps, RFC 8252, with PKCE, in miniature).
 *
 * Clerk cannot run in the WebView, so the app never loads it. Instead:
 *   1. startSignIn() makes a verifier and a state, keeps them, and opens
 *      <WEB_URL>/app-link?challenge=…&state=… in the in-app browser sheet.
 *   2. The member signs in on the website as usual and presses Connect; the
 *      website gets a one-time code (POST /devices/link) and sends the browser
 *      to focusguild://link?code=…&state=…
 *   3. iOS hands that URL to the app (appUrlOpen). handleOpenUrl() checks the
 *      state, closes the sheet and trades code + verifier for a device token
 *      (POST /devices/token).
 *   4. The token and the member's clerkId go to the Keychain, and lib/api.ts
 *      sends the token as its bearer from then on.
 *
 * A 401 on a request that carried the token means the device was signed out
 * (from the website, or the account is gone): the token is cleared and the
 * app reloads to its sign-in screen. Sign out revokes the token, clears it
 * and reloads too, so every in-memory store starts clean.
 */

import { create } from 'zustand';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { APP_SCHEME, WEB_URL } from './platform';
import { newPkce } from './pkce';
import {
  ApiRequestError,
  ConnectionError,
  devicesApi,
  setAuthTokenGetter,
  setCurrentClerkId,
  setUnauthorizedHandler,
} from '../lib/api';
import { APP_LINK_PATH, LINK_MAX_AGE_MS } from './linkRequest';

export type AuthStatus = 'loading' | 'signedOut' | 'linking' | 'signedIn';

interface NativeAuthState {
  status: AuthStatus;
  /** The device token (`fgd_…`); null until signed in. */
  token: string | null;
  clerkId: string | null;
  /** A plain sentence for the sign-in screen, or null. */
  error: string | null;
  /** The code is being traded for a token: the browser part is over. */
  exchanging: boolean;
  startSignIn: () => Promise<void>;
  cancelSignIn: () => void;
  handleOpenUrl: (url: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// Keychain entries (capacitor-secure-storage-plugin; localStorage on the web).
const TOKEN_KEY = 'focusGuild.deviceToken';
const CLERK_ID_KEY = 'focusGuild.deviceClerkId';
// For the tab only: survives a WebView reload while the sheet is open.
const PENDING_KEY = 'focusGuild.pendingSignIn';
// A sentence to show after the reload that a revoked token causes.
const NOTICE_KEY = 'focusGuild.authNotice';

export const MESSAGES = {
  openFailed: 'The sign-in page didn’t open. Check your connection, then press Sign in again.',
  expired: 'That sign-in took too long or was already used. Press Sign in to try again.',
  mismatch: 'That sign-in didn’t come from this app. Press Sign in to try again.',
  noCode: 'The website didn’t send a sign-in code. Press Sign in to try again.',
  failed: 'Sign-in didn’t finish. Press Sign in to try again.',
  revoked: 'You were signed out. Sign in again to pick up where you left off.',
} as const;

// ─── The pending sign-in: verifier and state, between the sheet and the link ──

interface Pending {
  verifier: string;
  state: string;
  at: number;
}

let pendingInMemory: Pending | null = null;

const isFresh = (p: Pending) => Date.now() - p.at < LINK_MAX_AGE_MS && Date.now() >= p.at;

function savePending(p: Pending): void {
  pendingInMemory = p;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // Memory alone, then.
  }
}

function loadPending(): Pending | null {
  let p = pendingInMemory;
  if (!p) {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      const v = raw ? (JSON.parse(raw) as Partial<Pending>) : null;
      if (v && typeof v.verifier === 'string' && typeof v.state === 'string' && typeof v.at === 'number') {
        p = { verifier: v.verifier, state: v.state, at: v.at };
      }
    } catch {
      // Unreadable: as if there were none.
    }
  }
  if (p && !isFresh(p)) {
    clearPending();
    return null;
  }
  return p;
}

function clearPending(): void {
  pendingInMemory = null;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing kept.
  }
}

/** The pending sign-in, used up: a link is answered once. */
function takePending(): Pending | null {
  const p = loadPending();
  clearPending();
  return p;
}

// ─── Keychain ─────────────────────────────────────────────────────────────────

async function readSecure(key: string): Promise<string | null> {
  try {
    const { value } = await SecureStoragePlugin.get({ key });
    return value || null;
  } catch {
    // The plugin rejects for a key that is not there.
    return null;
  }
}

async function writeSession(token: string, clerkId: string): Promise<void> {
  try {
    await SecureStoragePlugin.set({ key: TOKEN_KEY, value: token });
    await SecureStoragePlugin.set({ key: CLERK_ID_KEY, value: clerkId });
  } catch {
    // Signed in for this run; the next launch asks again. Better than
    // refusing a sign-in the server has already granted.
  }
}

async function clearSession(): Promise<void> {
  await Promise.all(
    [TOKEN_KEY, CLERK_ID_KEY].map((key) => SecureStoragePlugin.remove({ key }).catch(() => undefined)),
  );
}

// localStorage, which iOS deletes with the app (the Keychain it does not).
const INSTALLED_KEY = 'focusGuild.installed';

/**
 * First launch after an install: the Keychain outlives deleting the app, so a
 * reinstalled app would start signed in with a token from before. With no
 * marker in localStorage, this is a fresh install: forget the Keychain's
 * session, then set the marker. main.tsx runs it before startNativeAuth().
 */
export async function forgetSessionOnFirstLaunch(): Promise<void> {
  try {
    if (localStorage.getItem(INSTALLED_KEY)) return;
  } catch {
    // No localStorage to tell by: never wipe a session on a guess.
    return;
  }
  await clearSession();
  try {
    localStorage.setItem(INSTALLED_KEY, '1');
  } catch {
    // Read above, so this is not expected; the next launch would only clear again.
  }
}

// ─── Wiring into lib/api.ts ───────────────────────────────────────────────────

function applySession(clerkId: string): void {
  setCurrentClerkId(clerkId);
  setAuthTokenGetter(async () => useNativeAuth.getState().token);
}

/** Set once leaving has begun (sign out, or a revoked token), so it happens once. */
let leaving = false;

/** Back to the start with every in-memory store empty. */
function reloadToRoot(): void {
  window.location.replace('/');
}

function onUnauthorized(sentToken: string): void {
  if (leaving || useNativeAuth.getState().token !== sentToken) return;
  leaving = true;
  useNativeAuth.setState({ status: 'signedOut', token: null, clerkId: null, error: MESSAGES.revoked });
  setAuthTokenGetter(null);
  void clearSession().then(() => {
    try {
      sessionStorage.setItem(NOTICE_KEY, MESSAGES.revoked);
    } catch {
      // The screen still says it until the reload.
    }
    reloadToRoot();
  });
}

function takeNotice(): string | null {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}

// ─── The link URL ─────────────────────────────────────────────────────────────

/** `focusguild://link?code=…&state=…` → its code and state; null for any other URL. */
export function parseAppLink(url: string): { code: string | null; state: string | null } | null {
  const prefix = `${APP_SCHEME}://link`;
  if (url.slice(0, prefix.length).toLowerCase() !== prefix) return null;
  let rest = url.slice(prefix.length);
  const hash = rest.indexOf('#');
  if (hash >= 0) rest = rest.slice(0, hash);
  if (rest.startsWith('/')) rest = rest.slice(1);
  if (rest !== '' && !rest.startsWith('?')) return null; // focusguild://linkx, focusguild://link/other
  const q = new URLSearchParams(rest);
  return { code: q.get('code'), state: q.get('state') };
}

function describe(err: unknown): string {
  // The server's messages for INVALID_LINK are written to be shown as they are.
  if (err instanceof ApiRequestError && err.detail) return err.detail;
  if (err instanceof ConnectionError) return err.message;
  return MESSAGES.failed;
}

/** The same URL can arrive twice at a cold start (launch URL and the event). */
let lastUrl: string | null = null;

// ─── The store ────────────────────────────────────────────────────────────────

export const useNativeAuth = create<NativeAuthState>((set, get) => ({
  status: 'loading',
  token: null,
  clerkId: null,
  error: null,
  exchanging: false,

  startSignIn: async () => {
    if (get().exchanging) return;
    try {
      const { verifier, state, challenge } = await newPkce();
      savePending({ verifier, state, at: Date.now() });
      set({ status: 'linking', error: null });
      const q = new URLSearchParams({ challenge, state });
      // The dev server's tab for the website must not inherit `?native=1` (platform.ts).
      if (import.meta.env.DEV) q.set('native', '0');
      await Browser.open({ url: `${WEB_URL}${APP_LINK_PATH}?${q}` });
    } catch {
      clearPending();
      set({ status: 'signedOut', error: MESSAGES.openFailed });
    }
  },

  cancelSignIn: () => {
    if (get().exchanging) return;
    clearPending();
    set({ status: 'signedOut', error: null });
    void Browser.close().catch(() => undefined);
  },

  handleOpenUrl: async (url) => {
    const link = parseAppLink(url);
    if (!link || url === lastUrl) return;
    lastUrl = url;
    if (get().exchanging) return;
    const pending = takePending();
    // The browser has done its part, whatever happens next.
    void Browser.close().catch(() => undefined);
    if (!pending) {
      // Signed in already: a stray or repeated link changes nothing.
      if (get().status !== 'signedIn') set({ status: 'signedOut', error: MESSAGES.expired });
      return;
    }
    if (link.state !== pending.state) {
      set({ status: 'signedOut', error: MESSAGES.mismatch });
      return;
    }
    if (!link.code) {
      set({ status: 'signedOut', error: MESSAGES.noCode });
      return;
    }
    set({ status: 'linking', exchanging: true, error: null });
    try {
      const { token, clerkId } = await devicesApi.token(link.code, pending.verifier);
      await writeSession(token, clerkId);
      set({ token, clerkId });
      applySession(clerkId);
      set({ status: 'signedIn', exchanging: false });
    } catch (err) {
      set({ status: 'signedOut', exchanging: false, error: describe(err) });
    }
  },

  signOut: async () => {
    if (leaving) return;
    leaving = true;
    // Best effort: a dead connection must not keep anyone signed in on this phone.
    try {
      await Promise.race([
        devicesApi.revokeCurrent(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch {
      // Already revoked, or offline: the token is forgotten here either way.
    }
    setAuthTokenGetter(null);
    clearPending();
    await clearSession();
    reloadToRoot();
  },
}));

let started = false;

/**
 * Once, at launch in the app: read the Keychain, then listen for the link.
 * Called from main.tsx before the first render.
 */
export async function startNativeAuth(): Promise<void> {
  if (started) return;
  started = true;
  setUnauthorizedHandler(onUnauthorized);

  if (import.meta.env.DEV) {
    // Desktop testing: paste the focusguild:// URL the web page logs.
    window.__fgOpenUrl = (url: string) => useNativeAuth.getState().handleOpenUrl(url);
  }

  const notice = takeNotice();
  const [token, clerkId] = await Promise.all([readSecure(TOKEN_KEY), readSecure(CLERK_ID_KEY)]);
  if (token && clerkId) {
    useNativeAuth.setState({ token, clerkId });
    applySession(clerkId);
    useNativeAuth.setState({ status: 'signedIn', error: null });
  } else {
    // A WebView reload while the sheet was open: still waiting for it.
    useNativeAuth.setState({ status: loadPending() ? 'linking' : 'signedOut', error: notice });
  }

  try {
    await App.addListener('appUrlOpen', (e) => void useNativeAuth.getState().handleOpenUrl(e.url));
    // The member closed the sheet without finishing. The pending sign-in is
    // kept: a link that still arrives is answered.
    await Browser.addListener('browserFinished', () => {
      const s = useNativeAuth.getState();
      if (s.status === 'linking' && !s.exchanging) useNativeAuth.setState({ status: 'signedOut' });
    });
    const launch = await App.getLaunchUrl();
    if (launch?.url) await useNativeAuth.getState().handleOpenUrl(launch.url);
  } catch {
    // A plugin missing from the build: the Sign in button still works, and
    // the dev seam above stands in for the link.
  }
}

declare global {
  interface Window {
    /** Development only: hand the app a focusguild:// URL as iOS would. */
    __fgOpenUrl?: (url: string) => Promise<void>;
  }
}
