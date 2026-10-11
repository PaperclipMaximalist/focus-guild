/**
 * Your AI: the providers a person has connected with their own API key.
 *
 *   GET    /ai                               providers, connections, which one is in use
 *   POST   /ai/connections                   { provider, apiKey, baseUrl? } → check the key, store it sealed
 *   GET    /ai/connections/:provider/models  what that provider offers
 *   PATCH  /ai/connections/:provider         { model?, isDefault? }
 *   DELETE /ai/connections/:provider
 *   POST   /ai/connections/:provider/test    one tiny question, to prove key, model and billing
 *   POST   /ai/manifest                      { notes, guide } → a quest manifest written by the AI in use
 *
 * A key comes in once, over HTTPS, is sealed (`lib/secretBox.ts`) and is never
 * sent back: a connection is described by its provider, model and the last
 * four characters of the key. The adapters are `lib/aiProviders.ts`; choosing
 * which AI answers is `lib/ai.ts`.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { logActivity } from '../lib/activity.js';
import { AI_ENABLED, AI_MODEL, aiFailure, completeFor, describeConnection, pickActive, unseal } from '../lib/ai.js';
import { AiError, complete, listModels, normaliseBaseUrl, pickDefaultModel, providerById, publicProviders } from '../lib/aiProviders.js';
import { hintOf, seal, sealingSecret } from '../lib/secretBox.js';

export const ai = new Hono();

const bad = (message: string, code = 'BAD_REQUEST') => ({ success: false as const, error: { code, message } });
const notFound = { success: false as const, error: { code: 'NOT_FOUND', message: 'That AI is not connected.' } };

type Row = Awaited<ReturnType<typeof db.aiConnection.findFirst>> & object;

/** A connection as a browser may see it: no key, sealed or otherwise. */
const publicConnection = (r: Row, activeId: string | null) => ({
  provider: r.provider,
  model: r.model,
  keyHint: r.keyHint,
  baseUrl: r.baseUrl,
  inUse: r.id === activeId,
  lastUsedAt: r.lastUsedAt,
  lastError: r.lastError,
  createdAt: r.createdAt,
});

async function stateFor(userId: string) {
  const rows = await db.aiConnection.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const active = pickActive(rows);
  return {
    providers: publicProviders(),
    connections: rows.map((r) => publicConnection(r, active?.id ?? null)),
    /** The server has a Claude key of its own, used when nothing is connected. */
    builtIn: AI_ENABLED ? describeConnection({ provider: 'anthropic', model: AI_MODEL }) : null,
    /** Who answers right now, in words; null when no AI feature can run. */
    inUse: active ? describeConnection(active) : AI_ENABLED ? `${describeConnection({ provider: 'anthropic', model: AI_MODEL })} (the server's own key)` : null,
  };
}

ai.get('/', async (c) => c.json({ success: true, data: await stateFor(c.get('user').id) }));

const ConnectSchema = z.object({
  provider: z.string().min(1).max(40),
  apiKey: z.string().trim().min(8).max(400),
  baseUrl: z.string().trim().max(300).optional(),
});

ai.post('/connections', async (c) => {
  const user = c.get('user');
  const parsed = ConnectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad('Paste the whole key.'), 400);
  const provider = providerById(parsed.data.provider);
  if (!provider) return c.json(bad('That is not a provider the Guild knows.'), 400);
  if (/\s/.test(parsed.data.apiKey)) return c.json(bad('A key has no spaces in it. Copy it again.'), 400);

  let baseUrl: string | null = null;
  if (provider.id === 'custom') {
    const norm = normaliseBaseUrl(parsed.data.baseUrl ?? '');
    if ('error' in norm) return c.json(bad(`The address: ${norm.error}`), 400);
    baseUrl = norm.url;
  }
  const secret = sealingSecret();
  if (!secret) return c.json(bad('This server has nothing to seal keys with. Set AI_KEYS_SECRET on it.', 'AI_KEYS_SECRET_MISSING'), 503);

  // Asking what the provider offers is the check: a wrong key fails here and is never stored.
  let models: string[];
  try {
    models = await listModels({ provider: provider.id, apiKey: parsed.data.apiKey, baseUrl });
  } catch (e) {
    const { body, status } = aiFailure(e);
    return c.json(body, status);
  }

  const existing = await db.aiConnection.findUnique({ where: { userId_provider: { userId: user.id, provider: provider.id } } });
  const keepModel = existing && (models.length === 0 || models.includes(existing.model)) ? existing.model : null;
  const model = keepModel ?? pickDefaultModel(provider.id, models);
  if (!model) return c.json(bad(`${provider.company} accepted the key but listed no models to use.`), 400);

  const first = (await db.aiConnection.count({ where: { userId: user.id } })) === 0;
  const data = { keySealed: seal(parsed.data.apiKey, secret), keyHint: hintOf(parsed.data.apiKey), model, baseUrl, lastError: null };
  await db.aiConnection.upsert({
    where: { userId_provider: { userId: user.id, provider: provider.id } },
    create: { userId: user.id, provider: provider.id, isDefault: first, ...data },
    update: data,
  });
  void logActivity(user.id, 'ai.connected', `Connected ${provider.name} as an AI (${model})`);
  return c.json({ success: true, data: { ...(await stateFor(user.id)), models, provider: provider.id } }, 201);
});

