/**
 * The Your AI routes, end to end, against a stand-in for the database and for
 * the providers. What matters most here is what never happens: a key is never
 * stored as typed and never sent back.
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'sk-test-0123456789abcdefWXYZ';

type Row = Record<string, unknown> & { id: string; userId: string; provider: string; isDefault: boolean; createdAt: Date };
const store: { rows: Row[]; activity: string[]; n: number } = { rows: [], activity: [], n: 0 };
const provider = { models: ['gpt-5', 'gpt-5-mini'] as string[], fail: null as Error | null, asked: [] as Array<Record<string, unknown>> };

vi.mock('../db/client.js', () => {
  const byUserProvider = (w: { userId_provider: { userId: string; provider: string } }) =>
    store.rows.find((r) => r.userId === w.userId_provider.userId && r.provider === w.userId_provider.provider) ?? null;
  const aiConnection = {
    findMany: async ({ where }: { where: { userId: string } }) => store.rows.filter((r) => r.userId === where.userId),
    findUnique: async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) => byUserProvider(where),
    count: async ({ where }: { where: { userId: string } }) => store.rows.filter((r) => r.userId === where.userId).length,
    upsert: async ({ where, create, update }: { where: { userId_provider: { userId: string; provider: string } }; create: Row; update: Partial<Row> }) => {
      const found = byUserProvider(where);
      if (found) return Object.assign(found, update);
      store.n += 1;
      const row = { lastUsedAt: null, lastError: null, ...create, id: `c${store.n}`, createdAt: new Date(Date.UTC(2026, 9, 1, 0, store.n)) } as Row;
      store.rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(store.rows.find((r) => r.id === where.id)!, data),
    updateMany: async ({ where, data }: { where: { userId: string; id: { not: string } }; data: Partial<Row> }) => {
      for (const r of store.rows) if (r.userId === where.userId && r.id !== where.id.not) Object.assign(r, data);
    },
    delete: async ({ where }: { where: { id: string } }) => {
      store.rows = store.rows.filter((r) => r.id !== where.id);
    },
  };
  return {
    db: {
      aiConnection,
      activityEntry: { create: async ({ data }: { data: { line: string } }) => void store.activity.push(data.line) },
      $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
    },
  };
});

vi.mock('../lib/aiProviders.js', async (original) => {
  const real = await original<typeof import('../lib/aiProviders.js')>();
  return {
    ...real,
    listModels: async (conn: Record<string, unknown>) => {
      provider.asked.push({ call: 'models', ...conn });
      if (provider.fail) throw provider.fail;
      return provider.models;
    },
    complete: async (conn: Record<string, unknown>, req: Record<string, unknown>) => {
      provider.asked.push({ call: 'complete', ...conn, ...req });
      if (provider.fail) throw provider.fail;
      return 'ready';
    },
  };
});

process.env['AI_KEYS_SECRET'] = 'a-secret-for-the-test-run-only';
delete process.env['ANTHROPIC_API_KEY'];

const { ai } = await import('./ai.js');
const { AiError } = await import('../lib/aiProviders.js');
const { open } = await import('../lib/secretBox.js');

function appFor(userId: string) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user' as never, { id: userId } as never);
    await next();
  });
  app.route('/ai', ai);
  return async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/ai${path}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
    });
    const text = await res.text();
    return { status: res.status, text, json: JSON.parse(text) as { success: boolean; data?: Record<string, any>; error?: { code: string; message: string } } };
  };
}

const call = appFor('u1');

beforeEach(() => {
  store.rows = [];
  store.activity = [];
  store.n = 0;
  provider.models = ['gpt-5', 'gpt-5-mini'];
  provider.fail = null;
  provider.asked = [];
});

describe('GET /ai', () => {
  it('lists the providers and says no AI is in use when none is connected and the server has no key', async () => {
    const r = await call('GET', '');
    expect(r.status).toBe(200);
    expect(r.json.data!.providers.map((p: { name: string }) => p.name).slice(0, 3)).toEqual(['Claude', 'ChatGPT', 'Gemini']);
    expect(r.json.data!.connections).toEqual([]);
    expect(r.json.data!.inUse).toBeNull();
  });
});

describe('connecting', () => {
  it('checks the key with the provider, stores it sealed, and never sends it back', async () => {
    const r = await call('POST', '/connections', { provider: 'openai', apiKey: `  ${KEY}  ` });
    expect(r.status).toBe(201);
    expect(provider.asked[0]).toMatchObject({ call: 'models', provider: 'openai', apiKey: KEY });

    expect(store.rows).toHaveLength(1);
    const row = store.rows[0]!;
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(open(String(row['keySealed']), process.env['AI_KEYS_SECRET']!)).toBe(KEY);
    expect(row).toMatchObject({ userId: 'u1', provider: 'openai', model: 'gpt-5', keyHint: 'WXYZ', isDefault: true, baseUrl: null });

    expect(r.text).not.toContain(KEY);
    expect(r.text).not.toContain(String(row['keySealed']));
    expect(r.json.data!.models).toEqual(['gpt-5', 'gpt-5-mini']);
    expect(r.json.data!.inUse).toBe('ChatGPT · gpt-5');
    expect(r.json.data!.connections).toEqual([
      expect.objectContaining({ provider: 'openai', model: 'gpt-5', keyHint: 'WXYZ', inUse: true, lastError: null }),
    ]);
    expect(Object.keys(r.json.data!.connections[0]).sort()).toEqual(['baseUrl', 'createdAt', 'inUse', 'keyHint', 'lastError', 'lastUsedAt', 'model', 'provider']);
    expect((await call('GET', '')).text).not.toContain(String(row['keySealed']));
    expect(store.activity).toEqual(['Connected ChatGPT as an AI (gpt-5)']);
  });

  it('stores nothing when the provider turns the key away', async () => {
    provider.fail = new AiError('AI_KEY_REJECTED', 'OpenAI did not accept that key.', 400);
    const r = await call('POST', '/connections', { provider: 'openai', apiKey: KEY });
    expect(r.status).toBe(400);
    expect(r.json.error).toEqual({ code: 'AI_KEY_REJECTED', message: 'OpenAI did not accept that key.' });
    expect(store.rows).toEqual([]);
  });

  it('turns away a key with a space in it, an unknown provider and a custom one with a bad address, before calling anyone', async () => {
    expect((await call('POST', '/connections', { provider: 'openai', apiKey: 'sk-abc def-ghi' })).status).toBe(400);
    expect((await call('POST', '/connections', { provider: 'nope', apiKey: KEY })).status).toBe(400);
    expect((await call('POST', '/connections', { provider: 'openai', apiKey: 'short' })).status).toBe(400);
    expect((await call('POST', '/connections', { provider: 'custom', apiKey: KEY })).status).toBe(400);
    expect((await call('POST', '/connections', { provider: 'custom', apiKey: KEY, baseUrl: 'https://192.168.0.4/v1' })).status).toBe(400);
    expect(provider.asked).toEqual([]);
    expect(store.rows).toEqual([]);
  });

  it('keeps the address of a custom provider, as its API root', async () => {
    provider.models = ['llama-70b'];
    const r = await call('POST', '/connections', { provider: 'custom', apiKey: KEY, baseUrl: 'https://api.groq.com/openai/v1/chat/completions' });
    expect(r.status).toBe(201);
    expect(store.rows[0]).toMatchObject({ baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-70b' });
    expect(provider.asked[0]).toMatchObject({ baseUrl: 'https://api.groq.com/openai/v1' });
  });

  it('replaces the key of a provider already connected, and keeps its model and its place', async () => {
    await call('POST', '/connections', { provider: 'openai', apiKey: KEY });
    await call('PATCH', '/connections/openai', { model: 'gpt-5-mini' });
    const r = await call('POST', '/connections', { provider: 'openai', apiKey: 'sk-test-a-newer-key-0000LMNO' });
    expect(r.status).toBe(201);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ model: 'gpt-5-mini', keyHint: 'LMNO', isDefault: true });
  });

  it('keeps each person to their own connections', async () => {
    await call('POST', '/connections', { provider: 'openai', apiKey: KEY });
    const other = appFor('u2');
    expect((await other('GET', '')).json.data!.connections).toEqual([]);
    expect((await other('DELETE', '/connections/openai')).status).toBe(404);
    expect((await other('POST', '/connections/openai/test')).status).toBe(404);
    expect(store.rows).toHaveLength(1);
  });
});

describe('with two connected', () => {
  beforeEach(async () => {
    await call('POST', '/connections', { provider: 'openai', apiKey: KEY });
    provider.models = ['claude-opus-5-5', 'claude-haiku-5-5'];
    await call('POST', '/connections', { provider: 'anthropic', apiKey: 'sk-ant-test-0123456789QRST' });
    provider.asked = [];
  });

  it('leaves the first one in use until told otherwise', async () => {
    const state = (await call('GET', '')).json.data!;
    expect(state.inUse).toBe('ChatGPT · gpt-5');
    expect(state.connections.map((c: { provider: string; inUse: boolean }) => [c.provider, c.inUse])).toEqual([['openai', true], ['anthropic', false]]);
  });

  it('switches which one the Guild uses, one at a time', async () => {
    const r = await call('PATCH', '/connections/anthropic', { isDefault: true });
    expect(r.json.data!.inUse).toBe('Claude · claude-opus-5-5');
    expect(store.rows.map((x) => [x.provider, x.isDefault])).toEqual([['openai', false], ['anthropic', true]]);
  });

  it('falls back to the other when the one in use is removed', async () => {
    const r = await call('DELETE', '/connections/openai');
    expect(r.json.data!.inUse).toBe('Claude · claude-opus-5-5');
    expect(store.rows.map((x) => x.provider)).toEqual(['anthropic']);
  });

  it('asks one question to test a connection, with its own key and model, and remembers how it went', async () => {
    const ok = await call('POST', '/connections/anthropic/test');
    expect(ok.json.data).toMatchObject({ ok: true, reply: 'ready', via: 'Claude · claude-opus-5-5' });
    expect(provider.asked[0]).toMatchObject({ call: 'complete', provider: 'anthropic', apiKey: 'sk-ant-test-0123456789QRST', model: 'claude-opus-5-5' });
    expect(store.rows[1]!['lastUsedAt']).toBeInstanceOf(Date);

    provider.fail = new AiError('AI_RATE_LIMITED', 'Anthropic is turning requests away for now.');
    const bad = await call('POST', '/connections/anthropic/test');
    expect(bad.status).toBe(200);
    expect(bad.json.data).toMatchObject({ ok: false, code: 'AI_RATE_LIMITED', error: 'Anthropic is turning requests away for now.' });
    expect(store.rows[1]!['lastError']).toBe('Anthropic is turning requests away for now.');
  });

  it('writes a manifest with the AI in use, sending the guide as the system prompt and the notes as the question', async () => {
    const guide = 'You are writing a Focus Guild quest manifest. '.repeat(6);
    const r = await call('POST', '/manifest', { notes: 'chem IA due thursday', guide });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ text: 'ready', via: 'ChatGPT · gpt-5' });
    expect(provider.asked[0]).toMatchObject({ call: 'complete', provider: 'openai', apiKey: KEY, model: 'gpt-5', system: guide.trim(), prompt: 'chem IA due thursday' });
    expect(store.activity.at(-1)).toBe('Asked ChatGPT to write a quest list from notes');
  });

  it('passes a provider failure on in plain words', async () => {
    provider.fail = new AiError('AI_KEY_REJECTED', 'OpenAI did not accept that key.', 400);
    const r = await call('POST', '/manifest', { notes: 'chem IA due thursday', guide: 'x'.repeat(300) });
    expect(r.status).toBe(400);
    expect(r.json.error!.code).toBe('AI_KEY_REJECTED');
  });
});

describe('with nothing connected', () => {
  it('says where to connect one', async () => {
    const r = await call('POST', '/manifest', { notes: 'chem IA due thursday', guide: 'x'.repeat(300) });
    expect(r.status).toBe(503);
    expect(r.json.error!.code).toBe('AI_NOT_CONFIGURED');
    expect(r.json.error!.message).toMatch(/Your AI/);
  });

  it('asks for more than nothing', async () => {
    expect((await call('POST', '/manifest', { notes: ' ', guide: 'x'.repeat(300) })).status).toBe(400);
    expect((await call('POST', '/manifest', { notes: 'n'.repeat(20_001), guide: 'x'.repeat(300) })).status).toBe(400);
  });

  it('says a key can no longer be read when the secret it was sealed under is gone', async () => {
    await call('POST', '/connections', { provider: 'openai', apiKey: KEY });
    process.env['AI_KEYS_SECRET'] = 'a-different-secret-than-before';
    try {
      const r = await call('POST', '/manifest', { notes: 'chem IA due thursday', guide: 'x'.repeat(300) });
      expect(r.status).toBe(400);
      expect(r.json.error!.code).toBe('AI_KEY_UNREADABLE');
      const t = await call('POST', '/connections/openai/test');
      expect(t.json.data).toMatchObject({ ok: false, code: 'AI_KEY_UNREADABLE' });
    } finally {
      process.env['AI_KEYS_SECRET'] = 'a-secret-for-the-test-run-only';
    }
  });
});
