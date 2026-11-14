/**
 * Delete account: the confirming word, what a failure says, and what the
 * website and the app do once the server has erased the account. The app's
 * plugins are fakes; fetch is stubbed; lib/api.ts and native/auth.ts are real.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ keychain: new Map<string, string>() }));

vi.mock('../native/platform', () => ({ isNativeApp: true, WEB_URL: 'https://web.example', APP_SCHEME: 'focusguild' }));
vi.mock('@capacitor/app', () => ({
  App: { addListener: async () => ({ remove: async () => undefined }), getLaunchUrl: async () => undefined },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: { open: async () => undefined, close: async () => undefined, addListener: async () => ({ remove: async () => undefined }) },
}));
vi.mock('capacitor-secure-storage-plugin', () => ({
  SecureStoragePlugin: {
    get: async ({ key }: { key: string }) => {
      if (!h.keychain.has(key)) throw new Error('missing');
      return { value: h.keychain.get(key)! };
    },
    set: async ({ key, value }: { key: string; value: string }) => void h.keychain.set(key, value),
    remove: async ({ key }: { key: string }) => {
      if (!h.keychain.delete(key)) throw new Error('missing');
    },
  },
}));

const session = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => session.get(k) ?? null,
  setItem: (k: string, v: string) => void session.set(k, String(v)),
  removeItem: (k: string) => void session.delete(k),
});
const replace = vi.fn();
vi.stubGlobal('window', { location: { replace, origin: 'capacitor://localhost' } });

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
let respond: (c: Call) => { status: number; body: unknown };
vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
  const c: Call = { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
  calls.push(c);
  const r = respond(c);
  return { status: r.status, json: async () => r.body } as Response;
});

const ok = { status: 200, body: { success: true, data: { deleted: true, identityRemoved: true } } };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  const auth = await import('../native/auth');
  const api = await import('./api');
  const deletion = await import('./accountDeletion');
  return { auth, api, deletion };
}

beforeEach(() => {
  h.keychain.clear();
  session.clear();
  replace.mockClear();
  calls = [];
  respond = () => ok;
});

describe('the confirming word', () => {
  it('is DELETE, forgiving spaces and the keyboard’s capitals', async () => {
    const { deletion } = await load();
    expect(deletion.confirmMatches('DELETE')).toBe(true);
    expect(deletion.confirmMatches(' Delete ')).toBe(true);
    expect(deletion.confirmMatches('DELET')).toBe(false);
    expect(deletion.confirmMatches('')).toBe(false);
  });
});

describe('a failure', () => {
  it('says nothing was deleted, in plain words', async () => {
    const { deletion, api } = await load();
    expect(deletion.deleteFailure(new api.ConnectionError('Can’t reach the Guild right now.'))).toBe('Nothing was deleted. Can’t reach the Guild right now.');
    expect(deletion.deleteFailure(new api.ApiRequestError('FORBIDDEN', 'Delete your account from the website or the app, signed in.'))).toMatch(/^Nothing was deleted\. Delete your account/);
    expect(deletion.deleteFailure(new api.ApiRequestError('UNAUTHORIZED', 'x'))).toMatch(/signed out/);
    expect(deletion.deleteFailure(new Error('boom'))).toMatch(/^Nothing was deleted/);
  });
});

describe('on the website', () => {
  it('erases the account with the confirming body, signs out of Clerk, then goes to /', async () => {
    const { deletion } = await load();
    const order: string[] = [];
    const go = vi.fn(() => order.push('go'));
    await deletion.deleteAccountFromWebsite(async () => order.push('signOut'), go);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'DELETE', body: { confirm: 'DELETE' } });
    expect(new URL(calls[0].url).pathname).toBe('/users/me');
    expect(order).toEqual(['signOut', 'go']);
    expect(go).toHaveBeenCalledWith('/');
  });

  it('without Clerk (local dev) just goes to /, and still goes if signing out fails', async () => {
    const { deletion } = await load();
    const go = vi.fn();
    await deletion.deleteAccountFromWebsite(null, go);
    expect(go).toHaveBeenCalledWith('/');
    go.mockClear();
    await deletion.deleteAccountFromWebsite(async () => { throw new Error('clerk down'); }, go);
    expect(go).toHaveBeenCalledWith('/');
  });

  it('leaves everything in place when the server refuses', async () => {
    respond = () => ({ status: 403, body: { success: false, error: { code: 'FORBIDDEN', message: 'no' } } });
    const { deletion } = await load();
    const signOut = vi.fn(async () => undefined);
    const go = vi.fn();
    await expect(deletion.deleteAccountFromWebsite(signOut, go)).rejects.toThrow(/FORBIDDEN/);
    expect(signOut).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });
});

describe('in the app', () => {
  async function signedIn() {
    h.keychain.set('focusGuild.deviceToken', 'fgd_kept');
    h.keychain.set('focusGuild.deviceClerkId', 'user_9');
    const loaded = await load();
    await loaded.auth.startNativeAuth();
    return loaded;
  }

  it('erases the account with the device token, forgets the Keychain and reloads to a sign-in screen that says so', async () => {
    const { auth } = await signedIn();
    await auth.deleteAccountFromApp();
    expect(calls[0]).toMatchObject({ method: 'DELETE', body: { confirm: 'DELETE' } });
    expect(calls[0].headers.Authorization).toBe('Bearer fgd_kept');
    expect(h.keychain.size).toBe(0);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/');

    const next = await load();
    await next.auth.startNativeAuth();
    expect(next.auth.useNativeAuth.getState().status).toBe('signedOut');
    expect(next.auth.useNativeAuth.getState().error).toBe(auth.MESSAGES.deleted);
  });

  it('does not take the 401s that follow for "signed out elsewhere"', async () => {
    const { auth, api } = await signedIn();
    // The server has deleted the session: a request in flight comes back 401.
    respond = (c) => (c.url.includes('/users/me') ? ok : { status: 401, body: { success: false, error: { code: 'UNAUTHORIZED', message: 'no' } } });
    const deleting = auth.deleteAccountFromApp();
    await api.devicesApi.list().catch(() => undefined);
    await deleting;
    await flush();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(session.get('focusGuild.authNotice')).toBe(auth.MESSAGES.deleted);
  });

  it('leaves the app signed in when the server cannot be reached', async () => {
    const { auth } = await signedIn();
    respond = () => ({ status: 502, body: 'not json' });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(auth.deleteAccountFromApp()).rejects.toThrow(/reach the Guild/);
    expect(h.keychain.get('focusGuild.deviceToken')).toBe('fgd_kept');
    expect(replace).not.toHaveBeenCalled();
    expect(auth.useNativeAuth.getState().status).toBe('signedIn');
  });
});
