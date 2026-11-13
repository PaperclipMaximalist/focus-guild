/**
 * Delete my account. Three things are checked:
 * - the schema: every table reaches `users` through ON DELETE CASCADE, so
 *   deleting the user row really deletes everything (a new table without it
 *   fails here, not in App Review);
 * - the order and honesty of deleteAccount: data first, a Clerk failure
 *   reported, never thrown after the data is gone;
 * - who may call DELETE /users/me, and the confirmation it needs.
 * The real cascade, row by row, is proven against a database end to end.
 */

import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: { deleted: string[]; failDelete: Error | null; calls: string[] } = { deleted: [], failDelete: null, calls: [] };

vi.mock('../db/client.js', () => ({
  db: {
    user: {
      deleteMany: async ({ where }: { where: { id: string } }) => {
        store.calls.push('db');
        if (store.failDelete) throw store.failDelete;
        store.deleted.push(where.id);
        return { count: 1 };
      },
    },
  },
}));

delete process.env['CLERK_SECRET_KEY'];
const { deleteAccount, clerkIdentityRemover } = await import('./deleteAccount.js');
const { users } = await import('../routes/users.js');

beforeEach(() => {
  store.deleted = [];
  store.failDelete = null;
  store.calls = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the schema', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({ name: name!, body: body! }));

  /** model → the models it belongs to through a cascading relation. */
  const cascadesTo = new Map(
    models.map((m) => [
      m.name,
      [...m.body.matchAll(/^\s+\w+\s+(\w+)\??\s+@relation\(([^)]*)\)/gm)]
        .filter(([, , args]) => /fields:/.test(args!) && /onDelete:\s*Cascade/.test(args!))
        .map(([, target]) => target!),
    ]),
  );

  const reachesUser = (name: string, seen = new Set<string>()): boolean => {
    if (name === 'User') return true;
    if (seen.has(name)) return false;
    seen.add(name);
    return (cascadesTo.get(name) ?? []).some((t) => reachesUser(t, seen));
  };

  it('has every table hang off User by cascade, except the shared achievement catalogue', () => {
    const orphans = models.map((m) => m.name).filter((n) => n !== 'Achievement' && !reachesUser(n));
    expect(orphans).toEqual([]);
    expect(models.length).toBeGreaterThanOrEqual(20);
  });

  it('includes the device tables and the indirect ones', () => {
    expect(cascadesTo.get('DeviceSession')).toContain('User');
    expect(cascadesTo.get('DeviceLink')).toContain('User');
    expect(cascadesTo.get('Reflection')).toEqual(['TrackerItem']);
    expect(reachesUser('Reflection')).toBe(true);
  });
});

describe('deleteAccount', () => {
  const user = { id: 'u1', clerkId: 'user_abc' };

  it('deletes the data, then the sign-in', async () => {
    const remove = vi.fn(async (_id: string) => void store.calls.push('clerk'));
    expect(await deleteAccount(user, remove)).toEqual({ deleted: true, identityRemoved: true });
    expect(store.deleted).toEqual(['u1']);
    expect(remove).toHaveBeenCalledWith('user_abc');
    expect(store.calls).toEqual(['db', 'clerk']);
  });

  it('says so honestly when the sign-in could not be removed, without failing', async () => {
    const remove = vi.fn(async () => {
      throw new Error('Clerk is down');
    });
    expect(await deleteAccount(user, remove)).toEqual({ deleted: true, identityRemoved: false });
    expect(store.deleted).toEqual(['u1']);
    expect(console.error).toHaveBeenCalled();
  });

  it('leaves the sign-in alone when the data could not be deleted', async () => {
    store.failDelete = new Error('database gone');
    const remove = vi.fn(async () => {});
    await expect(deleteAccount(user, remove)).rejects.toThrow('database gone');
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes no identity in dev auth, and says so', async () => {
    expect(clerkIdentityRemover(undefined)).toBeNull();
    expect(await deleteAccount(user, null)).toEqual({ deleted: true, identityRemoved: false });
    expect(store.deleted).toEqual(['u1']);
  });
});

describe('DELETE /users/me', () => {
  function call(kind: string, body: unknown) {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { id: 'u1', clerkId: 'user_abc' } as never);
      c.set('authKind', kind as never);
      await next();
    });
    app.route('/users', users);
    return app
      .request('/users/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, json: (await r.json()) as { data?: unknown; error?: { code: string } } }));
  }

  it.each(['clerk', 'dev', 'device'])('lets a %s sign-in delete the account', async (kind) => {
    const r = await call(kind, { confirm: 'DELETE' });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ deleted: true, identityRemoved: false });
    expect(store.deleted).toEqual(['u1']);
  });

  it('refuses a personal access token', async () => {
    const r = await call('pat', { confirm: 'DELETE' });
    expect(r.status).toBe(403);
    expect(r.json.error!.code).toBe('FORBIDDEN');
    expect(store.deleted).toEqual([]);
  });

  it.each([[{}], [{ confirm: 'delete' }], [{ confirm: true }], ['nope']])('needs { confirm: "DELETE" } exactly (%j)', async (body) => {
    const r = await call('clerk', body);
    expect(r.status).toBe(400);
    expect(r.json.error!.code).toBe('VALIDATION_ERROR');
    expect(store.deleted).toEqual([]);
  });
});