async function rowOf(userId: string, provider: string): Promise<Row | null> {
  return db.aiConnection.findUnique({ where: { userId_provider: { userId, provider } } });
}

ai.get('/connections/:provider/models', async (c) => {
  const row = await rowOf(c.get('user').id, c.req.param('provider'));
  if (!row) return c.json(notFound, 404);
  try {
    return c.json({ success: true, data: { models: await listModels(unseal(row)) } });
  } catch (e) {
    const { body, status } = aiFailure(e);
    return c.json(body, status);
  }
});

const PatchSchema = z.object({
  model: z.string().trim().min(1).max(120).optional(),
  isDefault: z.literal(true).optional(),
});

ai.patch('/connections/:provider', async (c) => {
  const user = c.get('user');
  const row = await rowOf(user.id, c.req.param('provider'));
  if (!row) return c.json(notFound, 404);
  const parsed = PatchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad('Give a model name, or isDefault: true.'), 400);
  const { model, isDefault } = parsed.data;
  await db.$transaction([
    ...(isDefault ? [db.aiConnection.updateMany({ where: { userId: user.id, id: { not: row.id } }, data: { isDefault: false } })] : []),
    db.aiConnection.update({
      where: { id: row.id },
      data: { ...(model ? { model, lastError: null } : {}), ...(isDefault ? { isDefault: true } : {}) },
    }),
  ]);
  return c.json({ success: true, data: await stateFor(user.id) });
});

ai.delete('/connections/:provider', async (c) => {
  const user = c.get('user');
  const row = await rowOf(user.id, c.req.param('provider'));
  if (!row) return c.json(notFound, 404);
  await db.aiConnection.delete({ where: { id: row.id } });
  void logActivity(user.id, 'ai.removed', `Removed ${providerById(row.provider)?.name ?? row.provider} as an AI`);
  return c.json({ success: true, data: await stateFor(user.id) });
});

ai.post('/connections/:provider/test', async (c) => {
  const row = await rowOf(c.get('user').id, c.req.param('provider'));
  if (!row) return c.json(notFound, 404);
  const started = Date.now();
  try {
    const conn = unseal(row);
    const reply = await complete(conn, { prompt: 'Reply with the single word: ready' });
    await db.aiConnection.update({ where: { id: row.id }, data: { lastUsedAt: new Date(), lastError: null } });
    return c.json({ success: true, data: { ok: true, reply: reply.slice(0, 80), ms: Date.now() - started, via: describeConnection(conn) } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.aiConnection.update({ where: { id: row.id }, data: { lastError: message.slice(0, 300) } }).catch(() => undefined);
    // The test ran; what it found is the answer, not a failure of this route.
    return c.json({ success: true, data: { ok: false, error: message, code: e instanceof AiError ? e.code : 'AI_ERROR', ms: Date.now() - started } });
  }
});

const ManifestSchema = z.object({
  /** What the person wrote: a list, a syllabus, a brain-dump. */
  notes: z.string().trim().min(3).max(20_000),
  /** The format, as the client's `manifestGuide()` writes it: dated, in the person's own timezone. */
  guide: z.string().trim().min(200).max(8_000),
});

ai.post('/manifest', async (c) => {
  const user = c.get('user');
  const parsed = ManifestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad('Write a few words about what needs doing (up to 20,000 characters).'), 400);
  try {
    const { text, via } = await completeFor(user.id, { system: parsed.data.guide, prompt: parsed.data.notes });
    void logActivity(user.id, 'ai.manifest', `Asked ${via.split(' · ')[0]} to write a quest list from notes`, { data: { chars: parsed.data.notes.length } });
    return c.json({ success: true, data: { text, via } });
  } catch (e) {
    const { body, status } = aiFailure(e);
    return c.json(body, status);
  }
});
