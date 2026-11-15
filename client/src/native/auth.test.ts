/**
 * The app's sign-in state: the link it accepts, the exchange, the Keychain,
 * the bearer it puts on requests, and what a 401 and Sign out do.
 * The plugins are fakes; fetch is stubbed and lib/api.ts is the real one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const keychain = new Map<string, string>();
  const listeners: Record<string, (e: { url: string }) => void> = {};
  return {
    keychain,
    listeners,
    launchUrl: '' as string,
    browserOpen: vi.fn<(o: { url: string }) => Promise<void>>(async () => undefined),
    browserClose: vi.fn(async () => undefined),
  };
});

vi.mock('./platform', () => ({ isNativeApp: true, WEB_URL: 'https://web.example', APP_SCHEME: 'focusguild' }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (name: string, fn: (e: { url: string }) => void) => {
      h.listeners[name] = fn;
      return { remove: async () => undefined };
    },
    getLaunchUrl: async () => (h.launchUrl ? { url: h.launchUrl } : undefined),
  },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: h.browserOpen,
    close: h.browserClose,
    addListener: async (name: string, fn: () => void) => {
      h.listeners[name] = fn as never;
      return { remove: async () => undefined };
    },
  },
}));
vi.mock('capacitor-secure-storage-plugin', () => ({
  SecureStoragePlugin: {
    get: async ({ key }: { key: string }) => {
      if (!h.keychain.has(key)) throw new Error('Item with given key does not exist');
      return { value: h.keychain.get(key)! };
    },
    set: async ({ key, value }: { key: string; value: string }) => {
      h.keychain.set(key, value);
      return { value: true };
    },
    remove: async ({ key }: { key: string }) => {
      if (!h.keychain.delete(key)) throw new Error('Item with given key does not exist');
      return { value: true };
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
let respond: (c: Call) => { status: number; body: unknown } = () => ({ status: 200, body: { success: true, data: {} } });
vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
  const c: Call = {
    url,
    method: init.method ?? 'GET',
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
  calls.push(c);
  const r = respond(c);
  return { status: r.status, json: async () => r.body } as Response;
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function load() {
  vi.resetModules();
  const auth = await import('./auth');
  const api = await import('../lib/api');
  return { auth, api, s: () => auth.useNativeAuth.getState() };
}

/** Starts a sign-in and returns the state the app sent to the website. */
async function startSignIn(auth: Awaited<ReturnType<typeof load>>['auth']) {
  await auth.useNativeAuth.getState().startSignIn();
  const opened = new URL(h.browserOpen.mock.calls.at(-1)![0].url);
  return { state: opened.searchParams.get('state')!, challenge: opened.searchParams.get('challenge')!, opened };
}

beforeEach(() => {
  h.keychain.clear();
  for (const k of Object.keys(h.listeners)) delete h.listeners[k];
  h.launchUrl = '';
  h.browserOpen.mockClear();
  h.browserClose.mockClear();
  session.clear();
  replace.mockClear();
  calls = [];
  respond = (c) =>
    c.url.includes('/devices/token')
      ? { status: 200, body: { success: true, data: { token: 'fgd_abc', deviceId: 'd1', clerkId: 'user_1' } } }
      : { status: 200, body: { success: true, data: {} } };
});

describe('parseAppLink', () => {
  it('reads only focusguild://link', async () => {
    const { auth } = await load();
    expect(auth.parseAppLink('focusguild://link?code=c&state=s')).toEqual({ code: 'c', state: 's' });
    expect(auth.parseAppLink('focusguild://link/?code=c&state=s')).toEqual({ code: 'c', state: 's' });
    expect(auth.parseAppLink('focusguild://linkx?code=c')).toBeNull();
    expect(auth.parseAppLink('focusguild://other?code=c')).toBeNull();
    expect(auth.parseAppLink('https://link?code=c')).toBeNull();
  });
});

