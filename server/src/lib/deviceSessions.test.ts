/**
 * Device sign-in: the PKCE check, and the exchange of a one-time code against
 * a stand-in for the database. What matters most is what never happens: a
 * code works twice, works late, works without its verifier, or is spent by
 * someone who only has the code.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Link = { id: string; userId: string; codeHash: string; challenge: string; name: string; expiresAt: Date; usedAt: Date | null; createdAt: Date };
type Session = { id: string; userId: string; tokenHash: string; name: string; createdAt: Date; lastUsedAt: Date };
const store: { links: Link[]; sessions: Session[]; n: number } = { links: [], sessions: [], n: 0 };

const matchesDate = (v: Date | null, cond: unknown): boolean => {
  if (cond === null) return v === null;
  if (cond && typeof cond === 'object') {
    const c = cond as { lte?: Date; gt?: Date; not?: null };
    if ('not' in c) return v !== null;
    if (c.lte) return v !== null && v.getTime() <= c.lte.getTime();
    if (c.gt) return v !== null && v.getTime() > c.gt.getTime();
  }
  return false;
};

vi.mock('../db/client.js', () => ({
  db: {
    deviceLink: {
      deleteMany: async ({ where }: { where: { OR: Array<Record<string, unknown>> } }) => {
        const dead = (l: Link) => where.OR.some((w) => ('expiresAt' in w ? matchesDate(l.expiresAt, w['expiresAt']) : matchesDate(l.usedAt, w['usedAt'])));
        const before = store.links.length;
        store.links = store.links.filter((l) => !dead(l));
        return { count: before - store.links.length };
      },
      create: async ({ data }: { data: Omit<Link, 'id' | 'usedAt' | 'createdAt'> }) => {
        store.n += 1;
        const row = { ...data, id: `l${store.n}`, usedAt: null, createdAt: new Date() };
        store.links.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { codeHash: string } }) => {
        const l = store.links.find((x) => x.codeHash === where.codeHash);
        return l ? { ...l, user: { clerkId: `clerk-${l.userId}` } } : null;
      },
      // One synchronous pass, as one UPDATE … WHERE is in Postgres.
      updateMany: async ({ where, data }: { where: { id: string; usedAt: null; expiresAt: { gt: Date } }; data: { usedAt: Date } }) => {
        const hit = store.links.filter((l) => l.id === where.id && l.usedAt === null && matchesDate(l.expiresAt, where.expiresAt));
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
      updateMany: async ({ where, data }: { where: { id: string; lastUsedAt: { lte: Date } }; data: { lastUsedAt: Date } }) => {
        const hit = store.sessions.filter((s) => s.id === where.id && matchesDate(s.lastUsedAt, where.lastUsedAt));
        for (const s of hit) s.lastUsedAt = data.lastUsedAt;
        return { count: hit.length };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const s = store.sessions.find((x) => x.tokenHash === where.tokenHash);
        return s ? { ...s, user: { id: s.userId } } : null;
      },
      deleteMany: async ({ where }: { where: { id?: string; lastUsedAt: { lte: Date } } }) => {
        const gone = (s: Session) => (where.id === undefined || s.id === where.id) && matchesDate(s.lastUsedAt, where.lastUsedAt);
        const before = store.sessions.length;
        store.sessions = store.sessions.filter((s) => !gone(s));
        return { count: before - store.sessions.length };
      },
    },
  },
}));

const {
  CHALLENGE_RE,
  DEVICE_PREFIX,
  LINK_TTL_SEC,
  challengeFor,
  createLink,
  exchangeCode,
  findLiveDeviceSession,
  lastUsedIsStale,
  sessionIsIdle,
  SESSION_IDLE_DAYS,
  linkIsLive,
  newDeviceToken,
  newLinkCode,
  sha256Hex,
  touchDeviceSession,
  verifierMatches,
} = await import('./deviceSessions.js');

// RFC 7636, appendix B: the verifier is the base64url of these 32 octets.
const RFC_OCTETS = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121];
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const OTHER_VERIFIER = 'x'.repeat(43);

beforeEach(() => {
  store.links = [];
  store.sessions = [];
  store.n = 0;
});

describe('the PKCE check', () => {
  it('matches the RFC 7636 appendix B example', () => {
    expect(Buffer.from(RFC_OCTETS).toString('base64url')).toBe(RFC_VERIFIER);
    expect(challengeFor(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
    expect(verifierMatches(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
  });

  it('refuses any other verifier, and malformed ones without hashing them', () => {
    expect(verifierMatches(OTHER_VERIFIER, RFC_CHALLENGE)).toBe(false);
    expect(verifierMatches(RFC_VERIFIER.slice(0, 42), RFC_CHALLENGE)).toBe(false); // too short
    expect(verifierMatches(`${RFC_VERIFIER}!`, RFC_CHALLENGE)).toBe(false); // not unreserved
    expect(verifierMatches('a'.repeat(129), challengeFor('a'.repeat(129)))).toBe(false); // too long
    expect(verifierMatches(RFC_VERIFIER, `${RFC_CHALLENGE}=`)).toBe(false); // padded
  });

  it('accepts the whole verifier alphabet up to 128 characters', () => {
    const v = 'Az09._~-'.repeat(16);
    expect(v).toHaveLength(128);
    expect(verifierMatches(v, challengeFor(v))).toBe(true);
  });

  it('makes challenges of exactly 43 base64url characters', () => {
    expect(CHALLENGE_RE.test(challengeFor('y'.repeat(60)))).toBe(true);
    expect(CHALLENGE_RE.test(RFC_CHALLENGE.slice(1))).toBe(false);
  });
});

describe('codes and tokens', () => {
  it('are 32 random bytes, base64url; a token carries its prefix', () => {
    expect(newLinkCode()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newDeviceToken()).toMatch(new RegExp(`^${DEVICE_PREFIX}[A-Za-z0-9_-]{43}$`));
    expect(newLinkCode()).not.toBe(newLinkCode());
  });

  it('a code is live until it is used or its time is up', () => {
    const now = new Date('2026-11-13T10:00:00Z');
    const later = new Date(now.getTime() + 1);
    expect(linkIsLive({ usedAt: null, expiresAt: later }, now)).toBe(true);
    expect(linkIsLive({ usedAt: null, expiresAt: now }, now)).toBe(false);
    expect(linkIsLive({ usedAt: now, expiresAt: later }, now)).toBe(false);
  });

  it('lastUsedAt goes stale after an hour, not before', () => {
    const now = new Date('2026-11-13T10:00:00Z');
    expect(lastUsedIsStale(new Date(now.getTime() - 59 * 60_000), now)).toBe(false);
    expect(lastUsedIsStale(new Date(now.getTime() - 60 * 60_000), now)).toBe(true);
  });
});

describe('createLink', () => {
  it('stores only the hash of the code, for two minutes', async () => {
    const now = new Date('2026-11-13T10:00:00Z');
    const { code, expiresInSec } = await createLink('u1', RFC_CHALLENGE, 'iPhone', now);
    expect(expiresInSec).toBe(120);
    expect(store.links).toHaveLength(1);
    expect(JSON.stringify(store.links)).not.toContain(code);
    expect(store.links[0]).toMatchObject({ codeHash: sha256Hex(code), challenge: RFC_CHALLENGE, userId: 'u1' });
    expect(store.links[0]!.expiresAt.getTime() - now.getTime()).toBe(LINK_TTL_SEC * 1000);
  });

  it('clears out codes that can no longer be spent, and keeps live ones', async () => {
    const now = new Date('2026-11-13T10:00:00Z');
    await createLink('u1', RFC_CHALLENGE, 'old', new Date(now.getTime() - 121_000));
    const { code } = await createLink('u2', RFC_CHALLENGE, 'used', now);
    await exchangeCode(code, RFC_VERIFIER, now);
    await createLink('u3', RFC_CHALLENGE, 'live', now);
    await createLink('u4', RFC_CHALLENGE, 'new', new Date(now.getTime() + 1000));
    expect(store.links.map((l) => l.name)).toEqual(['live', 'new']);
  });
});

describe('exchangeCode', () => {
  const now = new Date('2026-11-13T10:00:00Z');

  it('trades a code and its verifier for a device token, stored only as a hash', async () => {
    const { code } = await createLink('u1', RFC_CHALLENGE, 'Alex’s iPhone', now);
    const r = await exchangeCode(code, RFC_VERIFIER, now);
    expect(r).toMatchObject({ clerkId: 'clerk-u1', deviceId: store.sessions[0]!.id });
    expect(r!.token.startsWith(DEVICE_PREFIX)).toBe(true);
    expect(JSON.stringify(store.sessions)).not.toContain(r!.token);
    expect(store.sessions[0]).toMatchObject({ userId: 'u1', name: 'Alex’s iPhone', tokenHash: sha256Hex(r!.token) });
  });

  it('works once', async () => {
    const { code } = await createLink('u1', RFC_CHALLENGE, 'iPhone', now);
    expect(await exchangeCode(code, RFC_VERIFIER, now)).not.toBeNull();
    expect(await exchangeCode(code, RFC_VERIFIER, now)).toBeNull();
    expect(store.sessions).toHaveLength(1);
  });

  it('lets only one of two simultaneous exchanges win', async () => {
    const { code } = await createLink('u1', RFC_CHALLENGE, 'iPhone', now);
    const results = await Promise.all([exchangeCode(code, RFC_VERIFIER, now), exchangeCode(code, RFC_VERIFIER, now)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(store.sessions).toHaveLength(1);
  });

  it('refuses a code after two minutes', async () => {
    const { code } = await createLink('u1', RFC_CHALLENGE, 'iPhone', now);
    expect(await exchangeCode(code, RFC_VERIFIER, new Date(now.getTime() + 120_000))).toBeNull();
    expect(await exchangeCode(code, RFC_VERIFIER, new Date(now.getTime() + 119_000))).not.toBeNull();
  });

  it('refuses the code alone, and a wrong verifier does not spend it', async () => {
    const { code } = await createLink('u1', RFC_CHALLENGE, 'iPhone', now);
    expect(await exchangeCode(code, OTHER_VERIFIER, now)).toBeNull();
    expect(store.links[0]!.usedAt).toBeNull();
    expect(await exchangeCode(code, RFC_VERIFIER, now)).not.toBeNull();
  });

  it('refuses an unknown code', async () => {
    await createLink('u1', RFC_CHALLENGE, 'iPhone', now);
    expect(await exchangeCode(newLinkCode(), RFC_VERIFIER, now)).toBeNull();
  });
});

describe('sign-ins that end by themselves', () => {
  const DAY = 24 * 60 * 60_000;
  const HOUR = 60 * 60_000;
  const now = new Date('2026-11-13T10:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const session = (id: string, lastUsedAt: Date, tokenHash = `h-${id}`): Session => ({
    id, userId: 'u1', tokenHash, name: 'iPhone', createdAt: ago(400 * DAY), lastUsedAt,
  });

  it('end after 180 days and the hour lastUsedAt can lag, not a moment before', () => {
    expect(SESSION_IDLE_DAYS).toBe(180);
    const limit = SESSION_IDLE_DAYS * DAY + HOUR;
    expect(sessionIsIdle(ago(limit - 1), now)).toBe(false);
    expect(sessionIsIdle(ago(limit), now)).toBe(true);
    expect(sessionIsIdle(ago(limit + 1), now)).toBe(true);
    // Last used 179 days and 23 hours ago by lastUsedAt: could really be under 180 days.
    expect(sessionIsIdle(ago(180 * DAY), now)).toBe(false);
    expect(sessionIsIdle(now, now)).toBe(false);
    // A clock that says the future (a skewed write) is not idle.
    expect(sessionIsIdle(new Date(now.getTime() + DAY), now)).toBe(false);
  });

  it('an idle session is refused like an unknown token, and deleted', async () => {
    const token = newDeviceToken();
    store.sessions.push(session('d1', ago(181 * DAY), sha256Hex(token)));
    expect(await findLiveDeviceSession(token, now)).toBeNull();
    expect(store.sessions).toHaveLength(0);
    // And it stays gone.
    expect(await findLiveDeviceSession(token, now)).toBeNull();
  });

  it('a session used within 180 days still works and is kept', async () => {
    const token = newDeviceToken();
    store.sessions.push(session('d1', ago(179 * DAY), sha256Hex(token)));
    expect(await findLiveDeviceSession(token, now)).toMatchObject({ id: 'd1', user: { id: 'u1' } });
    expect(store.sessions).toHaveLength(1);
  });

  it('an unknown token finds nothing and deletes nothing', async () => {
    store.sessions.push(session('d1', ago(200 * DAY)));
    expect(await findLiveDeviceSession(newDeviceToken(), now)).toBeNull();
    expect(store.sessions).toHaveLength(1);
  });

  it('are swept with the dead link codes when a new code is made', async () => {
    store.sessions.push(session('old', ago(181 * DAY)), session('edge', ago(180 * DAY)), session('fresh', ago(HOUR)));
    await createLink('u2', RFC_CHALLENGE, 'iPhone', now);
    expect(store.sessions.map((s) => s.id)).toEqual(['edge', 'fresh']);
  });
});

describe('touchDeviceSession', () => {
  it('writes lastUsedAt only when it is an hour old', async () => {
    const t0 = new Date('2026-11-13T10:00:00Z');
    store.sessions.push({ id: 'd1', userId: 'u1', tokenHash: 'h', name: 'iPhone', createdAt: t0, lastUsedAt: t0 });
    await touchDeviceSession('d1', new Date(t0.getTime() + 30 * 60_000));
    expect(store.sessions[0]!.lastUsedAt).toEqual(t0);
    const t1 = new Date(t0.getTime() + 61 * 60_000);
    await touchDeviceSession('d1', t1);
    expect(store.sessions[0]!.lastUsedAt).toEqual(t1);
  });
});
