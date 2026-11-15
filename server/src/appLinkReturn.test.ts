/**
 * The Universal Link return, through the real app (as app.test.ts does it):
 * the association file and the return page are public and hold nothing, the
 * paths beside them still need sign-in, POST /devices/link says which return
 * to use, and the request log never prints the code or the state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store: { calls: string[]; links: Array<{ codeHash: string; challenge: string }> } = { calls: [], links: [] };

/** The few calls these tests are meant to make. Anything else is recorded and throws. */
const known: Record<string, (args: any) => unknown> = {
  'user.upsert': ({ where }: { where: { clerkId: string } }) => ({ id: `u-${where.clerkId}`, clerkId: where.clerkId }),
  'deviceLink.deleteMany': () => ({ count: 0 }),
  'deviceSession.deleteMany': () => ({ count: 0 }),
  'deviceLink.create': ({ data }: { data: { codeHash: string; challenge: string } }) => {
    store.links.push(data);
    return data;
  },
};

vi.mock('./db/client.js', () => ({
  db: new Proxy(
    {},
    {
      get: (_db, model) =>
        typeof model !== 'string'
          ? undefined
          : new Proxy(
              {},
              {
                get: (_model, method) =>
                  typeof method !== 'string'
                    ? undefined
                    : async (args: unknown) => {
                        const name = `${model}.${method}`;
                        store.calls.push(name);
                        const run = known[name];
                        if (!run) throw new Error(`unexpected database call: ${name}`);
                        return run(args);
                      },
              },
            ),
    },
  ),
}));

delete process.env['CLERK_SECRET_KEY'];
vi.spyOn(console, 'warn').mockImplementation(() => {});
const logged: string[] = [];
vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
  logged.push(String(line));
});

const { app } = await import('./app.js');

const ENV_KEYS = ['APPLE_TEAM_ID', 'IOS_BUNDLE_ID', 'APP_LINK_RETURN'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function setEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
}

const AASA = '/.well-known/apple-app-site-association';
const CHALLENGE = 'a'.repeat(43);

/** No credentials of any kind unless `as` (the dev sign-in) is given. */
async function call(method: string, path: string, opts: { as?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.as) headers['X-Dev-Clerk-Id'] = opts.as;
  const res = await app.request(path, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // The return page is HTML.
  }
  return { status: res.status, text, json, headers: res.headers };
}

beforeEach(() => {
  setEnv({});
  store.calls = [];
  store.links = [];
  logged.length = 0;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('the association file', () => {
  it('is served as JSON, with no credentials, when the team ID is valid', async () => {
    setEnv({ APPLE_TEAM_ID: 'ABCDE12345' });
    const r = await call('GET', AASA);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(r.headers.get('Location')).toBeNull();
    expect(r.json).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['ABCDE12345.com.focusguild.app'],
            components: [{ '/': '/app-link/return', comment: 'Sign-in hand-off to the app' }],
          },
        ],
      },
    });
    expect(store.calls).toEqual([]);
  });

  it('is the usual JSON 404 without a team ID, or with a malformed one', async () => {
    // What any unknown route answers, to a signed-in caller.
    const usual = await call('GET', '/nowhere', { as: 'alex' });
    expect(usual.status).toBe(404);

    for (const team of [undefined, 'ABCDE1234', 'abcde12345', 'ABCDE123456']) {
      setEnv({ APPLE_TEAM_ID: team, APP_LINK_RETURN: 'universal' });
      const r = await call('GET', AASA);
      expect(r.status, String(team)).toBe(404);
      expect(r.json).toEqual(usual.json);
      expect(r.headers.get('Location')).toBeNull();
    }
  });
});