describe('parseAppLink, the Universal Link form', () => {
  // API_URL comes from the real lib/api.ts (VITE_API_URL, or its localhost
  // default in a test run); every case is built from it.
  async function setup() {
    const { auth, api } = await load();
    const base = new URL(api.API_URL);
    const host = base.host; // host[:port], as URL writes it
    return { parse: auth.parseAppLink, base, host };
  }
  const ok = { code: 'c', state: 's' };

  it('accepts the return address on the API host, over https or the API’s own scheme', async () => {
    const { parse, base, host } = await setup();
    expect(parse(`https://${host}/app-link/return?code=c&state=s`)).toEqual(ok);
    expect(parse(`${base.protocol}//${host}/app-link/return?code=c&state=s`)).toEqual(ok);
    // One trailing slash, a fragment, other keys, and either order are fine.
    expect(parse(`https://${host}/app-link/return/?code=c&state=s`)).toEqual(ok);
    expect(parse(`https://${host}/app-link/return?state=s&x=1&code=c#frag`)).toEqual(ok);
    expect(parse(`https://${host}/app-link/return?code=c&state=s#state=evil`)).toEqual(ok);
    // The host is compared as an origin would: case does not matter.
    expect(parse(`HTTPS://${host.toUpperCase()}/app-link/return?code=c&state=s`)).toEqual(ok);
    // Missing values come back as null, for handleOpenUrl to refuse with its own message.
    expect(parse(`https://${host}/app-link/return`)).toEqual({ code: null, state: null });
  });

  it('refuses every other address', async () => {
    const { parse, base, host } = await setup();
    const hostname = base.hostname;
    const refused = [
      // Same path, another host or port.
      'https://evil.test/app-link/return?code=c&state=s',
      `https://${hostname}.evil.test/app-link/return?code=c&state=s`,
      `https://evil.${hostname}/app-link/return?code=c&state=s`,
      `https://${hostname}:1/app-link/return?code=c&state=s`,
      // User-info tricks.
      `https://${host}@evil.test/app-link/return?code=c&state=s`,
      `https://user@${host}/app-link/return?code=c&state=s`,
      `https://user:pw@${host}/app-link/return?code=c&state=s`,
      // Other paths on the right host.
      `https://${host}/app-link/return/x?code=c&state=s`,
      `https://${host}/app-link/return//?code=c&state=s`,
      `https://${host}/app-link/returnx?code=c&state=s`,
      `https://${host}/app-link?code=c&state=s`,
      `https://${host}/APP-LINK/RETURN?code=c&state=s`,
      `https://${host}/x/app-link/return?code=c&state=s`,
      `https://${host}/?code=c&state=s`,
      // Other schemes.
      `ftp://${host}/app-link/return?code=c&state=s`,
      `focusguild://${host}/app-link/return?code=c&state=s`,
      'not a url',
    ];
    if (base.protocol === 'https:') refused.push(`http://${host}/app-link/return?code=c&state=s`);
    for (const url of refused) expect(parse(url), url).toBeNull();
  });

  it('refuses a lookalike of a production-style API host', async () => {
    // The API host in a test run may be localhost; check the dotted case too.
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    try {
      const { parse } = await setup();
      expect(parse('https://api.example.com/app-link/return?code=c&state=s')).toEqual(ok);
      expect(parse('https://API.Example.COM:443/app-link/return?code=c&state=s')).toEqual(ok);
      for (const url of [
        'https://api.example.com.evil.test/app-link/return?code=c&state=s',
        'https://evilapi.example.com/app-link/return?code=c&state=s',
        'https://api.example.co/app-link/return?code=c&state=s',
        'https://api.example.com:8443/app-link/return?code=c&state=s',
        'https://api.example.com@evil/app-link/return?code=c&state=s',
        'http://api.example.com/app-link/return?code=c&state=s',
      ]) {
        expect(parse(url), url).toBeNull();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('signs in through the universal form like the scheme', async () => {
    const { auth, api, s } = await load();
    await auth.startNativeAuth();
    const { state } = await startSignIn(auth);
    const host = new URL(api.API_URL).host;
    h.listeners.appUrlOpen({ url: `https://${host}/app-link/return?code=UCODE&state=${state}` });
    await flush();
    await flush();
    expect(calls.find((c) => c.url.includes('/devices/token'))!.body).toMatchObject({ code: 'UCODE' });
    expect(s().status).toBe('signedIn');
  });

  it('ignores the same path on another host, leaving the sign-in pending', async () => {
    const { auth, s } = await load();
    await auth.startNativeAuth();
    const { state } = await startSignIn(auth);
    await s().handleOpenUrl(`https://evil.test/app-link/return?code=CODE&state=${state}`);
    expect(calls.some((c) => c.url.includes('/devices/token'))).toBe(false);
    expect(s().status).toBe('linking');
    expect(h.browserClose).not.toHaveBeenCalled();
  });
});

describe('starting up', () => {
  it('is signed out with an empty Keychain', async () => {
    const { auth, s } = await load();
    await auth.startNativeAuth();
    expect(s().status).toBe('signedOut');
  });

  it('is signed in from the Keychain and sends the token as the bearer', async () => {
    h.keychain.set('focusGuild.deviceToken', 'fgd_kept');
    h.keychain.set('focusGuild.deviceClerkId', 'user_9');
    const { auth, api, s } = await load();
    await auth.startNativeAuth();
    expect(s().status).toBe('signedIn');
    expect(api.getCurrentClerkId()).toBe('user_9');
    await api.devicesApi.list();
    expect(calls[0].headers.Authorization).toBe('Bearer fgd_kept');
    expect(calls[0].headers['X-Dev-Clerk-Id']).toBeUndefined();
  });

  it('answers a launch URL once even when the event brings it too', async () => {
    const { auth, s } = await load();
    await auth.startNativeAuth();
    const { state } = await startSignIn(auth);
    const url = `focusguild://link?code=one&state=${state}`;
    h.launchUrl = url;
    await auth.useNativeAuth.getState().handleOpenUrl(url);
    await auth.useNativeAuth.getState().handleOpenUrl(url);
    expect(calls.filter((c) => c.url.includes('/devices/token'))).toHaveLength(1);
    expect(s().status).toBe('signedIn');
    expect(s().error).toBeNull();
  });
});

describe('signing in', () => {
  it('opens /app-link with a challenge and state, then trades the code for a token', async () => {
    const { auth, api, s } = await load();
    await auth.startNativeAuth();
    const { state, challenge, opened } = await startSignIn(auth);
    expect(opened.origin + opened.pathname).toBe('https://web.example/app-link');
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s().status).toBe('linking');

    h.listeners.appUrlOpen({ url: `focusguild://link?code=CODE&state=${state}` });
    await flush();
    await flush();

    expect(h.browserClose).toHaveBeenCalled();
    const exchange = calls.find((c) => c.url.includes('/devices/token'))!;
    expect(exchange.method).toBe('POST');
    expect(exchange.headers.Authorization).toBeUndefined();
    expect(exchange.headers['X-Dev-Clerk-Id']).toBeUndefined();
    const { code, verifier } = exchange.body as { code: string; verifier: string };
    expect(code).toBe('CODE');
    // The verifier that went out is the one the challenge was made from.
    const { s256Challenge } = await import('./pkce');
    expect(await s256Challenge(verifier)).toBe(challenge);

    expect(s().status).toBe('signedIn');
    expect(h.keychain.get('focusGuild.deviceToken')).toBe('fgd_abc');
    expect(h.keychain.get('focusGuild.deviceClerkId')).toBe('user_1');
    expect(api.getCurrentClerkId()).toBe('user_1');
  });

  it('ignores a link whose state does not match, and still takes the real answer afterwards', async () => {
    const { auth, s } = await load();
    await auth.startNativeAuth();
    const { state } = await startSignIn(auth);
    // Any app can open focusguild:// with anything; it must not end this sign-in.
    await s().handleOpenUrl('focusguild://link?code=CODE&state=somebody-elses-state');
    expect(s().status).toBe('linking');
    expect(s().error).toBeNull();
    expect(h.browserClose).not.toHaveBeenCalled();
    expect(calls.some((c) => c.url.includes('/devices/token'))).toBe(false);

    await s().handleOpenUrl(`focusguild://link?code=CODE&state=${state}`);
    expect(s().status).toBe('signedIn');
    expect(h.browserClose).toHaveBeenCalled();
    expect(calls.filter((c) => c.url.includes('/devices/token'))).toHaveLength(1);
  });

  it('refuses a link when no sign-in was started', async () => {
    const { auth, s } = await load();
    await auth.startNativeAuth();
    await s().handleOpenUrl('focusguild://link?code=CODE&state=abcdefghijklmnopqrstuv');
    expect(s().status).toBe('signedOut');
    expect(s().error).toBe(auth.MESSAGES.expired);
  });

  it('drops a sign-in older than ten minutes', async () => {
    const { auth, s } = await load();
    await auth.startNativeAuth();
    const { state } = await startSignIn(auth);
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000);
    await s().handleOpenUrl(`focusguild://link?code=CODE&state=${state}`);
    spy.mockRestore();
    expect(s().error).toBe(auth.MESSAGES.expired);
  });

  it('survives a reload while the sheet is open (sessionStorage)', async () => {
    const first = await load();
    await first.auth.startNativeAuth();
    const { state } = await startSignIn(first.auth);
    // A fresh module, as after a WebView reload: memory is gone, the tab's storage is not.
    const { auth, s } = await load();
    await auth.startNativeAuth();
    expect(s().status).toBe('linking');
    await s().handleOpenUrl(`focusguild://link?code=CODE&state=${state}`);
    expect(s().status).toBe('signedIn');
  });

  it('shows the server’s message when the code is refused', async () => {
    respond = () => ({
      status: 400,
      body: { success: false, error: { code: 'INVALID_LINK', message: 'This sign-in link has expired.' } },
    });
    const { auth, s } = await load();
    await auth.startNativeAuth();
    const { state } = await startSignIn(auth);
    await s().handleOpenUrl(`focusguild://link?code=CODE&state=${state}`);
    expect(s().status).toBe('signedOut');
    expect(s().error).toBe('This sign-in link has expired.');
    expect(h.keychain.size).toBe(0);
  });

  it('goes back to signed out when the sheet is closed, and Cancel does too', async () => {
    const { auth, s } = await load();
    await auth.startNativeAuth();
    await startSignIn(auth);
    (h.listeners.browserFinished as unknown as () => void)();
    expect(s().status).toBe('signedOut');
    await startSignIn(auth);
    s().cancelSignIn();
    expect(s().status).toBe('signedOut');
    expect(session.has('focusGuild.pendingSignIn')).toBe(false);
  });

  it('says so when the sheet will not open', async () => {
    h.browserOpen.mockRejectedValueOnce(new Error('no'));
    const { auth, s } = await load();
    await auth.startNativeAuth();
    await s().startSignIn();
    expect(s().status).toBe('signedOut');
    expect(s().error).toBe(auth.MESSAGES.openFailed);
  });
});

describe('a revoked token', () => {
  it('clears the Keychain and reloads to the sign-in screen once', async () => {
    h.keychain.set('focusGuild.deviceToken', 'fgd_kept');
    h.keychain.set('focusGuild.deviceClerkId', 'user_9');
    respond = () => ({ status: 401, body: { success: false, error: { code: 'UNAUTHORIZED', message: 'no' } } });
    const { auth, api, s } = await load();
    await auth.startNativeAuth();
    await Promise.allSettled([api.devicesApi.list(), api.devicesApi.list(), api.devicesApi.list()]);
    await flush();
    expect(s().status).toBe('signedOut');
    expect(h.keychain.size).toBe(0);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/');
    expect(session.get('focusGuild.authNotice')).toBe(auth.MESSAGES.revoked);

    // After the reload the notice is shown once, and nothing is sent with a token.
    const next = await load();
    await next.auth.startNativeAuth();
    expect(next.s().status).toBe('signedOut');
    expect(next.s().error).toBe(auth.MESSAGES.revoked);
    expect(session.has('focusGuild.authNotice')).toBe(false);
  });
});

describe('signing out', () => {
  it('revokes the device, clears the Keychain and reloads', async () => {
    h.keychain.set('focusGuild.deviceToken', 'fgd_kept');
    h.keychain.set('focusGuild.deviceClerkId', 'user_9');
    const { auth, s } = await load();
    await auth.startNativeAuth();
    await s().signOut();
    const del = calls.find((c) => c.url.includes('/devices/current'))!;
    expect(del.method).toBe('DELETE');
    expect(del.headers.Authorization).toBe('Bearer fgd_kept');
    expect(h.keychain.size).toBe(0);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('still signs out when the server says the token is already dead', async () => {
    h.keychain.set('focusGuild.deviceToken', 'fgd_kept');
    h.keychain.set('focusGuild.deviceClerkId', 'user_9');
    respond = () => ({ status: 401, body: { success: false, error: { code: 'UNAUTHORIZED', message: 'no' } } });
    const { auth, s } = await load();
    await auth.startNativeAuth();
    await s().signOut();
    expect(h.keychain.size).toBe(0);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
