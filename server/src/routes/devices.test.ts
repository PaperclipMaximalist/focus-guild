/**
 * The device routes behind the real requireUser (in dev auth, as when Clerk is
 * not configured), against a stand-in for the database. Covers who may do
 * what, and that every failed exchange answers exactly the same.
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type User = { id: string; clerkId: string; personalTokenHash: string | null };
type Link = { id: string; userId: string; codeHash: string; challenge: string; name: string; expiresAt: Date; usedAt: Date | null; createdAt: Date };
type Session = { id: string; userId: string; tokenHash: string; name: string; createdAt: Date; lastUsedAt: Date };
const store: { users: User[]; links: Link[]; sessions: Session[]; n: number; touches: number } = { users: [], links: [], sessions: [], n: 0, touches: 0 };

const dateOk = (v: Date | null, cond: unknown): boolean => {
  if (cond === null) return v === null;
  const c = cond as { lte?: Date; gt?: Date; not?: null };
  if ('not' in c) return v !== null;
  if (c.lte) return v !== null && v.getTime() <= c.lte.getTime();
  if (c.gt) return v !== null && v.getTime() > c.gt.getTime();
  return false;
};

vi.mock('../db/client.js', () => ({
  db: {
    user: {
      findUnique: async ({ where }: { where: { personalTokenHash: string } }) =>
        store.users.find((u) => u.personalTokenHash === where.personalTokenHash) ?? null,
      upsert: async ({ where }: { where: { clerkId: string } }) => {
        let u = store.users.find((x) => x.clerkId === where.clerkId);
        if (!u) {
          u = { id: `u-${where.clerkId}`, clerkId: where.clerkId, personalTokenHash: null };
          store.users.push(u);
        }
        return u;
      },
    },
    deviceLink: {
      deleteMany: async ({ where }: { where: { OR: Array<Record<string, unknown>> } }) => {
        store.links = store.links.filter((l) => !where.OR.some((w) => ('expiresAt' in w ? dateOk(l.expiresAt, w['expiresAt']) : dateOk(l.usedAt, w['usedAt']))));
        return { count: 0 };
      },
      create: async ({ data }: { data: Omit<Link, 'id' | 'usedAt' | 'createdAt'> }) => {
        store.n += 1;
        const row = { ...data, id: `l${store.n}`, usedAt: null, createdAt: new Date() };
        store.links.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { codeHash: string } }) => {
        const l = store.links.find((x) => x.codeHash === where.codeHash);
        return l ? { ...l, user: { clerkId: store.users.find((u) => u.id === l.userId)!.clerkId } } : null;
      },
      updateMany: async ({ where, data }: { where: { id: string; expiresAt: unknown }; data: { usedAt: Date } }) => {
        const hit = store.links.filter((l) => l.id === where.id && l.usedAt === null && dateOk(l.expiresAt, where.expiresAt));
        for (const l of hit) l.usedAt = data.usedAt;
        return { count: hit.length };
      },
    },
    deviceSession: {
      create: async ({ data }: { data: Omit<Session, 'id'> }) => {
        store.n += 1;
        const row = { ...data, id: `d${store.n}` };
        store.sessions.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const s = store.sessions.find((x) => x.tokenHash === where.tokenHash);
        return s ? { ...s, user: store.users.find((u) => u.id === s.userId)! } : null;
      },
      findMany: async ({ where }: { where: { userId: string } }) =>
        store.sessions
          .filter((s) => s.userId === where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map(({ id, name, createdAt, lastUsedAt }) => ({ id, name, createdAt, lastUsedAt })),
      updateMany: async ({ where, data }: { where: { id: string; lastUsedAt: unknown }; data: { lastUsedAt: Date } }) => {
        store.touches += 1;
        const hit = store.sessions.filter((s) => s.id === where.id && dateOk(s.lastUsedAt, where.lastUsedAt));
        for (const s of hit) s.lastUsedAt = data.lastUsedAt;
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const before = store.sessions.length;
        store.sessions = store.sessions.filter((s) => !(s.id === where.id && s.userId === where.userId));
        return { count: before - store.sessions.length };
      },
    },
  },
}));

delete process.env['CLERK_SECRET_KEY'];
vi.spyOn(console, 'warn').mockImplementation(() => {});

const { requireUser } = await import('../lib/auth.js');
const { devices } = await import('./devices.js');
const { challengeFor, sha256Hex, INVALID_LINK } = await import('../lib/deviceSessions.js');
const { hashPersonalToken } = await import('../lib/tokens.js');

const app = new Hono();
app.use('*', requireUser);
app.route('/devices', devices);
app.get('/whoami', (c) => c.json({ success: true, data: { id: c.get('user').id, kind: c.get('authKind') } }));

type Res = { status: number; text: string; json: { success: boolean; data?: any; error?: { code: string; message: string } } };
async function call(method: string, path: string, opts: { body?: unknown; as?: string; bearer?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.as) headers['X-Dev-Clerk-Id'] = opts.as;
  if (opts.bearer) headers['Authorization'] = `Bearer ${opts.bearer}`;
  const res = await app.request(path, { method, headers, ...(opts.body !== undefined ? { body: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body) } : {}) });
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
}

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = challengeFor(VERIFIER);

/** Sign a device in for `clerkId` through the real routes; its token. */
async function signInDevice(clerkId: string, name?: string) {
  const link = await call('POST', '/devices/link', { as: clerkId, body: { challenge: CHALLENGE, ...(name ? { name } : {}) } });
  const r = await call('POST', '/devices/token', { body: { code: link.json.data.code, verifier: VERIFIER } });
  return r.json.data as { token: string; deviceId: string; clerkId: string };
}

