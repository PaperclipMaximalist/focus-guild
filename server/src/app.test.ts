/**
 * The whole app, every route mounted as production mounts it, against a
 * stand-in for the database (in dev auth, as when Clerk is not configured).
 *
 * What it proves about the two tokens a member can make:
 * - the calendar feed token (fgcal_…) reads the plan feed and nothing else: it
 *   is refused by every other route the server has, before the database is
 *   touched;
 * - the personal access token (fgpat_…) no longer opens the feed. Links made
 *   before the feed had its own token stopped at once, with no grace period;
 * - neither token reaches the request log.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type User = {
  id: string;
  clerkId: string;
  personalTokenHash: string | null;
  calendarFeedTokenHash: string | null;
  oldFeedLinkSeenAt: Date | null;
};
type Block = {
  id: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  blockType: string;
  note: string | null;
  reason: string | null;
  quest: { title: string } | null;
};

const store: { users: User[]; blocks: Block[]; parked: string[]; calls: string[] } = { users: [], blocks: [], parked: [], calls: [] };

const newUser = (clerkId: string): User => ({
  id: `u-${clerkId}`,
  clerkId,
  personalTokenHash: null,
  calendarFeedTokenHash: null,
  oldFeedLinkSeenAt: null,
});

type Where = { id?: string; clerkId?: string; personalTokenHash?: string; calendarFeedTokenHash?: string };

/** The few calls these tests are meant to make. Anything else is recorded and throws. */
const known: Record<string, (args: any) => unknown> = {
  'user.findUnique': ({ where }: { where: Where }) =>
    store.users.find((u) =>
      where.personalTokenHash !== undefined
        ? u.personalTokenHash === where.personalTokenHash
        : where.calendarFeedTokenHash !== undefined
          ? u.calendarFeedTokenHash === where.calendarFeedTokenHash
          : u.id === where.id,
    ) ?? null,
  'user.upsert': ({ where }: { where: { clerkId: string } }) => {
    let u = store.users.find((x) => x.clerkId === where.clerkId);
    if (!u) {
      u = newUser(where.clerkId);
      store.users.push(u);
    }
    return u;
  },
  'user.update': ({ where, data }: { where: { id: string }; data: Partial<User> }) =>
    Object.assign(store.users.find((u) => u.id === where.id)!, data),
  'calendarSource.findMany': () => [],
  'scheduleBlock.findMany': ({ where }: { where: { userId: string } }) => store.blocks.filter((b) => b.userId === where.userId),
  'parkingLotEntry.create': ({ data }: { data: { text: string } }) => {
    store.parked.push(data.text);
    return { id: `p${store.parked.length}` };
  },
  'activityEntry.create': () => ({}),
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
const { hashFeedToken, hashPersonalToken } = await import('./lib/tokens.js');

type Res = { status: number; text: string; type: string; json: { success?: boolean; data?: any; error?: { code: string; message: string } } | null };
async function call(method: string, path: string, opts: { as?: string; bearer?: string; body?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.as) headers['X-Dev-Clerk-Id'] = opts.as;
  if (opts.bearer) headers['Authorization'] = `Bearer ${opts.bearer}`;
  const res = await app.request(path, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
  const text = await res.text();
  let json: Res['json'] = null;
  try {
    json = JSON.parse(text);
  } catch {
    // The feed answers in text/calendar or plain text.
  }
  return { status: res.status, text, type: res.headers.get('Content-Type') ?? '', json };
}

/** Make a feed link for `clerkId` through the real route; its token. */
async function makeFeedToken(clerkId: string): Promise<string> {
  const r = await call('POST', '/integrations/feed-token', { as: clerkId, body: {} });
  expect(r.status).toBe(200);
  return r.json!.data.token as string;
}

/** Make a personal access token for `clerkId` through the real route; the token. */
async function makePersonalToken(clerkId: string): Promise<string> {
  const r = await call('POST', '/integrations/token', { as: clerkId, body: {} });
  expect(r.status).toBe(200);
  return r.json!.data.token as string;
}

const block = (userId: string, title: string, hoursFromNow: number): Block => ({
  id: `b-${title}`,
  userId,
  startTime: new Date(Date.now() + hoursFromNow * 3_600_000),
  endTime: new Date(Date.now() + (hoursFromNow + 1) * 3_600_000),
  blockType: 'WORK',
  note: null,
  reason: null,
  quest: { title },
});

beforeEach(() => {
  store.users = [];
  store.blocks = [];
  store.parked = [];
  store.calls = [];
  logged.length = 0;
});

describe('the calendar feed token', () => {
  it('is its own token, made apart from the personal one, and only its hash is kept', async () => {
    const feed = await makeFeedToken('alex');
    expect(feed).toMatch(/^fgcal_[A-Za-z0-9_-]{32}$/);

    const alex = store.users[0]!;
    expect(alex.calendarFeedTokenHash).toBe(hashFeedToken(feed));
    expect(alex.personalTokenHash).toBeNull();
    expect((await call('GET', '/integrations', { as: 'alex' })).json!.data).toMatchObject({ feedEnabled: true, tokenEnabled: false, oldFeedLinkSeenAt: null });

    // Making the personal token leaves the feed link alone, and the other way round.
    const personal = await makePersonalToken('alex');
    expect(alex.calendarFeedTokenHash).toBe(hashFeedToken(feed));
    await makeFeedToken('alex');
    expect(alex.personalTokenHash).toBe(hashPersonalToken(personal));
  });

  it('opens that member’s plan as a calendar, and nobody else’s', async () => {
    const feed = await makeFeedToken('alex');
    await makeFeedToken('sam');
    store.blocks = [block('u-alex', 'Essay outline', 2), block('u-sam', 'Sam’s secret quest', 3)];

    const r = await call('GET', `/calendar/${feed}.ics`);
    expect(r.status).toBe(200);
    expect(r.type).toContain('text/calendar');
    expect(r.text).toContain('BEGIN:VCALENDAR');
    expect(r.text).toContain('Essay outline');
    expect(r.text).not.toContain('Sam’s secret quest');
  });

  it('stops working when it is replaced or turned off', async () => {
    const first = await makeFeedToken('alex');
    const second = await makeFeedToken('alex');
    expect((await call('GET', `/calendar/${first}.ics`)).status).toBe(404);
    expect((await call('GET', `/calendar/${second}.ics`)).status).toBe(200);

    const off = await call('DELETE', '/integrations/feed-token', { as: 'alex' });
    expect(off.json!.data).toEqual({ revoked: true });
    expect((await call('GET', `/calendar/${second}.ics`)).status).toBe(404);
    expect((await call('GET', '/integrations', { as: 'alex' })).json!.data.feedEnabled).toBe(false);
  });
});

describe('a feed token used as a key to the API', () => {
  /** Every route the server registers, with its parameters filled in. Middleware (ALL) is not a route. */
  const everyRoute = () => {
    const seen = new Map<string, { method: string; path: string }>();
    for (const r of app.routes) {
      if (r.method === 'ALL') continue;
      seen.set(`${r.method} ${r.path}`, { method: r.method, path: r.path.replace(/:[^/]+/g, 'x') });
    }
    return [...seen.entries()].map(([name, r]) => ({ name, ...r }));
  };

  it('is refused by every route the server has, before the database is asked anything', async () => {
    const feed = await makeFeedToken('alex');
    const routes = everyRoute();
    // The walk is only worth something if it really is the whole API.
    expect(routes.length).toBeGreaterThan(80);
    for (const must of ['GET /quests', 'DELETE /users/me', 'POST /schedule/generate', 'GET /integrations', 'POST /integrations/token', 'POST /inbox']) {
      expect(routes.map((r) => r.name)).toContain(must);
    }

    store.calls = [];
    const wrong: string[] = [];
    for (const r of routes) {
      // The feed itself is what the token is for; it has its own tests above.
      if (r.name === 'GET /calendar/:file') continue;
      const res = await call(r.method, r.path, { bearer: feed, ...(r.method === 'GET' ? {} : { body: {} }) });
      // /health says only that the server is up, to anyone. POST /devices/token
      // takes a one-time code and no bearer at all; an empty body is a bad code.
      const expected = r.name === 'GET /health' ? 200 : r.name === 'POST /devices/token' ? 400 : 401;
      if (res.status !== expected) wrong.push(`${r.name} answered ${res.status}`);
      if (expected === 401 && res.json?.error?.code !== 'UNAUTHORIZED') wrong.push(`${r.name} did not say UNAUTHORIZED`);
    }
    expect(wrong).toEqual([]);
    expect(store.calls).toEqual([]);
  });

  it('is refused on an address that is no route at all, and without the .ics too', async () => {
    const feed = await makeFeedToken('alex');
    expect((await call('GET', '/nowhere', { bearer: feed })).status).toBe(401);
    expect((await call('GET', '/quests', { bearer: feed })).json!.error!.message).toBe('A calendar feed link cannot sign in. Use a personal access token.');
    // Dev sign-in beside it does not rescue it: the bearer is what is judged.
    expect((await call('GET', '/quests', { bearer: feed, as: 'alex' })).status).toBe(401);
  });

  it('is refused by the inbox, as a bearer token and as ?token=', async () => {
    const feed = await makeFeedToken('alex');
    expect((await call('POST', '/inbox', { bearer: feed, body: { text: 'nope' } })).status).toBe(401);
    expect((await call('POST', `/inbox?token=${feed}`, { body: { text: 'nope' } })).status).toBe(401);
    expect(store.parked).toEqual([]);
  });
});

describe('a personal access token', () => {
  it('no longer opens the feed, and is answered exactly like a made-up token', async () => {
    const personal = await makePersonalToken('alex');
    store.blocks = [block('u-alex', 'Essay outline', 2)];

    const old = await call('GET', `/calendar/${personal}.ics`);
    const madeUpPersonal = await call('GET', '/calendar/fgpat_not-a-real-token.ics');
    const madeUpFeed = await call('GET', '/calendar/fgcal_not-a-real-token.ics');
    const nonsense = await call('GET', '/calendar/anything.ics');

    for (const r of [old, madeUpPersonal, madeUpFeed, nonsense]) {
      expect(r.status).toBe(404);
      expect(r.text).toBe('Not found');
      expect(r.type).toBe(old.type);
    }
    expect(store.calls).not.toContain('scheduleBlock.findMany');
  });

  it('is remembered when an old link asks, at most once a day, until the token is replaced', async () => {
    const personal = await makePersonalToken('alex');
    const alex = store.users[0]!;

    // A made-up token is nobody's old link.
    await call('GET', '/calendar/fgpat_not-a-real-token.ics');
    expect(alex.oldFeedLinkSeenAt).toBeNull();

    await call('GET', `/calendar/${personal}.ics`);
    const seen = alex.oldFeedLinkSeenAt!;
    expect(Date.now() - seen.getTime()).toBeLessThan(5000);
    expect((await call('GET', '/integrations', { as: 'alex' })).json!.data.oldFeedLinkSeenAt).toBe(seen.toISOString());

    // A calendar app asks every few minutes; that is not a write every time.
    store.calls = [];
    await call('GET', `/calendar/${personal}.ics`);
    expect(store.calls).toEqual(['user.findUnique']);
    alex.oldFeedLinkSeenAt = new Date(Date.now() - 25 * 3_600_000);
    await call('GET', `/calendar/${personal}.ics`);
    expect(Date.now() - alex.oldFeedLinkSeenAt.getTime()).toBeLessThan(5000);

    // A new personal token makes the old link worthless, which is what the notice was for.
    await makePersonalToken('alex');
    expect(alex.oldFeedLinkSeenAt).toBeNull();
    await call('GET', `/calendar/${personal}.ics`);
    expect(alex.oldFeedLinkSeenAt).toBeNull();
  });

  it('forgets the old link when the token is turned off as well', async () => {
    const personal = await makePersonalToken('alex');
    await call('GET', `/calendar/${personal}.ics`);
    expect(store.users[0]!.oldFeedLinkSeenAt).not.toBeNull();
    await call('DELETE', '/integrations/token', { as: 'alex' });
    expect(store.users[0]).toMatchObject({ personalTokenHash: null, oldFeedLinkSeenAt: null });
  });

  it('answers the same 404 when the note cannot be written', async () => {
    const personal = await makePersonalToken('alex');
    const update = known['user.update']!;
    known['user.update'] = () => {
      throw new Error('database is away');
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = await call('GET', `/calendar/${personal}.ics`);
      expect(r.status).toBe(404);
      expect(r.text).toBe('Not found');
      expect(error).toHaveBeenCalled();
    } finally {
      known['user.update'] = update;
      error.mockRestore();
    }
  });

  it('still works for the inbox and the API', async () => {
    const personal = await makePersonalToken('alex');
    expect((await call('POST', '/inbox', { bearer: personal, body: { text: 'Reply to Ms. Chen' } })).status).toBe(201);
    expect((await call('POST', `/inbox?token=${personal}`, { body: { text: 'Second line' } })).status).toBe(201);
    expect(store.parked).toEqual(['Reply to Ms. Chen', 'Second line']);
    expect((await call('GET', '/integrations', { bearer: personal })).json!.data.tokenEnabled).toBe(true);
  });
});

describe('what leaves the server', () => {
  it('never returns either token hash on the member record', async () => {
    await makeFeedToken('alex');
    const personal = await makePersonalToken('alex');
    await call('GET', `/calendar/${personal}.ics`);
    const me = (await call('GET', '/users/alex', { as: 'alex' })).json!.data;
    expect(me.clerkId).toBe('alex');
    expect(Object.keys(me)).not.toEqual(expect.arrayContaining(['calendarFeedTokenHash']));
    expect(Object.keys(me)).not.toEqual(expect.arrayContaining(['personalTokenHash']));
    expect(Object.keys(me)).not.toEqual(expect.arrayContaining(['oldFeedLinkSeenAt']));
  });

  it('prints neither token in the request log', async () => {
    const feed = await makeFeedToken('alex');
    const personal = await makePersonalToken('alex');
    logged.length = 0;

    await call('GET', `/calendar/${feed}.ics`);
    await call('GET', `/calendar/${personal}.ics`);
    await call('POST', `/inbox?token=${personal}&source=teams`, { body: { text: 'From Teams' } });

    expect(logged).toEqual([
      '<-- GET /calendar/[redacted].ics',
      expect.stringMatching(/^--> GET \/calendar\/\[redacted\]\.ics 200 \d+ms$/),
      '<-- GET /calendar/[redacted].ics',
      expect.stringMatching(/^--> GET \/calendar\/\[redacted\]\.ics 404 \d+ms$/),
      '<-- POST /inbox?token=[redacted]&source=teams',
      expect.stringMatching(/^--> POST \/inbox\?token=\[redacted\]&source=teams 201 \d+ms$/),
    ]);
    const all = logged.join('\n');
    expect(all).not.toContain(feed);
    expect(all).not.toContain(personal);
    expect(all).not.toContain(feed.slice('fgcal_'.length));
    expect(all).not.toContain(personal.slice('fgpat_'.length));
  });
});