describe('the return page', () => {
  const query = 'code=SECRETCODE123&state=SECRETSTATE456&next=https%3A%2F%2Fevil.test%2F';

  it('answers 200 with no credentials, whether the feature is on or off', async () => {
    for (const env of [{}, { APPLE_TEAM_ID: 'ABCDE12345', APP_LINK_RETURN: 'universal' }]) {
      setEnv(env);
      const r = await call('GET', `/app-link/return?${query}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('Content-Type')).toMatch(/^text\/html/);
      expect(r.text).toContain('the app did not open');
      expect(r.text).toContain('press Sign in again');
    }
    expect(store.calls).toEqual([]);
  });

  it('holds none of the query values it was called with, and sets no-store and no-referrer', async () => {
    const r = await call('GET', `/app-link/return?${query}`);
    for (const v of ['SECRETCODE123', 'SECRETSTATE456', 'evil.test', 'code=', 'state=']) {
      expect(r.text).not.toContain(v);
    }
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(r.headers.get('Location')).toBeNull();
    // Self-contained: nothing that runs, and nothing fetched from anywhere.
    expect(r.text).not.toMatch(/<script|<link|<img|<iframe|src=|href=/i);
  });

  it('is the same page with no query at all', async () => {
    const bare = await call('GET', '/app-link/return');
    const withQuery = await call('GET', `/app-link/return?${query}`);
    expect(bare.text).toBe(withQuery.text);
  });
});

describe('the paths beside them', () => {
  // These tests run in dev auth, where a request with no credentials at all is
  // signed in as the dev member. So "needs sign-in" is shown two ways: a
  // bearer that can sign in to nothing gets 401, and with no credentials
  // requireUser still runs (it looks the dev member up) where the two public
  // paths above never reach it.
  const neighbours = ['/app-link/other', '/app-link/return/x', '/app-link', '/.well-known/other', '/.well-known/apple-app-site-association/x'];
  const refused = { Authorization: 'Bearer fgcal_cannot-sign-in' };

  it('still need sign-in, as before', async () => {
    for (const path of neighbours) {
      const r = await app.request(path, { headers: refused });
      expect(r.status, path).toBe(401);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
    }
    // Only GET is skipped: another method on the same path still needs sign-in.
    expect((await app.request('/app-link/return', { method: 'POST', headers: refused })).status).toBe(401);
    expect((await app.request(AASA, { method: 'POST', headers: refused })).status).toBe(401);
    // The public paths answer the same bearer, because they never ask.
    expect((await app.request('/app-link/return', { headers: refused })).status).toBe(200);
    expect((await app.request(AASA, { headers: refused })).status).toBe(404);
  });

  it('go through requireUser and are then not found, while the public paths never reach it', async () => {
    for (const path of neighbours) {
      store.calls = [];
      const r = await call('GET', path);
      expect(r.status, path).toBe(404);
      expect(store.calls, path).toEqual(['user.upsert']);
    }
    store.calls = [];
    await call('GET', '/app-link/return');
    await call('GET', AASA);
    expect(store.calls).toEqual([]);
  });
});

describe('POST /devices/link', () => {
  it('says the scheme while the feature is off, and nothing else changes', async () => {
    const r = await call('POST', '/devices/link', { as: 'alex', body: { challenge: CHALLENGE, name: 'iPhone' } });
    expect(r.status).toBe(201);
    expect(Object.keys(r.json.data).sort()).toEqual(['code', 'expiresInSec', 'via']);
    expect(r.json.data).toMatchObject({ expiresInSec: 120, via: 'scheme' });
    expect(r.json.data.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('says universal only when both switches are right', async () => {
    const cases: Array<[Partial<Record<(typeof ENV_KEYS)[number], string>>, string]> = [
      [{ APPLE_TEAM_ID: 'ABCDE12345', APP_LINK_RETURN: 'universal' }, 'universal'],
      [{ APPLE_TEAM_ID: 'ABCDE12345' }, 'scheme'],
      [{ APP_LINK_RETURN: 'universal' }, 'scheme'],
      [{ APPLE_TEAM_ID: 'abcde12345', APP_LINK_RETURN: 'universal' }, 'scheme'],
    ];
    for (const [env, via] of cases) {
      setEnv(env);
      const r = await call('POST', '/devices/link', { as: 'alex', body: { challenge: CHALLENGE } });
      expect(r.status).toBe(201);
      expect(r.json.data.via, JSON.stringify(env)).toBe(via);
    }
  });
});

describe('the request log', () => {
  it('shows neither the code nor the state of a return', async () => {
    await call('GET', '/app-link/return?code=abc&state=def');
    expect(logged).toEqual([
      '<-- GET /app-link/return?code=[redacted]&state=[redacted]',
      expect.stringMatching(/^--> GET \/app-link\/return\?code=\[redacted\]&state=\[redacted\] 200 \d+ms$/),
    ]);
    expect(logged.join('\n')).not.toMatch(/abc|def/);
  });
});