beforeEach(() => {
  store.users = [];
  store.links = [];
  store.sessions = [];
  store.n = 0;
  store.touches = 0;
});

describe('POST /devices/link', () => {
  it('gives a signed-in member a two-minute code', async () => {
    const r = await call('POST', '/devices/link', { as: 'alex', body: { challenge: CHALLENGE, name: '  Alex’s iPhone  ' } });
    expect(r.status).toBe(201);
    expect(r.json.data).toEqual({ code: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresInSec: 120 });
    expect(store.links[0]).toMatchObject({ name: 'Alex’s iPhone', userId: 'u-alex', codeHash: sha256Hex(r.json.data.code) });
  });

  it('names the device iPhone when the app sends no name', async () => {
    await call('POST', '/devices/link', { as: 'alex', body: { challenge: CHALLENGE } });
    expect(store.links[0]!.name).toBe('iPhone');
  });

  it.each([
    ['no challenge', {}],
    ['a short challenge', { challenge: CHALLENGE.slice(1) }],
    ['a padded challenge', { challenge: `${CHALLENGE.slice(1)}=` }],
    ['a blank name', { challenge: CHALLENGE, name: '   ' }],
    ['a long name', { challenge: CHALLENGE, name: 'x'.repeat(61) }],
    ['not JSON', 'nope'],
  ])('refuses %s', async (_label, body) => {
    const r = await call('POST', '/devices/link', { as: 'alex', body });
    expect(r.status).toBe(400);
    expect(r.json.error!.code).toBe('VALIDATION_ERROR');
    expect(store.links).toHaveLength(0);
  });

  it('refuses a device token: only a person on the website adds a device', async () => {
    const { token } = await signInDevice('alex');
    const r = await call('POST', '/devices/link', { bearer: token, body: { challenge: CHALLENGE } });
    expect(r.status).toBe(403);
    expect(r.json.error!.code).toBe('FORBIDDEN');
  });

  it('refuses a personal access token', async () => {
    store.users.push({ id: 'u-pat', clerkId: 'pat', personalTokenHash: hashPersonalToken('fgpat_secret') });
    const r = await call('POST', '/devices/link', { bearer: 'fgpat_secret', body: { challenge: CHALLENGE } });
    expect(r.status).toBe(403);
    expect(r.json.error!.code).toBe('FORBIDDEN');
  });
});

describe('POST /devices/token', () => {
  it('needs no auth, and returns a token, the device and the member', async () => {
    const link = await call('POST', '/devices/link', { as: 'alex', body: { challenge: CHALLENGE } });
    const r = await call('POST', '/devices/token', { body: { code: link.json.data.code, verifier: VERIFIER } });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ token: expect.stringMatching(/^fgd_[A-Za-z0-9_-]{43}$/), deviceId: store.sessions[0]!.id, clerkId: 'alex' });
  });

  it('answers every failure with the same words, so none says which check failed', async () => {
    const link = await call('POST', '/devices/link', { as: 'alex', body: { challenge: CHALLENGE } });
    const code = link.json.data.code as string;
    const failures = [
      await call('POST', '/devices/token', { body: 'nope' }),
      await call('POST', '/devices/token', { body: { code } }),
      await call('POST', '/devices/token', { body: { code, verifier: 'short' } }),
      await call('POST', '/devices/token', { body: { code: 'x'.repeat(43), verifier: VERIFIER } }),
      await call('POST', '/devices/token', { body: { code, verifier: 'y'.repeat(43) } }),
    ];
    // The wrong verifier above did not spend it.
    expect((await call('POST', '/devices/token', { body: { code, verifier: VERIFIER } })).status).toBe(200);
    failures.push(await call('POST', '/devices/token', { body: { code, verifier: VERIFIER } })); // used
    store.links[0]!.usedAt = null;
    store.links[0]!.expiresAt = new Date(Date.now() - 1);
    failures.push(await call('POST', '/devices/token', { body: { code, verifier: VERIFIER } })); // expired

    const expected = JSON.stringify({ success: false, error: INVALID_LINK });
    for (const f of failures) {
      expect(f.status).toBe(400);
      expect(f.text).toBe(expected);
    }
    expect(INVALID_LINK.message).toBe('That sign-in link has expired or was already used. Start again from the app.');
    expect(store.sessions).toHaveLength(1);
  });
});

describe('a device token', () => {
  it('signs the member in, and an unknown one is a 401 even in dev auth', async () => {
    const { token } = await signInDevice('alex');
    expect((await call('GET', '/whoami', { bearer: token })).json.data).toEqual({ id: 'u-alex', kind: 'device' });
    const r = await call('GET', '/whoami', { bearer: 'fgd_not-a-real-token' });
    expect(r.status).toBe(401);
    expect(r.json.error!.code).toBe('UNAUTHORIZED');
  });

  it('writes lastUsedAt at most once an hour', async () => {
    const { token } = await signInDevice('alex');
    await call('GET', '/whoami', { bearer: token });
    await call('GET', '/whoami', { bearer: token });
    expect(store.touches).toBe(0);
    store.sessions[0]!.lastUsedAt = new Date(Date.now() - 61 * 60_000);
    await call('GET', '/whoami', { bearer: token });
    await call('GET', '/whoami', { bearer: token });
    expect(store.touches).toBe(1);
    expect(Date.now() - store.sessions[0]!.lastUsedAt.getTime()).toBeLessThan(5000);
  });

  it('leaves personal tokens and dev sign-in working', async () => {
    store.users.push({ id: 'u-pat', clerkId: 'pat', personalTokenHash: hashPersonalToken('fgpat_secret') });
    expect((await call('GET', '/whoami', { bearer: 'fgpat_secret' })).json.data).toEqual({ id: 'u-pat', kind: 'pat' });
    expect((await call('GET', '/whoami', { bearer: 'fgpat_wrong' })).status).toBe(401);
    expect((await call('GET', '/whoami', { as: 'sam' })).json.data).toEqual({ id: 'u-sam', kind: 'dev' });
  });
});

describe('GET /devices', () => {
  it('lists the member’s own devices, newest first, and marks the one calling', async () => {
    const a = await signInDevice('alex', 'Old phone');
    store.sessions[0]!.createdAt = new Date(Date.now() - 60_000);
    const b = await signInDevice('alex', 'New phone');
    await signInDevice('sam');
    const r = await call('GET', '/devices', { bearer: a.token });
    expect(r.json.data.map((d: { id: string; name: string; current: boolean }) => [d.id, d.name, d.current])).toEqual([
      [b.deviceId, 'New phone', false],
      [a.deviceId, 'Old phone', true],
    ]);
    expect(Object.keys(r.json.data[0]).sort()).toEqual(['createdAt', 'current', 'id', 'lastUsedAt', 'name']);
    const web = await call('GET', '/devices', { as: 'alex' });
    expect(web.json.data.every((d: { current: boolean }) => !d.current)).toBe(true);
  });
});

describe('signing out', () => {
  it('DELETE /devices/current signs the calling device out', async () => {
    const { token } = await signInDevice('alex');
    const r = await call('DELETE', '/devices/current', { bearer: token });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ revoked: true });
    expect((await call('GET', '/whoami', { bearer: token })).status).toBe(401);
  });

  it('DELETE /devices/current from the website is NOT_A_DEVICE', async () => {
    await signInDevice('alex');
    const r = await call('DELETE', '/devices/current', { as: 'alex' });
    expect(r.status).toBe(400);
    expect(r.json.error!.code).toBe('NOT_A_DEVICE');
    expect(store.sessions).toHaveLength(1);
  });

  it('DELETE /devices/:id signs out one of the member’s own devices, and no one else’s', async () => {
    const mine = await signInDevice('alex');
    const theirs = await signInDevice('sam');
    expect((await call('DELETE', `/devices/${theirs.deviceId}`, { as: 'alex' })).status).toBe(404);
    expect((await call('DELETE', '/devices/nope', { as: 'alex' })).json.error!.code).toBe('NOT_FOUND');
    expect((await call('GET', '/whoami', { bearer: theirs.token })).status).toBe(200);
    const r = await call('DELETE', `/devices/${mine.deviceId}`, { as: 'alex' });
    expect(r.status).toBe(200);
    expect((await call('GET', '/whoami', { bearer: mine.token })).status).toBe(401);
  });
});
